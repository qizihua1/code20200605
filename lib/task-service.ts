import { prisma } from './prisma'
import { generateTaskId, generateTraceId, generateUnitId, logTraceEvent } from './trace'
import { parseWithRule, smartParse } from './parser'
import { storeFile, retrieveFile } from './file-storage'

const BATCH_SIZE = 1000

export interface CreateImportTaskInput {
  file: ArrayBuffer
  fileName: string
  ruleId?: string
  totalRows?: number
}

export interface CreateImportTaskResult {
  task_id: string
  trace_id: string
  status: string
  total_rows: number
  total_batches: number
}

export async function createImportTask(input: CreateImportTaskInput): Promise<CreateImportTaskResult> {
  const taskId = generateTaskId()
  const traceId = generateTraceId()
  const fileBuffer = Buffer.from(input.file)
  
  let totalRows = input.totalRows || 0
  let parsedData: any[] = []
  
  if (input.ruleId) {
    const rule = await prisma.parsingRule.findUnique({
      where: { id: input.ruleId },
    })
    
    if (!rule) {
      throw new Error('解析规则不存在')
    }
    
    const parseResult = parseWithRule(input.file, rule)
    if (parseResult.success && parseResult.data) {
      parsedData = parseResult.data
      totalRows = parsedData.length
    }
  } else {
    // 无规则时，使用智能解析快速获取行数
    try {
      const parseResult = await smartParse(input.file, input.fileName)
      if (parseResult.success && parseResult.data) {
        parsedData = parseResult.data
        totalRows = parseResult.data.length
      }
    } catch (e) {
      console.warn('智能解析失败，使用估算行数:', e)
    }
  }
  
  if (totalRows === 0) {
    totalRows = Math.ceil(input.file.byteLength / 100)
  }
  
  const totalBatches = Math.ceil(totalRows / BATCH_SIZE)
  
  const { storageKey } = await storeFile(fileBuffer, input.fileName, taskId)
  
  const task = await prisma.importTask.create({
    data: {
      taskId,
      traceId,
      fileName: input.fileName,
      fileSize: fileBuffer.length,
      storageKey,
      status: 'PENDING',
      totalRows,
      totalBatches,
      ruleId: input.ruleId,
    },
  })
  
  const batchData = []
  const outboxData = []
  
  for (let i = 0; i < totalBatches; i++) {
    const unitId = generateUnitId(i)
    const startRow = i * BATCH_SIZE + 1
    const endRow = Math.min((i + 1) * BATCH_SIZE, totalRows)
    
    batchData.push({
      taskId,
      unitId,
      batchIndex: i,
      startRow,
      endRow,
      status: 'PENDING',
    })
    
    outboxData.push({
      aggregateId: taskId,
      eventType: 'ImportBatchCreated',
      payload: {
        task_id: taskId,
        unit_id: unitId,
        batch_index: i,
        start_row: startRow,
        end_row: endRow,
        storage_key: storageKey,
        file_name: input.fileName,
        rule_id: input.ruleId,
      },
      status: 'PENDING',
    })
  }
  
  if (batchData.length > 0) {
    await prisma.importTaskBatch.createMany({ data: batchData })
  }
  
  if (outboxData.length > 0) {
    await prisma.eventOutbox.createMany({ data: outboxData })
  }
  
  await logTraceEvent(prisma, traceId, 'ImportTaskCreated', 'SUCCESS', `任务创建成功，共 ${totalBatches} 个批次`, taskId)
  
  return {
    task_id: task.taskId,
    trace_id: task.traceId,
    status: task.status,
    total_rows: task.totalRows,
    total_batches: task.totalBatches,
  }
}

export async function getImportTask(taskId: string) {
  return prisma.importTask.findUnique({
    where: { taskId },
    include: {
      batches: true,
    },
  })
}

export async function updateTaskProgress(
  taskId: string,
  unitId: string,
  processedCount: number,
  successCount: number,
  failedCount: number
) {
  const batch = await prisma.importTaskBatch.findUnique({
    where: { taskId_unitId: { taskId, unitId } },
  })
  
  if (!batch || batch.status === 'COMPLETED') {
    return null
  }
  
  const task = await getImportTask(taskId)
  if (!task) return
  
  const newProcessed = task.processedRows + processedCount
  const newSuccess = task.successRows + successCount
  const newFailed = task.failedRows + failedCount
  
  let status = task.status
  let completedAt = task.completedAt
  
  if (newProcessed >= task.totalRows) {
    status = newFailed > 0 ? 'PARTIAL_SUCCESS' : 'COMPLETED'
    completedAt = new Date()
  } else if (task.status === 'PENDING') {
    status = 'PROCESSING'
  }
  
  await prisma.importTask.update({
    where: { taskId },
    data: {
      processedRows: newProcessed,
      successRows: newSuccess,
      failedRows: newFailed,
      status,
      completedBatches: { increment: 1 },
      completedAt,
    },
  })
  
  await prisma.importTaskBatch.update({
    where: { taskId_unitId: { taskId, unitId } },
    data: { status: 'COMPLETED', completedAt: new Date() },
  })
  
  return getImportTask(taskId)
}

export async function markTaskAsFailed(taskId: string, reason: string) {
  const task = await getImportTask(taskId)
  if (!task) return
  
  await prisma.importTask.update({
    where: { taskId },
    data: {
      status: 'FAILED',
      completedAt: new Date(),
    },
  })
  
  if (task.traceId) {
    await logTraceEvent(prisma, task.traceId, 'ImportTaskFailed', 'FAILED', reason, taskId)
  }
}

export async function setTaskDegraded(taskId: string) {
  const task = await getImportTask(taskId)
  if (!task) return
  
  await prisma.importTask.update({
    where: { taskId },
    data: { degraded: true },
  })
  
  if (task.traceId) {
    await logTraceEvent(prisma, task.traceId, 'ImportTaskDegraded', 'WARNING', 'SKU校验已降级', taskId)
  }
}

export async function getFileForTask(taskId: string): Promise<Buffer | null> {
  const task = await prisma.importTask.findUnique({
    where: { taskId },
  })
  
  if (!task?.storageKey) {
    return null
  }
  
  return retrieveFile(task.storageKey)
}

export { BATCH_SIZE }
