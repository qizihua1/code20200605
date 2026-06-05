import { NextRequest, NextResponse } from 'next/server'
import { simulateAIGenerateRule } from '@/lib/ai-rule-generator'
import { PrismaClient } from '@prisma/client'

const prisma = new PrismaClient()

// POST /api/parse/analyze - AI 分析文件并生成推荐规则
export async function POST(request: NextRequest) {
  try {
    const formData = await request.formData()
    const file = formData.get('file') as File | null

    if (!file) {
      return NextResponse.json({ error: '请上传文件' }, { status: 400 })
    }

    const bytes = await file.arrayBuffer()
    
    // 调用 AI 规则生成器（模拟）
    const result = simulateAIGenerateRule(file.name, bytes)
    
    return NextResponse.json(result)
  } catch (error: any) {
    console.error('Analyze error:', error)
    return NextResponse.json({
      error: '分析失败',
      details: error.message
    }, { status: 500 })
  }
}

// POST /api/parse/execute - 使用指定规则解析文件
export async function PATCH(request: NextRequest) {
  try {
    const body = await request.json()
    const { ruleId, fileBuffer } = body
    
    if (!ruleId || !fileBuffer) {
      return NextResponse.json({ error: '缺少规则或文件' }, { status: 400 })
    }
    
    // 获取规则
    const rule = await prisma.parsingRule.findUnique({
      where: { id: ruleId },
      include: { shipments: { take: 5 } }
    })
    
    if (!rule) {
      return NextResponse.json({ error: '规则不存在' }, { status: 404 })
    }
    
    // 执行解析（这里调用规则引擎）
    const parsedData = await executeRule(rule, Buffer.from(fileBuffer))
    
    return NextResponse.json({
      success: true,
      data: parsedData,
      ruleName: rule.name
    })
  } catch (error: any) {
    console.error('Execute rule error:', error)
    return NextResponse.json({
      error: '解析失败',
      details: error.message
    }, { status: 500 })
  }
}

// 规则执行引擎
async function executeRule(rule: any, buffer: Buffer) {
  const XLSX = require('xlsx')
  const workbook = XLSX.read(buffer, { type: 'buffer' })
  
  const structure = rule.structure
  const fieldMappings = rule.fieldMappings
  const allData: any[] = []
  
  // 根据 sheet 策略处理
  let sheetsToProcess: string[] = []
  if (structure.sheetStrategy === 'all') {
    sheetsToProcess = workbook.SheetNames
  } else if (structure.sheetStrategy === 'first') {
    sheetsToProcess = [workbook.SheetNames[0]]
  } else {
    sheetsToProcess = structure.sheetNames || [workbook.Sheet_NAMES[0]]
  }
  
  // 处理每个 Sheet
  for (const sheetName of sheetsToProcess) {
    const sheet = workbook.Sheets[sheetName]
    const data = XLSX.utils.sheet_to_json(sheet, { header: 1 }) as any[][]
    
    // 根据提取类型处理
    if (structure.extractionType === 'table') {
      const tableData = extractTable(data, structure, fieldMappings, sheetName)
      allData.push(...tableData)
    } else if (structure.extractionType === 'card') {
      const cardData = extractCards(data, structure, fieldMappings)
      allData.push(...cardData)
    } else if (structure.extractionType === 'matrix') {
      const matrixData = extractMatrix(data, structure, fieldMappings)
      allData.push(...matrixData)
    }
  }
  
  return allData
}

// 表格提取
function extractTable(data: any[][], structure: any, fieldMappings: any[], sheetName: string) {
  const result: any[] = []
  const startRow = structure.dataStartRow || structure.headerSkip || 0
  
  // 找到表头行
  const headerRow = data[startRow - 1] || data[startRow] || []
  
  // 列名映射
  const colIndexMap: Record<string, number> = {}
  headerRow.forEach((h: any, idx: number) => {
    if (h) colIndexMap[String(h).trim()] = idx
  })
  
  // 提取数据
  for (let i = startRow; i < data.length; i++) {
    const row = data[i]
    const item: any = {}
    
    for (const mapping of fieldMappings) {
      if (mapping.sourceType === 'column') {
        const colIdx = colIndexMap[mapping.source] ?? mapping.column_index
        let value = row[colIdx]
        
        if (mapping.transform === 'number') {
          value = parseInt(value || '0')
        } else if (mapping.transform === 'trim') {
          value = String(value || '').trim()
        }
        
        item[mapping.field] = value
      }
    }
    
    // 跳过空行
    if (!item.skuCode && !item.skuName) continue
    
    result.push(item)
  }
  
  return result
}

// 卡片式提取
function extractCards(data: any[][], structure: any, fieldMappings: any[]) {
  const result: any[] = []
  const marker = structure.cardMarker || '▶'
  
  let currentCard: any = null
  let inCardTable = false
  
  for (let i = 0; i < data.length; i++) {
    const row = data[i]
    const rowText = row.join(' ')
    
    // 检测卡片开始
    if (rowText.includes(marker)) {
      if (currentCard) {
        result.push(currentCard)
      }
      currentCard = { items: [] }
      inCardTable = false
    }
    
    // 提取卡片头信息
    if (currentCard && !inCardTable && structure.cardFields) {
      for (const [field, config] of Object.entries(structure.cardFields)) {
        const pattern = (config as any).pattern
        const match = rowText.match(pattern)
        if (match) {
          currentCard[field] = match[1]
        }
      }
    }
    
    // 提取卡片内表格
    if (currentCard && row[0] && row[1]) {
      const item: any = { ...currentCard }
      
      for (const mapping of fieldMappings) {
        if (mapping.sourceType === 'card_table') {
          item[mapping.field] = row[mapping.column]
        }
      }
      
      currentCard.items.push(item)
    }
  }
  
  if (currentCard) {
    result.push(...currentCard.items)
  }
  
  return result
}

// 矩阵转置提取
function extractMatrix(data: any[][], structure: any, fieldMappings: any[]) {
  const result: any[] = []
  const skuFields = ['skuCode', 'skuName']
  const skuData: any[] = []
  
  // 提取 SKU 基本信息列
  const startRow = structure.dataStartRow || 1
  for (let i = startRow; i < data.length; i++) {
    const row = data[i]
    const item: any = {}
    
    for (const mapping of fieldMappings) {
      if (skuFields.includes(mapping.field)) {
        item[mapping.field] = row[mapping.column_index || 0]
      }
    }
    
    skuData.push(item)
  }
  
  // TODO: 实现矩阵转置逻辑
  
  return skuData
}
