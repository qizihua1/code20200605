import { NextRequest, NextResponse } from 'next/server'
import { PrismaClient } from '@prisma/client'
import * as XLSX from 'xlsx'
import mammoth from 'mammoth'
import * as pdfParse from 'pdf-parse'

const prisma = new PrismaClient()

// ========== 方式1: 智能解析（不需要规则，直接解析）==========
export function smartParse(buffer: ArrayBuffer, fileName: string) {
  try {
    const lowerFileName = fileName.toLowerCase()
    
    if (lowerFileName.endsWith('.pdf')) {
      return parsePDF(buffer)
    } else if (lowerFileName.endsWith('.docx') || lowerFileName.endsWith('.doc')) {
      return parseWord(buffer)
    } else {
      return parseExcel(buffer)
    }
  } catch (error: any) {
    console.error('智能解析失败:', error)
    return {
      success: false,
      error: '解析失败',
      details: error.message
    }
  }
}

// 智能解析Excel - 不需要规则
function parseExcel(buffer: ArrayBuffer) {
  try {
    const workbook = XLSX.read(buffer, { type: 'array' })
    const parsedData: any[] = []

    for (const sheetName of workbook.SheetNames) {
      const sheet = workbook.Sheets[sheetName]
      const data = XLSX.utils.sheet_to_json(sheet, { header: 1 }) as any[][]

      if (data.length < 2) continue

      // 智能检测表头行
      const headerRowIndex = detectHeaderRow(data)
      const headers = data[headerRowIndex] || []

      // 智能生成字段映射
      const fieldMapping = generateFieldMapping(headers)

      // 解析数据行
      for (let i = headerRowIndex + 1; i < data.length; i++) {
        const row = data[i]
        if (!row || row.length === 0) continue

        // 跳过空行
        if (row.every(cell => !cell || String(cell).trim() === '')) {
          continue
        }

        // 跳过合计行
        const rowStr = row.map(c => String(c || '')).join('')
        if (rowStr.includes('合计') || rowStr.includes('总计')) {
          continue
        }

        const item: any = {}

        for (const [field, colIdx] of Object.entries(fieldMapping)) {
          const value = row[colIdx as number]
          if (value !== undefined && value !== null) {
            if (field === 'quantity') {
              item[field] = parseInt(String(value)) || 0
            } else {
              item[field] = String(value).trim()
            }
          }
        }

        if (item.skuCode || item.skuName) {
          parsedData.push(item)
        }
      }
    }

    return {
      success: true,
      data: parsedData,
      total: parsedData.length,
      parseMode: 'smart',
      message: `智能解析完成，共 ${parsedData.length} 条数据`
    }
  } catch (error: any) {
    return {
      success: false,
      error: 'Excel解析失败',
      details: error.message
    }
  }
}

// 智能解析PDF
function parsePDF(buffer: ArrayBuffer) {
  try {
    const bufferObj = Buffer.from(buffer)
    const data = (pdfParse as any)(bufferObj).then((pdfData: any) => {
      const lines = pdfData.text.split('\n')
      const parsedData: any[] = []

      for (const line of lines) {
        const trimmed = line.trim()
        if (trimmed.length > 5 && !trimmed.includes('合计') && !trimmed.includes('总计')) {
          // 尝试提取数量
          let quantity = 1
          const qtyMatch = trimmed.match(/\d+/)
          if (qtyMatch) {
            const num = parseInt(qtyMatch[0])
            if (num > 0 && num < 10000) {
              quantity = num
            }
          }

          parsedData.push({
            skuCode: '',
            skuName: trimmed.substring(0, 100),
            quantity
          })
        }
      }

      return {
        success: true,
        data: parsedData,
        total: parsedData.length,
        parseMode: 'smart',
        message: `PDF解析完成，共 ${parsedData.length} 条数据`
      }
    })

    return data
  } catch (error: any) {
    return {
      success: false,
      error: 'PDF解析失败',
      details: error.message
    }
  }
}

// 智能解析Word
function parseWord(buffer: ArrayBuffer) {
  try {
    const { value } = mammoth.extractRawText({ arrayBuffer: buffer })
    const lines = value.split('\n')
    const parsedData: any[] = []

    for (const line of lines) {
      const trimmed = line.trim()
      if (trimmed.length > 3) {
        parsedData.push({
          skuCode: '',
          skuName: trimmed.substring(0, 100),
          quantity: 1
        })
      }
    }

    return {
      success: true,
      data: parsedData,
      total: parsedData.length,
      parseMode: 'smart',
      message: `Word解析完成，共 ${parsedData.length} 条数据`
    }
  } catch (error: any) {
    return {
      success: false,
      error: 'Word解析失败',
      details: error.message
    }
  }
}

// ========== 方式3: 模拟AI分析（生成推荐规则）==========
export async function analyzeAndSuggestRule(buffer: ArrayBuffer, fileName: string) {
  try {
    const lowerFileName = fileName.toLowerCase()
    let analysis: any = {}

    if (lowerFileName.endsWith('.pdf')) {
      const bufferObj = Buffer.from(buffer)
      const pdfData = await (pdfParse as any)(bufferObj)
      analysis = {
        type: 'pdf',
        pages: pdfData.numpages,
        textLength: pdfData.text.length,
        sampleText: pdfData.text.substring(0, 1000)
      }
    } else if (lowerFileName.endsWith('.docx') || lowerFileName.endsWith('.doc')) {
      const { value } = await mammoth.extractRawText({ arrayBuffer: buffer })
      analysis = {
        type: 'word',
        textLength: value.length,
        sampleText: value.substring(0, 1000)
      }
    } else {
      // Excel分析
      const workbook = XLSX.read(buffer, { type: 'array' })
      const sheet = workbook.Sheets[workbook.SheetNames[0]]
      const data = XLSX.utils.sheet_to_json(sheet, { header: 1 }) as any[][]

      const headerRowIndex = detectHeaderRow(data)
      const headers = data[headerRowIndex] || []
      const fieldMappings = generateFieldMappingWithDetails(headers)

      analysis = {
        type: 'excel',
        sheetCount: workbook.SheetNames.length,
        sheetNames: workbook.SheetNames,
        totalRows: data.length,
        totalColumns: data[0]?.length || 0,
        headerRow: headerRowIndex,
        dataStartRow: headerRowIndex + 1,
        headers: headers.slice(0, 30),
        fieldMappings
      }
    }

    // 生成推荐规则
    const recommendedRule = {
      name: `推荐规则 - ${fileName}`,
      description: '由系统智能分析生成的推荐规则',
      structure: {
        type: analysis.type,
        headerRow: analysis.headerRow || 0,
        dataStartRow: analysis.dataStartRow || 1,
        dataEndRow: -1, // 到末尾
        multiSheet: analysis.sheetCount > 1
      },
      fieldMappings: analysis.fieldMappings || []
    }

    return {
      success: true,
      fileName,
      analysis,
      recommendedRule,
      message: '智能分析完成，请确认推荐规则或手动调整'
    }
  } catch (error: any) {
    console.error('AI分析失败:', error)
    return {
      success: false,
      error: '文件分析失败',
      details: error.message
    }
  }
}

// 智能检测表头行
function detectHeaderRow(data: any[][]) {
  const keywords = [
    '编码', '编号', 'SKU', '名称', '数量', '规格', '门店',
    '收货', '电话', '地址', '单价', '金额', '日期', '单号'
  ]

  let bestRow = 0
  let bestScore = 0

  for (let i = 0; i < Math.min(20, data.length); i++) {
    const row = data[i]
    if (!row || row.length === 0) continue

    let score = 0
    const rowStr = row.map(c => String(c || '')).join('')

    for (const keyword of keywords) {
      if (rowStr.includes(keyword)) {
        score++
      }
    }

    if (rowStr.includes('序号') || rowStr.includes('NO')) {
      score += 3
    }

    if (row.length <= 50) {
      score += 1
    }

    if (score > bestScore) {
      bestScore = score
      bestRow = i
    }
  }

  return bestRow
}

// 生成字段映射（简化版）
function generateFieldMapping(headers: any[]) {
  const mapping: Record<string, number> = {}
  const fieldKeywords: Record<string, string[]> = {
    externalCode: ['单号', '编号', '订单号', '配送单号', '出库单号'],
    skuCode: ['编码', '编号', 'SKU', '条码', '货号'],
    skuName: ['名称', '品名', '商品名称', '货品名称'],
    quantity: ['数量', '件数', 'Qty', '发货数量'],
    specification: ['规格', '规格型号', '型号', '单位'],
    storeName: ['门店', '店铺', '收货门店', '仓库'],
    recipientName: ['收货人', '收件人', '姓名', '联系人'],
    recipientPhone: ['电话', '手机', '联系电话'],
    recipientAddress: ['地址', '收货地址', '配送地址'],
    remarks: ['备注', '说明']
  }

  headers.forEach((header, index) => {
    const headerStr = String(header || '').trim()
    if (!headerStr) return

    for (const [field, keywords] of Object.entries(fieldKeywords)) {
      for (const keyword of keywords) {
        if (headerStr.includes(keyword) || headerStr === keyword) {
          if (mapping[field] === undefined) {
            mapping[field] = index
          }
          break
        }
      }
    }
  })

  return mapping
}

// 生成字段映射（详细版，用于推荐规则）
function generateFieldMappingWithDetails(headers: any[]) {
  const mappings: any[] = []
  const fieldKeywords: Record<string, string[]> = {
    externalCode: ['单号', '编号', '订单号', '配送单号', '出库单号'],
    skuCode: ['编码', '编号', 'SKU', '条码', '货号'],
    skuName: ['名称', '品名', '商品名称', '货品名称'],
    quantity: ['数量', '件数', 'Qty', '发货数量'],
    specification: ['规格', '规格型号', '型号', '单位'],
    storeName: ['门店', '店铺', '收货门店', '仓库'],
    recipientName: ['收货人', '收件人', '姓名', '联系人'],
    recipientPhone: ['电话', '手机', '联系电话'],
    recipientAddress: ['地址', '收货地址', '配送地址'],
    remarks: ['备注', '说明']
  }

  headers.forEach((header, index) => {
    const headerStr = String(header || '').trim()
    if (!headerStr) return

    for (const [field, keywords] of Object.entries(fieldKeywords)) {
      for (const keyword of keywords) {
        if (headerStr.includes(keyword) || headerStr === keyword) {
          mappings.push({
            field,
            source: headerStr,
            columnIndex: index,
            sourceType: 'column'
          })
          break
        }
      }
    }
  })

  return mappings
}

// ========== 方式2: 使用规则解析 ==========
export function parseWithRule(buffer: ArrayBuffer, rule: any) {
  try {
    const workbook = XLSX.read(buffer, { type: 'array' })
    const parsedData: any[] = []

    for (const sheetName of workbook.SheetNames) {
      const sheet = workbook.Sheets[sheetName]
      const data = XLSX.utils.sheet_to_json(sheet, { header: 1 }) as any[][]

      const headerRow = rule.structure?.headerRow || 0
      const dataStartRow = rule.structure?.dataStartRow || headerRow + 1
      const dataEndRow = rule.structure?.dataEndRow === -1 ? data.length - 1 : (rule.structure?.dataEndRow || data.length - 1)

      // 构建列索引映射
      const colIndexMap: Record<string, number> = {}
      for (const mapping of rule.fieldMappings || []) {
        if (mapping.sourceType === 'column' && mapping.columnIndex !== undefined) {
          colIndexMap[mapping.field] = mapping.columnIndex
        }
      }

      // 解析数据行
      for (let i = dataStartRow; i <= dataEndRow && i < data.length; i++) {
        const row = data[i]
        if (!row) continue

        if (row.every(cell => !cell || String(cell).trim() === '')) {
          continue
        }

        const item: any = {}

        for (const [field, colIdx] of Object.entries(colIndexMap)) {
          let value = row[colIdx as number]
          if (value !== undefined && value !== null) {
            if (field === 'quantity') {
              value = parseInt(String(value)) || 0
            } else {
              value = String(value).trim()
            }
            item[field] = value
          }
        }

        if (item.skuCode || item.skuName) {
          parsedData.push(item)
        }
      }
    }

    return {
      success: true,
      data: parsedData,
      total: parsedData.length,
      parseMode: 'rule',
      message: `规则解析完成，共 ${parsedData.length} 条数据`
    }
  } catch (error: any) {
    return {
      success: false,
      error: '规则解析失败',
      details: error.message
    }
  }
}

// ========== API路由 ==========
export async function POST(request: NextRequest) {
  try {
    const formData = await request.formData()
    const file = formData.get('file') as File | null
    const parseMode = formData.get('parseMode') as string // smart | rule | analyze
    const ruleId = formData.get('ruleId') as string | null

    if (!file) {
      return NextResponse.json({ error: '请上传文件' }, { status: 400 })
    }

    const bytes = await file.arrayBuffer()
    const fileName = file.name

    // 方式1: 智能解析（不需要规则）
    if (parseMode === 'smart' || (!parseMode && !ruleId)) {
      const result = smartParse(bytes, fileName)
      return NextResponse.json(result)
    }

    // 方式3: 智能分析（生成推荐规则）
    if (parseMode === 'analyze') {
      const result = await analyzeAndSuggestRule(bytes, fileName)
      return NextResponse.json(result)
    }

    // 方式2: 使用规则解析
    if (ruleId) {
      const rule = await prisma.parsingRule.findUnique({
        where: { id: ruleId }
      })

      if (!rule) {
        return NextResponse.json({ error: '规则不存在' }, { status: 404 })
      }

      const result = parseWithRule(bytes, {
        structure: rule.structure as any,
        fieldMappings: rule.fieldMappings as any[]
      })
      return NextResponse.json(result)
    }

    // 默认：智能解析
    const defaultResult = smartParse(bytes, fileName)
    return NextResponse.json(defaultResult)
  } catch (error: any) {
    console.error('解析错误:', error)
    return NextResponse.json({
      success: false,
      error: '解析失败',
      details: error.message
    }, { status: 500 })
  } finally {
    await prisma.$disconnect()
  }
}
