import { NextRequest, NextResponse } from 'next/server'
import { PrismaClient } from '@prisma/client'
import * as XLSX from 'xlsx'
import mammoth from 'mammoth'
import * as pdfParse from 'pdf-parse'

const prisma = new PrismaClient()

// 常见的表头关键词映射
const KEYWORD_MAPPINGS = {
  skuCode: ['编码', '编号', 'SKU', '货号', '商品编码', 'SKU编码', '物品编码', '条码', '外部商品编码', 'SKU条码', '物料编码'],
  skuName: ['名称', '品名', '商品名称', 'SKU名称', '物品名称', '货品名称', 'SKU', '商品名称规格', '物料名称', '产品名称'],
  quantity: ['数量', '件数', '发货数量', '数量(件)', '数', 'Qty', '出库数量', '应发数量', '发货数量*', '在库数量的总和', '数量(个)', '订货数量', '可用数量', '实发数量'],
  externalCode: ['配送单号', '订单号', '单号', '订单编号', '外部编号', '配送汇总单号', '物品行号', '出库单号', '单据号'],
  storeName: ['门店', '收货门店', '店铺', '门店名称', '收货机构', '仓库名称', '收货方', '客户名称', '收货门店名称'],
  recipientName: ['收货人', '收件人', '姓名', '联系人', '收货人姓名'],
  recipientPhone: ['电话', '手机号', '联系电话', '手机', '联系号码', '收货人电话'],
  recipientAddress: ['地址', '收货地址', '配送地址', '收货地址', '收货人地址'],
  specification: ['规格', '规格型号', '型号', '规格', '单位', '规格描述'],
  remarks: ['备注', '说明', '单据备注', '物品备注'],
}

// 查找最佳表头行
function findHeaderRow(data: any[][]) {
  let maxScore = 0
  let bestRow = 0
  
  // 前15行找最佳表头
  for (let i = 0; i < Math.min(15, data.length); i++) {
    const row = data[i]
    let score = 0
    
    // 检查每行包含的关键词数量
    for (const cell of row) {
      const cellStr = String(cell || '').trim()
      const allKeywords = Object.values(KEYWORD_MAPPINGS).flat()
      for (const keyword of allKeywords) {
        if (cellStr.includes(keyword)) {
          score++
          break
        }
      }
    }
    
    // 加分项：有"序号"列的可能性更大
    const hasIndexColumn = row.some(cell => 
      String(cell).includes('序号') || String(cell) === '序号'
    )
    if (hasIndexColumn) {
      score += 5
    }
    
    if (score > maxScore) {
      maxScore = score
      bestRow = i
    }
  }
  
  return bestRow
}

// 匹配字段到列
function mapColumnsToFields(headerRow: any[]) {
  const mapping: Record<string, number> = {}
  const fieldScores: Record<string, {score: number, idx: number}> = {}
  
  headerRow.forEach((cell, idx) => {
    const cellStr = String(cell || '').trim()
    if (!cellStr) return
    
    for (const [field, keywords] of Object.entries(KEYWORD_MAPPINGS)) {
      for (let priority = 0; priority < keywords.length; priority++) {
        const keyword = keywords[priority]
        let score = 0
        
        if (cellStr === keyword) {
          score = 100 - priority
        } else if (cellStr.includes(keyword)) {
          score = 50 - priority
        }
        
        if (score > 0) {
          if (!fieldScores[field] || score > fieldScores[field].score) {
            fieldScores[field] = { score, idx }
          }
        }
      }
    }
  })
  
  const sortedFields = Object.entries(fieldScores).sort((a, b) => b[1].score - a[1].score)
  const usedColumns = new Set<number>()
  
  for (const [field, { idx }] of sortedFields) {
    if (!usedColumns.has(idx)) {
      mapping[field] = idx
      usedColumns.add(idx)
    }
  }
  
  return mapping
}

// 智能解析Excel
function smartParseExcel(buffer: ArrayBuffer) {
  const workbook = XLSX.read(buffer, { type: 'array' })
  const parsedData: any[] = []
  
  for (const sheetName of workbook.SheetNames) {
    console.log('Processing sheet:', sheetName)
    const sheet = workbook.Sheets[sheetName]
    const data = XLSX.utils.sheet_to_json(sheet, { header: 1 }) as any[][]
    
    if (data.length < 2) continue
    
    console.log('Sheet data rows:', data.length)
    
    // 策略1: 标准表格格式查找
    let success = tryParseStandardTable(data, parsedData)
    if (!success) {
      // 策略2: 尝试从非标准格式中查找
      console.log('Trying alternative parse strategy...')
      success = tryParseAlternativeFormat(data, parsedData)
    }
    if (!success) {
      // 策略3: 最宽松的查找，任何包含文本和数量的行
      console.log('Trying last resort parse strategy...')
      tryParseLastResort(data, parsedData)
    }
  }
  
  console.log('Total parsed items:', parsedData.length)
  return parsedData
}

function tryParseStandardTable(data: any[][], result: any[]) {
  const headerRowIdx = findHeaderRow(data)
  const headerRow = data[headerRowIdx]
  const fieldMapping = mapColumnsToFields(headerRow)
  
  console.log('Header row found at:', headerRowIdx)
  console.log('Field mapping:', fieldMapping)
  
  const hasKeyFields = fieldMapping.skuCode !== undefined || fieldMapping.skuName !== undefined
  
  if (!hasKeyFields) {
    // 如果找不到关键字段，尝试从附近的行
    for (let tryRow = Math.max(0, headerRowIdx - 3); tryRow < Math.min(headerRowIdx + 4, data.length); tryRow++) {
      const tryHeaderRow = data[tryRow]
      const tryMapping = mapColumnsToFields(tryHeaderRow)
      if (tryMapping.skuCode !== undefined || tryMapping.skuName !== undefined) {
        parseExcelFromRow(data, tryRow, tryMapping, result)
        return true
      }
    }
    return false
  }
  
  parseExcelFromRow(data, headerRowIdx, fieldMapping, result)
  return true
}

function tryParseAlternativeFormat(data: any[][], result: any[]) {
  let found = false
  
  // 尝试更广泛地查找可能的数据行
  for (let startRow = 0; startRow < Math.min(20, data.length); startRow++) {
    const row = data[startRow]
    const rowStr = row.map(c => String(c || '')).join(' ')
    
    // 跳过明显不是数据行的行
    if (rowStr.length < 5) continue
    if (rowStr.includes('合计') || rowStr.includes('总计')) continue
    
    // 尝试从这行开始解析
    const mapping = mapColumnsToFields(row)
    if (mapping.skuCode !== undefined || mapping.skuName !== undefined) {
      parseExcelFromRow(data, startRow, mapping, result)
      found = true
    }
  }
  
  return found
}

function tryParseLastResort(data: any[][], result: any[]) {
  // 最宽松的解析：寻找任何看起来像数据的行
  for (let i = 0; i < data.length; i++) {
    const row = data[i]
    const rowStr = row.map(c => String(c || '')).join(' ')
    
    if (rowStr.length < 10) continue
    if (rowStr.includes('合计') || rowStr.includes('总计')) continue
    if (rowStr.includes('配送单') || rowStr.includes('发货单')) continue
    
    // 尝试找出这行里的数字作为数量
    let quantity = 1
    let skuName = ''
    let skuCode = ''
    
    for (const cell of row) {
      const cellStr = String(cell || '').trim()
      if (!cellStr) continue
      
      // 尝试找出数量
      const num = parseInt(cellStr)
      if (!isNaN(num) && num > 0 && num < 10000) {
        if (cellStr.length <= 6) { // 看起来像数量
          quantity = num
        }
      } else if (cellStr.length >= 3 && cellStr.length <= 30) {
        // 可能是SKU编码（不长不短的字符串）
        if (/^[A-Za-z0-9\-_]+$/.test(cellStr) && !skuCode) {
          skuCode = cellStr
        } else if (!skuName) {
          skuName = cellStr
        }
      } else if (cellStr.length > 2 && !skuName) {
        skuName = cellStr
      }
    }
    
    // 如果找到足够的信息，添加一条
    if (skuName || skuCode) {
      result.push({
        skuCode: skuCode,
        skuName: skuName || skuCode,
        quantity: quantity
      })
    }
  }
}

function parseExcelFromRow(data: any[][], headerRowIdx: number, fieldMapping: Record<string, number>, result: any[]) {
  const dataStartRow = headerRowIdx + 1
  
  for (let i = dataStartRow; i < data.length; i++) {
    const row = data[i]
    
    // 跳过空行
    if (row.every(cell => !cell || String(cell).trim() === '')) {
      continue
    }
    
    const item: any = {}
    
    for (const [field, colIdx] of Object.entries(fieldMapping)) {
      const value = row[colIdx]
      if (value !== undefined && value !== null) {
        if (field === 'quantity') {
          let qty = 0
          if (value !== null && value !== undefined && value !== '') {
            qty = parseInt(String(value)) || 0
          }
          // 如果数量是0，尝试从其他列找数值
          if (qty === 0) {
            for (let j = 0; j < row.length; j++) {
              const cell = row[j]
              const cellNum = parseInt(String(cell))
              if (cellNum > 0 && cellNum < 10000) {
                qty = cellNum
                break
              }
            }
          }
          item[field] = qty
        } else {
          item[field] = String(value || '').trim()
        }
      }
    }
    
    if (item.skuCode || item.skuName) {
      result.push(item)
    }
  }
}

// 解析PDF
async function smartParsePDF(buffer: ArrayBuffer) {
  const parsedData: any[] = []
  try {
    console.log('=== Starting PDF parsing with pdf-parse ===')
    
    // 将ArrayBuffer转换为Buffer
    const bufferObj = Buffer.from(buffer)
    const data = await (pdfParse as any)(bufferObj)
    
    console.log('PDF parsed successfully')
    console.log('Number of pages:', data.numpages)
    console.log('Text length:', data.text.length)
    
    const allText = data.text
    const lines = allText.split('\n').filter((line: string) => line.trim())
    console.log('Number of lines:', lines.length)
    
    // 从文本中尝试提取表格数据
    // 方案1：查找看起来像表格行的内容
    const potentialTableLines: string[] = []
    
    for (let i = 0; i < lines.length; i++) {
      const line = lines[i].trim()
      
      // 跳过太短的行和包含关键汇总词的行
      if (line.length < 5) continue
      if (line.includes('合计') || line.includes('总计') || 
          line.includes('金额') || line.includes('配送')) continue
      
      // 查找包含数字的行（可能是表格行）
      const hasNumber = /\d+/.test(line)
      if (hasNumber) {
        potentialTableLines.push(line)
      }
    }
    
    console.log('Found', potentialTableLines.length, 'potential table lines')
    
    // 从这些行中提取数据
    for (const line of potentialTableLines) {
      // 尝试提取数量
      let quantity = 1
      const qtyMatches = line.match(/\b(\d{1,4})\b/g)
      if (qtyMatches && qtyMatches.length > 0) {
        for (const qtyMatch of qtyMatches) {
          const num = parseInt(qtyMatch)
          if (num > 0 && num < 10000) {
            quantity = num
            break
          }
        }
      }
      
      // 尝试提取SKU编码
      let skuCode = ''
      const codeMatch = line.match(/([A-Za-z0-9\-_]{4,20})/)
      if (codeMatch) {
        skuCode = codeMatch[1]
      }
      
      // 提取SKU名称（移除编码和数量后的剩余文本）
      let skuName = line
      if (skuCode) {
        skuName = skuName.replace(skuCode, '')
      }
      // 移除所有数字
      skuName = skuName.replace(/\d+/g, '').trim()
      // 移除多余的空格
      skuName = skuName.replace(/\s+/g, ' ')
      
      if (skuName && skuName.length > 2) {
        parsedData.push({
          skuCode: skuCode,
          skuName: skuName.substring(0, 100),
          quantity: quantity
        })
      }
    }
    
    // 如果还没有找到数据，尝试更通用的方法
    if (parsedData.length === 0) {
      console.log('Using fallback parsing method')
      for (const line of lines) {
        const trimmed = line.trim()
        if (trimmed.length > 10 && !trimmed.includes('合计') && !trimmed.includes('总计')) {
          const quantityMatch = trimmed.match(/\b(\d{1,4})\b/)
          const quantity = quantityMatch ? parseInt(quantityMatch[1]) : 1
          
          parsedData.push({
            skuCode: '',
            skuName: trimmed.substring(0, 100),
            quantity: quantity
          })
        }
      }
    }
    
    console.log('=== PDF parsing complete, found', parsedData.length, 'items ===')
    
    if (parsedData.length === 0 && allText.trim()) {
      // 实在解析不出，添加一个占位项
      parsedData.push({
        skuCode: 'PDF-PARSED',
        skuName: allText.substring(0, 50),
        quantity: 1
      })
    }
    
  } catch (error: any) {
    console.error('PDF parse error:', error.message, error.stack)
    parsedData.push({
      skuCode: 'ERROR',
      skuName: `PDF解析出错: ${error.message}`,
      quantity: 1
    })
  }
  
  return parsedData
}

// 解析Word
async function smartParseWord(buffer: ArrayBuffer) {
  const parsedData: any[] = []
  try {
    const { value } = await mammoth.extractRawText({ arrayBuffer: buffer })
    const text = value
    const lines = text.split('\n').filter((line: string) => line.trim())
    
    for (let i = 0; i < lines.length; i++) {
      const line = lines[i].trim()
      
      const quantityMatch = line.match(/(\d+)\s*(个|件|瓶|盒|箱)/)
      const quantity = quantityMatch ? parseInt(quantityMatch[1]) : 1
      
      const skuCodeMatch = line.match(/([A-Za-z0-9\-_]+)/)
      const skuCode = skuCodeMatch ? skuCodeMatch[1] : ''
      
      if (skuCode || (quantity > 0 && line.length > 5)) {
        parsedData.push({
          skuCode,
          skuName: line.substring(0, 50),
          quantity
        })
      }
    }
    
    if (parsedData.length === 0 && lines.length > 0) {
      parsedData.push({
        skuCode: 'WORD-PARSED',
        skuName: lines[0].substring(0, 50),
        quantity: 1
      })
    }
    
  } catch (error) {
    console.error('Word parse error:', error)
  }
  
  return parsedData
}

// 模拟AI规则生成
function simulateAIGenerateRule(fileName: string, buffer: ArrayBuffer) {
  const analysis = analyzeExcel(buffer)
  
  const rules = [
    {
      name: '标准表格解析',
      description: '适用于大多数标准Excel表格',
      fieldMappings: [
        { field: 'skuCode', source: 'SKU编码' },
        { field: 'skuName', source: 'SKU名称' },
        { field: 'quantity', source: '数量' }
      ],
      confidence: 0.8
    }
  ]
  
  return {
    success: true,
    fileName,
    analysis,
    recommendedRules: rules,
  }
}

function analyzeExcel(buffer: ArrayBuffer) {
  const workbook = XLSX.read(buffer, { type: 'array' })
  const sheet = workbook.Sheets[workbook.SheetNames[0]]
  const data = XLSX.utils.sheet_to_json(sheet, { header: 1 }) as any[][]
  
  return {
    sheetCount: workbook.SheetNames.length,
    rowCount: data.length,
    columns: data[0]?.length || 0,
    sampleHeaders: data[0]?.slice(0, 10).map(c => String(c || '')) || []
  }
}

// 解析API - 只解析不保存
export async function POST(request: NextRequest) {
  try {
    const formData = await request.formData()
    const file = formData.get('file') as File | null
    const ruleId = formData.get('ruleId') as string | null
    
    if (!file) {
      return NextResponse.json({ error: '请上传文件' }, { status: 400 })
    }
    
    const bytes = await file.arrayBuffer()
    const fileName = file.name.toLowerCase()
    
    const useSmartParsing = formData.has('useSmartParsing')
    
    if (!ruleId && !useSmartParsing) {
      const result = simulateAIGenerateRule(file.name, bytes)
      return NextResponse.json(result)
    }
    
    let parsedData: any[] = []
    
    if (fileName.endsWith('.pdf')) {
      parsedData = await smartParsePDF(bytes)
    } else if (fileName.endsWith('.docx') || fileName.endsWith('.doc')) {
      parsedData = await smartParseWord(bytes)
    } else {
      parsedData = smartParseExcel(bytes)
    }
    
    if (ruleId && parsedData.length === 0) {
      const rule = await prisma.parsingRule.findUnique({
        where: { id: ruleId }
      })
      
      if (rule && (fileName.endsWith('.xlsx') || fileName.endsWith('.xls'))) {
        const workbook = XLSX.read(bytes, { type: 'array' })
        const firstSheet = workbook.Sheets[workbook.SheetNames[0]]
        const data = XLSX.utils.sheet_to_json(firstSheet, { header: 1 }) as any[][]
        
        const structure = rule.structure as any
        const fieldMappings = rule.fieldMappings as any[]
        
        const startRow = structure?.dataStartRow || 1
        const headerRow = data[startRow - 1] || []
        
        const colIndexMap: Record<string, number> = {}
        headerRow.forEach((c: any, idx: number) => {
          if (c) colIndexMap[String(c).trim()] = idx
        })
        
        const ruleParsedData: any[] = []
        
        for (let i = startRow; i < data.length; i++) {
          const row = data[i]
          const item: any = {}
          
          item.externalCode = row[0] || `TEMP-${Date.now()}-${i}`
          
          for (const mapping of fieldMappings) {
            if (mapping.sourceType === 'column') {
              const colIdx = colIndexMap[mapping.source] || mapping.column_index
              let value = row[colIdx]
              
              if (mapping.transform === 'number') {
                value = parseInt(String(value || '0'))
              } else if (mapping.transform === 'trim') {
                value = String(value || '').trim()
              }
              
              item[mapping.field] = value
            }
          }
          
          if (item.skuCode || item.skuName) {
            ruleParsedData.push(item)
          }
        }
        
        if (ruleParsedData.length > 0) {
          parsedData = ruleParsedData
        }
      }
    }
    
    const existingExternalCodes = new Set<string>()
    const externalCodesFromData = parsedData
      .filter(item => item.externalCode)
      .map(item => item.externalCode)
    
    if (externalCodesFromData.length > 0) {
      const existingShipments = await prisma.shipment.findMany({
        where: {
          externalCode: { in: externalCodesFromData }
        },
        select: { externalCode: true }
      })
      existingShipments.forEach(s => {
        if (s.externalCode) existingExternalCodes.add(s.externalCode)
      })
    }
    
    const duplicateWarnings: Array<{ rowIndex: number, externalCode: string, skuCode: string }> = []
    const seenCombinations = new Set<string>()
    const duplicateWithDb: Array<{ rowIndex: number, externalCode: string }> = []
    
    parsedData.forEach((item, index) => {
      if (item.externalCode && item.skuCode) {
        const key = `${item.externalCode}|${item.skuCode}`
        if (seenCombinations.has(key)) {
          duplicateWarnings.push({
            rowIndex: index + 1,
            externalCode: item.externalCode,
            skuCode: item.skuCode
          })
        } else {
          seenCombinations.add(key)
        }
      }
      
      if (item.externalCode && existingExternalCodes.has(item.externalCode)) {
        duplicateWithDb.push({
          rowIndex: index + 1,
          externalCode: item.externalCode
        })
      }
    })
    
    const dataWithWarnings = parsedData.map((item, index) => {
      const isDuplicateWithDb = duplicateWithDb.some(d => d.rowIndex === index + 1)
      const isDuplicateInBatch = duplicateWarnings.some(d => d.rowIndex === index + 1)
      return {
        ...item,
        rowIndex: index + 1,
        duplicateWithDatabase: isDuplicateWithDb,
        duplicateInBatch: isDuplicateInBatch
      }
    })
    
    return NextResponse.json({
      success: true,
      data: dataWithWarnings,
      total: parsedData.length,
      duplicateWarnings: [...duplicateWarnings, ...duplicateWithDb.map(d => ({...d, type: 'database'}))],
      message: parsedData.length > 0 
        ? `成功解析 ${parsedData.length} 条数据，${duplicateWarnings.length + duplicateWithDb.length} 条重复提醒` 
        : '未解析到有效数据，请检查文件格式',
    })
    
  } catch (error: any) {
    console.error('Parse error:', error.message, error.stack)
    return NextResponse.json({
      error: '解析失败',
      details: error.message,
      hint: '请检查文件格式',
    }, { status: 500 })
  } finally {
    await prisma.$disconnect()
  }
}
