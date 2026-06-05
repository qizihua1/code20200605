import { NextRequest, NextResponse } from 'next/server'
import { simulateAIGenerateRule } from '@/lib/ai-rule-generator'
import { PrismaClient } from '@prisma/client'
import * as XLSX from 'xlsx'

const prisma = new PrismaClient()

export async function POST(request: NextRequest) {
  try {
    const formData = await request.formData()
    const file = formData.get('file') as File | null
    const ruleId = formData.get('ruleId') as string | null

    if (!file) {
      return NextResponse.json({ error: '请上传文件' }, { status: 400 })
    }

    const bytes = await file.arrayBuffer()
    
    // 1. 如果没有 ruleId，说明是 AI 分析阶段
    if (!ruleId) {
      const result = simulateAIGenerateRule(file.name, bytes)
      return NextResponse.json(result)
    }

    // 2. 如果有 ruleId，执行解析
    const rule = await prisma.parsingRule.findUnique({
      where: { id: ruleId }
    })
    
    if (!rule) {
      return NextResponse.json({ error: '规则不存在，请先创建规则' }, { status: 404 })
    }

    // 执行解析
    const workbook = XLSX.read(bytes, { type: 'array' })
    const firstSheet = workbook.Sheets[workbook.SheetNames[0]]
    const data = XLSX.utils.sheet_to_json(firstSheet, { header: 1 }) as any[][]
    
    const structure = rule.structure as any
    const fieldMappings = rule.fieldMappings as any[]
    
    // 简化的解析逻辑（使用第一个 Sheet）
    const startRow = structure?.dataStartRow || structure?.headerSkip || 1
    const headerRow = data[startRow - 1] || []
    
    const colIndexMap: Record<string, number> = {}
    headerRow.forEach((h: any, idx: number) => {
      if (h) colIndexMap[String(h).trim()] = idx
    })
    
    const parsedData: any[] = []
    
    for (let i = startRow; i < data.length; i++) {
      const row = data[i]
      const item: any = {}
      
      // 从第一列提取外部编码（如果存在）
      item.externalCode = row[1] || `TEMP-${Date.now()}-${i}`
      
      // 字段映射
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
      
      // 只添加有 SKU 信息的行
      if (item.skuCode || item.skuName) {
        parsedData.push(item)
      }
    }

    // 保存到数据库
    if (parsedData.length > 0) {
      const shipment = await prisma.shipment.create({
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
      
      return NextResponse.json({
        success: true,
        data: shipment.items.map((i: any) => ({
          ...i,
          externalCode: shipment.externalCode,
          storeName: shipment.storeName,
        })),
        shipmentId: shipment.id,
        total: shipment.items.length,
        message: `成功解析 ${shipment.items.length} 条数据`
      })
    }
    
    return NextResponse.json({
      success: true,
      data: [],
      total: 0,
      message: '未解析到有效数据'
    })
    
  } catch (error: any) {
    console.error('Parse error:', error.message, error.stack)
    return NextResponse.json({
      error: '解析失败',
      details: error.message,
      hint: '请检查文件格式和规则配置'
    }, { status: 500 })
  } finally {
    await prisma.$disconnect()
  }
}
