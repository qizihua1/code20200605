import { NextRequest, NextResponse } from 'next/server'
import { PrismaClient } from '@prisma/client'
import { smartParse, parseWithRule, analyzeAndSuggestRule } from '@/lib/parser'

const prisma = new PrismaClient()

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
