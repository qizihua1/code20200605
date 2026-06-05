import { NextRequest, NextResponse } from 'next/server'
import { PrismaClient } from '@prisma/client'

const prisma = new PrismaClient()

// GET /api/rules - 获取所有规则
export async function GET() {
  try {
    const rules = await prisma.parsingRule.findMany({
      orderBy: { updatedAt: 'desc' },
      include: {
        shipments: {
          select: {
            id: true,
            externalCode: true,
            createdAt: true,
          }
        },
        _count: {
          select: { shipments: true }
        }
      }
    })
    
    return NextResponse.json({ rules })
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 })
  }
}

// POST /api/rules - 创建规则
export async function POST(request: NextRequest) {
  try {
    const body = await request.json()
    const { name, description, fileFormat, fileNamePattern, structure, fieldMappings, transformations } = body
    
    const rule = await prisma.parsingRule.create({
      data: {
        name,
        description,
        fileFormat,
        fileNamePattern,
        structure,
        fieldMappings,
        transformations,
      }
    })
    
    return NextResponse.json({ rule })
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 })
  }
}

// PUT /api/rules - 更新规则
export async function PUT(request: NextRequest) {
  try {
    const body = await request.json()
    const { id, ...data } = body
    
    const rule = await prisma.parsingRule.update({
      where: { id },
      data,
    })
    
    return NextResponse.json({ rule })
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 })
  }
}

// DELETE /api/rules - 删除规则
export async function DELETE(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url)
    const id = searchParams.get('id')
    
    if (!id) {
      return NextResponse.json({ error: '缺少规则 ID' }, { status: 400 })
    }
    
    await prisma.parsingRule.delete({
      where: { id }
    })
    
    return NextResponse.json({ success: true })
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 })
  }
}
