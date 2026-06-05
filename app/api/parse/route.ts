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
  skuCode: ['编码', '编号', 'SKU', '货号', '商品编码', 'SKU编码', '物品编码'],
  skuName: ['名称', '品名', '商品名称', 'SKU名称', '物品名称', '货品名称'],
  quantity: ['数量', '件数', '发货数量', '数量(件)', '数', 'Qty'],
  externalCode: ['配送单号', '订单号', '单号', '订单编号', '外部编号'],
  storeName: ['门店', '收货门店', '店铺', '门店名称', '收货机构'],
  recipientName: ['收货人', '收件人', '姓名'],
  recipientPhone: ['电话', '手机号', '联系电话', '手机'],
  recipientAddress: ['地址', '收货地址', '配送地址'],
  specification: ['规格', '规格型号', '型号'],
  remarks: ['备注', '说明'],
}

// 智能查找表头行
function findHeaderRow(data: any[][]) {
  for (let i = 0; i < Math.min(10, data.length); i++) {
    const row = data[i]
    const hasRelevantKeywords = row.some((cell) => {
      const cellStr = String(cell || '').trim()
      const allKeywords = Object.values(KEYWORD_MAPPINGS).flat()
      return allKeywords.some(keyword => 
        cellStr.includes(keyword)
      )
    })
    if (hasRelevantKeywords) {
      return i
    }
  }
  return 0 // 默认第一行
}

// 匹配字段到列
function mapColumnsToFields(headerRow: any[]) {
  const mapping: Record<string, number> = {}
  
  headerRow.forEach((cell, idx) => {
    const cellStr = String(cell || '').trim()
    
    for (const [field, keywords] of Object.entries(KEYWORD_MAPPINGS)) {
      if (keywords.some(keyword => 
        cellStr.includes(keyword) || 
        cellStr.toLowerCase().includes(keyword.toLowerCase())
      )) {
        mapping[field] = idx
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
            item[field] = parseInt(String(value)) || 0
          } else {
            item[field] = String(value).trim()
          }
        }
      }
      
      if (item.skuCode || item.skuName) {
        if (workbook.SheetNames.length > 1) {
          item.storeName = item.storeName || sheetName
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
    
    let shipment: any = null
    if (parsedData.length > 0) {
      shipment = await prisma.shipment.create({
        data: {
          externalCode: parsedData[0]?.externalCode || `UPLOAD-${Date.now()}`,
          storeName: parsedData[0]?.storeName || '',
          status: 'pending',
          items: {
            create: parsedData.map(item => ({
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
    }
    
    return NextResponse.json({
      success: true,
      data: shipment ? shipment.items.map((i: any) => ({
        ...i,
        externalCode: shipment.externalCode,
        storeName: shipment.storeName,
      })) : parsedData,
      shipmentId: shipment?.id,
      total: parsedData.length,
      message: parsedData.length > 0 
        ? `成功解析 ${parsedData.length} 条数据` 
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
