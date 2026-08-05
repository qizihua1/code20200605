import { prisma } from './prisma'
import { parseWithRule, smartParse } from './parser'
import { logTraceEvent } from './trace'
import { ErrorCodes, maskSensitiveValue } from './errors'
import { updateTaskProgress, markTaskAsFailed, setTaskDegraded } from './task-service'
import { retrieveFile } from './file-storage'

const SKU_VALIDATION_TIMEOUT_MS = 3000

export async function processBatch(jobPayload: {
  task_id: string
  unit_id: string
  batch_index: number
  file_name: string
  rule_id?: string
  storage_key?: string
  start_row: number
  end_row: number
}): Promise<{ success: boolean; processed: number; errors: number }> {
  const { task_id, unit_id, batch_index, file_name, rule_id, storage_key, start_row, end_row } = jobPayload
  
  const task = await prisma.importTask.findUnique({ where: { taskId: task_id } })
  if (!task) {
    console.error(`Task ${task_id} not found`)
    return { success: false, processed: 0, errors: 0 }
  }
  
  const batch = await prisma.importTaskBatch.findUnique({
    where: { taskId_unitId: { taskId: task_id, unitId: unit_id } },
  })
  
  if (!batch) {
    console.error(`Batch ${unit_id} for task ${task_id} not found`)
    return { success: false, processed: 0, errors: 0 }
  }
  
  if (batch.status === 'COMPLETED') {
    console.log(`Batch ${unit_id} already completed, skipping`)
    return { success: true, processed: batch.endRow - batch.startRow + 1, errors: 0 }
  }
  
  const startTime = Date.now()
  const traceId = task.traceId
  
  try {
    await prisma.importTaskBatch.update({
      where: { taskId_unitId: { taskId: task_id, unitId: unit_id } },
      data: {
        status: 'PROCESSING',
        lockedAt: new Date(),
      },
    })
    
    await logTraceEvent(prisma, traceId, 'ImportBatchStarted', 'SUCCESS', `批次 ${unit_id} 开始处理`, task_id, unit_id)
    
    let parseDurationMs = 0
    let ruleDurationMs = 0
    let validateDurationMs = 0
    let insertDurationMs = 0
    
    const parseStart = Date.now()
    let parsedData: any[] = []
    
    if (storage_key) {
      try {
        const fileBuffer = await retrieveFile(storage_key)
        const arrayBuffer = fileBuffer.buffer.slice(fileBuffer.byteOffset, fileBuffer.byteOffset + fileBuffer.byteLength)
        
        if (rule_id) {
          // 有规则：使用规则解析
          const rule = await prisma.parsingRule.findUnique({ where: { id: rule_id } })
          if (rule) {
            const parseResult = parseWithRule(arrayBuffer as ArrayBuffer, rule)
            if (parseResult.success && parseResult.data) {
              parsedData = parseResult.data
            }
          }
        } else {
          // 无规则：使用智能解析
          const parseResult = await smartParse(arrayBuffer as ArrayBuffer, file_name)
          if (parseResult.success && parseResult.data) {
            parsedData = parseResult.data
          }
        }
      } catch (storageError: any) {
        console.error(`Failed to retrieve file from storage:`, storageError)
        await logTraceEvent(prisma, traceId, 'FileRetrievalFailed', 'WARNING', 
          `文件获取失败，跳过解析: ${storageError.message}`, task_id, unit_id)
      }
    }
    
    parseDurationMs = Date.now() - parseStart
    
    const ruleStart = Date.now()
    const batchData = parsedData.slice(start_row - 1, end_row)
    ruleDurationMs = Date.now() - ruleStart
    
    const validateStart = Date.now()
    const { validItems, hardErrors, softWarnings, degraded } = await validateBatchData(batchData, task_id, unit_id, batch_index, traceId)
    validateDurationMs = Date.now() - validateStart
    
    if (degraded && !task.degraded) {
      await setTaskDegraded(task_id)
    }
    
    const insertStart = Date.now()
    const { insertedCount, dbErrorCount } = await batchInsertShipments(validItems, hardErrors, task_id, unit_id, batch_index, traceId)
    insertDurationMs = Date.now() - insertStart
    
    const totalDurationMs = Date.now() - startTime
    
    await prisma.batchPerformanceLog.upsert({
      where: { taskId_unitId: { taskId: task_id, unitId: unit_id } },
      update: {
        parseDurationMs,
        ruleDurationMs,
        validateDurationMs,
        insertDurationMs,
        totalDurationMs,
        status: 'COMPLETED',
      },
      create: {
        taskId: task_id,
        unitId: unit_id,
        batchIndex: batch_index,
        parseDurationMs,
        ruleDurationMs,
        validateDurationMs,
        insertDurationMs,
        totalDurationMs,
        status: 'COMPLETED',
        traceId,
      },
    })
    
    await logTraceEvent(prisma, traceId, 'ImportBatchSucceeded', 'SUCCESS', 
      `批次 ${unit_id} 完成，耗时 ${totalDurationMs}ms`, task_id, unit_id)
    
    // 失败行数仅计算硬校验错误+数据库错误，软警告不计入失败
    const hardErrorCount = hardErrors.length
    const softWarningCount = softWarnings.length
    const failedCount = hardErrorCount + dbErrorCount
    const successCount = batchData.length - failedCount
    console.log(`批次 ${unit_id} 结果: 总${batchData.length}, 成功${successCount}, 硬错误${hardErrorCount}, 数据库错误${dbErrorCount}, 软警告${softWarningCount}`)
    
    await updateTaskProgress(task_id, unit_id, batchData.length, successCount, failedCount)
    
    await checkAndCompleteTask(task_id)
    
    return { success: true, processed: batchData.length, errors: failedCount }
    
  } catch (error: any) {
    console.error(`Batch ${unit_id} processing failed:`, error)
    
    await prisma.importTaskBatch.update({
      where: { taskId_unitId: { taskId: task_id, unitId: unit_id } },
      data: {
        status: 'FAILED',
        retryCount: { increment: 1 },
        completedAt: new Date(),
      },
    })
    
    await logTraceEvent(prisma, traceId, 'ImportBatchFailed', 'FAILED', 
      `批次 ${unit_id} 失败: ${error.message}`, task_id, unit_id)
    
    await prisma.batchPerformanceLog.create({
      data: {
        taskId: task_id,
        unitId: unit_id,
        batchIndex: batch_index,
        parseDurationMs: 0,
        ruleDurationMs: 0,
        validateDurationMs: 0,
        insertDurationMs: 0,
        totalDurationMs: Date.now() - startTime,
        status: 'FAILED',
        traceId,
      },
    })
    
    await updateTaskProgress(task_id, unit_id, 0, 0, 1)
    
    return { success: false, processed: 0, errors: 0 }
  }
}

async function validateBatchData(
  data: any[],
  taskId: string,
  unitId: string,
  batchIndex: number,
  traceId: string
): Promise<{ validItems: any[]; hardErrors: any[]; softWarnings: any[]; degraded: boolean }> {
  const validItems: any[] = []
  const hardErrors: any[] = []
  const softWarnings: any[] = []
  let degraded = false
  
  const uniqueSkus = new Set<string>()
  
  for (let i = 0; i < data.length; i++) {
    const item = data[i]
    const rowNumber = batchIndex * 1000 + i + 1
    const itemErrors: any[] = []
    
    if (!item.skuCode) {
      itemErrors.push({
        rowNumber,
        fieldName: 'skuCode',
        errorCode: ErrorCodes.REQUIRED_FIELD_MISSING,
        errorReason: 'SKU编码不能为空',
        rawValue: '',
      })
    } else {
      uniqueSkus.add(item.skuCode)
    }
    
    if (!item.skuName) {
      itemErrors.push({
        rowNumber,
        fieldName: 'skuName',
        errorCode: ErrorCodes.REQUIRED_FIELD_MISSING,
        errorReason: 'SKU名称不能为空',
        rawValue: item.skuName || '',
      })
    }
    
    if (!item.quantity || item.quantity <= 0) {
      itemErrors.push({
        rowNumber,
        fieldName: 'quantity',
        errorCode: ErrorCodes.INVALID_QUANTITY,
        errorReason: '数量必须为正数',
        rawValue: String(item.quantity || ''),
      })
    }
    
    if (item.recipientPhone) {
      const phoneRegex = /^1[3-9]\d{9}$/
      if (!phoneRegex.test(item.recipientPhone)) {
        itemErrors.push({
          rowNumber,
          fieldName: 'recipientPhone',
          errorCode: ErrorCodes.INVALID_PHONE_FORMAT,
          errorReason: '电话号码格式不正确',
          rawValue: maskSensitiveValue(item.recipientPhone, 'recipientPhone'),
        })
      }
    }
    
    if (itemErrors.length === 0) {
      validItems.push({ ...item, rowNumber })
    } else {
      for (const err of itemErrors) {
        hardErrors.push({
          taskId,
          unitId,
          batchIndex,
          rowNumber: err.rowNumber,
          fieldName: err.fieldName,
          errorCode: err.errorCode,
          errorReason: err.errorReason,
          rawValue: err.rawValue,
          traceId,
        })
      }
    }
  }
  
  try {
    const skuCodes = Array.from(uniqueSkus)
    if (skuCodes.length > 0) {
      const skuValidationStart = Date.now()
      
      const skuPromises = skuCodes.map(skuCode => 
        prisma.skuMaster.findUnique({ where: { skuCode } })
      )
      
      const results = await Promise.all(skuPromises)
      
      const skuValidationDuration = Date.now() - skuValidationStart
      console.log(`SKU validation took ${skuValidationDuration}ms for ${skuCodes.length} SKUs`)
      
      const validSkuCodes = new Set(
        results.filter(r => r !== null).map(r => r!.skuCode)
      )
      
      // SKU 主数据软校验：记录警告但不阻塞写入
      for (const item of validItems) {
        if (item.skuCode && !validSkuCodes.has(item.skuCode)) {
          softWarnings.push({
            taskId,
            unitId,
            batchIndex,
            rowNumber: item.rowNumber,
            fieldName: 'skuCode',
            errorCode: ErrorCodes.SKU_NOT_FOUND,
            errorReason: `SKU编码 ${item.skuCode} 不存在于主数据中（软校验）`,
            rawValue: maskSensitiveValue(item.skuCode, 'skuCode'),
            traceId,
          })
        }
      }
    }
  } catch (error) {
    console.error('SKU validation failed, entering degraded mode:', error)
    degraded = true
  }
  
  const allErrors = [...hardErrors, ...softWarnings]
  if (allErrors.length > 0) {
    await prisma.importTaskError.createMany({
      data: allErrors,
      skipDuplicates: true,
    })
  }
  
  return { validItems, hardErrors, softWarnings, degraded }
}

async function batchInsertShipments(
  items: any[],
  hardErrors: any[],
  taskId: string,
  unitId: string,
  batchIndex: number,
  traceId: string
): Promise<{ insertedCount: number; dbErrorCount: number }> {
  if (items.length === 0) {
    return { insertedCount: 0, dbErrorCount: 0 }
  }
  
  let insertedCount = 0
  let dbErrorCount = 0
  
  const groupedByExternalCode = new Map<string, any[]>()
  
  for (const item of items) {
    const key = item.externalCode || `${taskId}_${unitId}_${item.rowNumber}`
    if (!groupedByExternalCode.has(key)) {
      groupedByExternalCode.set(key, [])
    }
    groupedByExternalCode.get(key)!.push(item)
  }
  
  for (const [externalCode, groupItems] of groupedByExternalCode) {
    try {
      const firstItem = groupItems[0]
      
      await prisma.shipment.create({
        data: {
          externalCode: externalCode.startsWith(`${taskId}_${unitId}_`) ? null : externalCode,
          storeName: firstItem.storeName || '',
          recipientName: firstItem.recipientName || '',
          recipientPhone: firstItem.recipientPhone || '',
          recipientAddress: firstItem.recipientAddress || '',
          status: 'pending',
          items: {
            create: groupItems.map(item => ({
              skuCode: item.skuCode,
              skuName: item.skuName,
              quantity: item.quantity,
              specification: item.specification || '',
              remarks: item.remarks || '',
            })),
          },
        },
      })
      
      insertedCount += groupItems.length
    } catch (error: any) {
      console.error(`Failed to insert shipment ${externalCode}:`, error.message)
      
      for (const item of groupItems) {
        await prisma.importTaskError.create({
          data: {
            taskId,
            unitId,
            batchIndex,
            rowNumber: item.rowNumber,
            fieldName: 'database',
            errorCode: ErrorCodes.DB_WRITE_FAILED,
            errorReason: `数据库写入失败: ${error.message}`,
            rawValue: maskSensitiveValue(JSON.stringify(item), 'database'),
            traceId,
          },
        })
        dbErrorCount++
      }
    }
  }
  
  return { insertedCount, dbErrorCount }
}

async function checkAndCompleteTask(taskId: string) {
  const task = await prisma.importTask.findUnique({
    where: { taskId },
    include: { batches: true },
  })
  
  if (!task) return
  
  const allBatchesCompleted = task.batches.every(
    b => b.status === 'COMPLETED'
  )
  
  if (allBatchesCompleted) {
    const finalStatus = task.failedRows > 0 ? 'PARTIAL_SUCCESS' : 'COMPLETED'
    
    await prisma.importTask.update({
      where: { taskId },
      data: {
        status: finalStatus,
        completedAt: new Date(),
      },
    })
    
    await logTraceEvent(prisma, task.traceId, 'ImportTaskCompleted', 'SUCCESS', 
      `任务完成，状态: ${finalStatus}`, taskId)
  }
}
