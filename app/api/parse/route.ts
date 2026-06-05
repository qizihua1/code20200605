import { NextRequest, NextResponse } from 'next/server'
import { simulateAIGenerateRule } from '@/lib/ai-rule-generator'
import { PrismaClient } from '@prisma/client'
import * as XLSX from 'xlsx'
import * as pdfjs from 'pdfjs-dist'
import * as mammoth from 'mammoth'

const prisma = new PrismaClient()

// 初始化 PDF.js
pdfjs.GlobalWorkerOptions.workerSrc = `//unpkg.com/pdfjs-dist@${pdfjs.version}/build/pdf.worker.min.mjs`

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

// 智能查找表头行
function findHeaderRow(data: any[][]) {
  // 查找包含最多关键词的行
  let maxScore = 0
  let bestRow = 0
  
  for (let i = 0; i < Math.min(15, data.length); i++) {
    const row = data[i]
    let score = 0
    
    // 统计这一行包含多少关键词
    for (const cell of row) {
      const cellStr = String(cell || '').trim()
      const allKeywords = Object.values(KEYWORD_MAPPINGS).flat()
      for (const keyword of allKeywords) {
        if (cellStr.includes(keyword)) {
          score++
          break // 每个单元格只算一次
        }
      }
    }
    
    // 检查这一行是不是可能的标题行
    const isMostlyText = row.filter(cell => 
      typeof cell === 'string' && cell.length > 2
    ).length > row.length / 2
    
    // 检查是否包含序号列，这通常意味着是表头
    const hasIndexColumn = row.some(cell => 
      String(cell).includes('序号') || String(cell) === '序号'
    )
    
    if (hasIndexColumn) {
      score += 5 // 给序号列加权重
    }
    
    if (isMostlyText) {
      score += 2
    }
    
    if (score > maxScore) {
      maxScore = score
      bestRow = i
    }
  }
  
  // 如果找到的分数不够高，返回第一个有意义的行
  if (maxScore < 2) {
    // 尝试跳过说明性的行，找有数据的行
    for (let i = 0; i < Math.min(10, data.length); i++) {
      const row = data[i]
      const hasNumericCell = row.some(cell => 
        typeof cell === 'number' || !isNaN(parseInt(String(cell)))
      )
      if (hasNumericCell && i > 0) {
        return i - 1 // 数据行的前一行可能是表头
      }
    }
  }
  
  return bestRow
}

// 匹配字段到列
function mapColumnsToFields(headerRow: any[]) {
  const mapping: Record<string, number> = {}
  
  headerRow.forEach((cell, idx) => {
    const cellStr = String(cell || '').trim()
    
    for (const [field, keywords] of Object.entries(KEYWORD_MAPPINGS)) {
      // 精确匹配或包含匹配
      const exactMatch = keywords.some(keyword => cellStr === keyword)
      const containsMatch = keywords.some(keyword => 
        cellStr.includes(keyword) || 
        cellStr.toLowerCase().includes(keyword.toLowerCase())
      )
      
      // 精确匹配优先
      if (exactMatch || containsMatch) {
        // 如果已经有映射了，只在精确匹配时才覆盖
        if (!mapping[field] || exactMatch) {
          mapping[field] = idx
        }
        break
      }
    }
  })
  
  return mapping
}

// 智能解析 Excel 数据
function smartParseExcel(buffer: ArrayBuffer) {
  const workbook = XLSX.read(buffer, { type: 'array' })
  const parsedData: any[] = []
  
  for (const sheetName of workbook.SheetNames) {
    const sheet = workbook.Sheets[sheetName]
    const data = XLSX.utils.sheet_to_json(sheet, { header: 1 }) as any[][]
    
    if (data.length < 2) continue
    
    const headerRowIdx = findHeaderRow(data)
    const headerRow = data[headerRowIdx]
    const fieldMapping = mapColumnsToFields(headerRow)
    
    // 尝试提取门店信息（前几行可能包含）
    let sheetStoreName = ''
    for (let i = 0; i < Math.min(headerRowIdx + 2, data.length); i++) {
      const row = data[i]
      for (const cell of row) {
        const cellStr = String(cell || '')
        if (cellStr.includes('门店') || cellStr.includes('店）')) {
          const match = cellStr.match(/（([^）]+)店）/) || cellStr.match(/([^\s]+店)/)
          if (match) {
            sheetStoreName = match[1] || match[0]
            break
          }
        }
      }
      if (sheetStoreName) break
    }
    
    const hasKeyFields = fieldMapping.skuCode !== undefined || fieldMapping.skuName !== undefined
    
    if (!hasKeyFields) continue
    
    const dataStartRow = headerRowIdx + 1
    
    for (let i = dataStartRow; i < data.length; i++) {
      const row = data[i]
      
      if (row.every(cell => !cell || String(cell).trim() === '')) {
        continue
      }
      
      const item: any = {
        skuCode: '',
        skuName: '',
        quantity: 0,
      }
      
      for (const [field, colIdx] of Object.entries(fieldMapping)) {
        const value = row[colIdx]
        if (value !== undefined && value !== null) {
          if (field === 'quantity') {
            let qty = 0
            if (value !== null && value !== undefined && value !== '') {
              qty = parseInt(String(value)) || 0
            }
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
      
      // 特殊处理欢乐牧场这类：SKU名称在第2列（索引1）
      // 检查是否有明显的货主名称在SKU位置
      if (item.skuName && ['欢乐牧场', '尹三顺', '寨寨', '黎明屯'].includes(item.skuName)) {
        const skuNameCol = 2 // 欢乐牧场的SKU名称在第3列（索引2）
        if (row[skuNameCol]) {
          const candidate = String(row[skuNameCol] || '')
          if (candidate.length > 3 && candidate.length < 100) {
            item.skuName = candidate
          }
        }
      }
      
      // 备用策略：如果没有找到SKU名称，尝试找合理的文本列
      if (!item.skuName || item.skuName.length < 3) {
        for (let j = 0; j < row.length; j++) {
          const val = String(row[j] || '')
          if (val.length > 3 && val.length < 100 && !/^\d+$/.test(val) && !val.includes('仓库') && !val.includes('正常') && !val.includes('正品')) {
            // 检查是否已经被用作其他字段了
            let isUsed = false
            for (const [field, colIdx] of Object.entries(fieldMapping)) {
              if (colIdx === j && field !== 'specification') {
                isUsed = true
                break
              }
            }
            if (!isUsed) {
              item.skuName = val
              break
            }
          }
        }
      }
      
      if (item.skuCode || item.skuName) {
        if (workbook.SheetNames.length > 1) {
          item.storeName = item.storeName || sheetName
        } else if (sheetStoreName) {
          item.storeName = item.storeName || sheetStoreName
        }
        parsedData.push(item)
      }
    }
  }
  
  return parsedData
}

// 解析 PDF 文件
async function smartParsePDF(buffer: ArrayBuffer): Promise<any[]> {
  const parsedData: any[] = []
  
  try {
    const pdf = await pdfjs.getDocument({ data: new Uint8Array(buffer) }).promise
    let fullText = ''
    
    for (let i = 1; i <= pdf.numPages; i++) {
      const page = await pdf.getPage(i)
      const textContent = await page.getTextContent()
      const pageText = (textContent.items as any[]).map(item => item.str).join(' ')
      fullText += pageText + '\n'
    }
    
    // 简单的文本解析：尝试从文本中提取 SKU 和数量信息
    const lines = fullText.split('\n').filter(line => line.trim())
    
    for (let i = 0; i < lines.length; i++) {
      const line = lines[i].trim()
      
      const quantityMatch = line.match(/(\d+)\s*(个|件|瓶|盒|箱)?/)
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
        skuCode: 'PDF-PARSED',
        skuName: lines[0].substring(0, 50),
        quantity: 1
      })
    }
    
  } catch (error) {
    console.error('PDF parse error:', error)
  }
  
  return parsedData
}

// 解析 Word 文件
async function smartParseWord(buffer: ArrayBuffer): Promise<any[]> {
  const parsedData: any[] = []
  
  try {
    const result = await mammoth.extractRawText({ arrayBuffer: buffer })
    const text = result.value
    
    const lines = text.split('\n').filter(line => line.trim())
    
    for (let i = 0; i < lines.length; i++) {
      const line = lines[i].trim()
      
      const quantityMatch = line.match(/(\d+)\s*(个|件|瓶|盒|箱)?/)
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
    
    // 检查是否是 AI 规则建议请求（没有 ruleId，并且没有 useSmartParsing）
    const useSmartParsing = formData.has('useSmartParsing')
    
    if (!ruleId && !useSmartParsing) {
      const result = simulateAIGenerateRule(file.name, bytes)
      return NextResponse.json(result)
    }
    
    // 根据文件类型解析
    let parsedData: any[] = []
    
    if (fileName.endsWith('.pdf')) {
      parsedData = await smartParsePDF(bytes)
    } else if (fileName.endsWith('.docx') || fileName.endsWith('.doc')) {
      parsedData = await smartParseWord(bytes)
    } else {
      // Excel 文件（xlsx, xls）
      parsedData = smartParseExcel(bytes)
    }
    
    // 如果有规则并且解析结果不好，尝试使用规则解析
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
              const colIdx = colIndexMap[mapping.source] ?? mapping.column_index
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
    
    // 步骤1：检查与已存在数据的重复
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
    
    // 步骤2：同批次内检测真正的重复（外部编码+SKU编码组合），并收集重复警告
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
    
    // 步骤3：根据外部编码分组数据
    const groupedData = new Map<string, any[]>()
    parsedData.forEach(item => {
      const key = item.externalCode || `UNGROUPED-${Date.now()}`
      if (!groupedData.has(key)) {
        groupedData.set(key, [])
      }
      groupedData.get(key)!.push(item)
    })
    
    // 步骤4：创建运单记录
    const shipments: any[] = []
    for (const [externalCode, items] of groupedData) {
      // 使用该组第一条数据的收货信息
      const firstItem = items[0]
      
      const shipment = await prisma.shipment.create({
        data: {
          externalCode: externalCode.startsWith('UNGROUPED-') ? null : externalCode,
          storeName: firstItem.storeName || '',
          recipientName: firstItem.recipientName || '',
          recipientPhone: firstItem.recipientPhone || '',
          recipientAddress: firstItem.recipientAddress || '',
          status: 'pending',
          items: {
            create: items.map(item => ({
              skuCode: item.skuCode || 'UNKNOWN',
              skuName: item.skuName || '',
              quantity: item.quantity || 0,
              specification: item.specification || '',
              remarks: item.remarks || '',
            }))
          }
        },
        include: {
          items: true
        }
      })
      shipments.push(shipment)
    }
    
    // 为返回数据添加标记，标识与数据库重复的行
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
      shipments,
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
