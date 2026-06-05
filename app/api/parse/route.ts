
import { NextRequest, NextResponse } from 'next/server'
import { simulateAIGenerateRule } from '@/lib/ai-rule-generator'
import { PrismaClient } from '@prisma/client'
import * as XLSX from 'xlsx'

const prisma = new PrismaClient()

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
  for (let i = 0; i &lt; Math.min(10, data.length); i++) {
    const row = data[i]
    const hasRelevantKeywords = row.some((cell) =&gt; {
      const cellStr = String(cell || '').trim()
      const allKeywords = Object.values(KEYWORD_MAPPINGS).flat()
      return allKeywords.some(keyword =&gt; 
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
  const mapping: Record&lt;string, number&gt; = {}
  
  headerRow.forEach((cell, idx) =&gt; {
    const cellStr = String(cell || '').trim()
    
    for (const [field, keywords] of Object.entries(KEYWORD_MAPPINGS)) {
      if (keywords.some(keyword =&gt; 
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
    
    if (data.length &lt; 2) continue
    
    const headerRowIdx = findHeaderRow(data)
    const headerRow = data[headerRowIdx]
    const fieldMapping = mapColumnsToFields(headerRow)
    
    const hasKeyFields = fieldMapping.skuCode !== undefined || fieldMapping.skuName !== undefined
    
    if (!hasKeyFields) continue
    
    const dataStartRow = headerRowIdx + 1
    
    for (let i = dataStartRow; i &lt; data.length; i++) {
      const row = data[i]
      
      if (row.every(cell =&gt; !cell || String(cell).trim() === '')) {
        continue
      }
      
      const item: any = {
        skuCode: '',
        skuName: '',
        quantity: 0,
      }
      
      for (const [field, colIdx] of Object.entries(fieldMapping)) {
        const value = row[colIdx]
        if (value !== undefined &amp;&amp; value !== null) {
          if (field === 'quantity') {
            item[field] = parseInt(String(value)) || 0
          } else {
            item[field] = String(value).trim()
          }
        }
      }
      
      if (item.skuCode || item.skuName) {
        if (workbook.SheetNames.length &gt; 1) {
          item.storeName = item.storeName || sheetName
        }
        parsedData.push(item)
      }
    }
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
    
    if (!ruleId) {
      const result = simulateAIGenerateRule(file.name, bytes)
      return NextResponse.json(result)
    }
    
    const rule = await prisma.parsingRule.findUnique({
      where: { id: ruleId }
    })
    
    let parsedData: any[]
    
    if (rule) {
      const workbook = XLSX.read(bytes, { type: 'array' })
      const firstSheet = workbook.Sheets[workbook.SheetNames[0]]
      const data = XLSX.utils.sheet_to_json(firstSheet, { header: 1 }) as any[][]
      
      const structure = rule.structure as any
      const fieldMappings = rule.fieldMappings as any[]
      
      const startRow = structure?.dataStartRow || 1
      const headerRow = data[startRow - 1] || []
      
      const colIndexMap: Record&lt;string, number&gt; = {}
      headerRow.forEach((c: any, idx: number) =&gt; {
        if (c) colIndexMap[String(c).trim()] = idx
      })
      
      parsedData = []
      
      for (let i = startRow; i &lt; data.length; i++) {
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
          parsedData.push(item)
        }
      }
    } else {
      parsedData = smartParseExcel(bytes)
    }
    
    if (parsedData.length === 0) {
      const backupData = smartParseExcel(bytes)
      if (backupData.length &gt; 0) {
        parsedData = backupData
      }
    }
    
    let shipment: any = null
    if (parsedData.length &gt; 0) {
      shipment = await prisma.shipment.create({
        data: {
          externalCode: parsedData[0]?.externalCode || `UPLOAD-${Date.now()}`,
          storeName: parsedData[0]?.storeName || '',
          status: 'pending',
          items: {
            create: parsedData.map(item =&gt; ({
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
      data: shipment ? shipment.items.map((i: any) =&gt; ({
        ...i,
        externalCode: shipment.externalCode,
        storeName: shipment.storeName,
      })) : parsedData,
      shipmentId: shipment?.id,
      total: parsedData.length,
      message: parsedData.length &gt; 0 
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
