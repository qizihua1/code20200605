import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'

export async function GET(
  request: NextRequest,
  { params }: { params: { taskId: string } }
) {
  try {
    const { taskId } = params
    const { searchParams } = new URL(request.url)
    
    const page = parseInt(searchParams.get('page') || '1')
    const pageSize = parseInt(searchParams.get('page_size') || '50')
    const batch = searchParams.get('batch')
    const errorCode = searchParams.get('error_code')
    
    const skip = (page - 1) * pageSize
    
    const where: any = { taskId }
    
    if (batch !== null) {
      where.batchIndex = parseInt(batch)
    }
    
    if (errorCode) {
      where.errorCode = errorCode
    }
    
    const [errors, totalCount] = await Promise.all([
      prisma.importTaskError.findMany({
        where,
        orderBy: [
          { rowNumber: 'asc' },
          { createdAt: 'asc' },
        ],
        skip,
        take: pageSize,
      }),
      prisma.importTaskError.count({ where }),
    ])
    
    return NextResponse.json({
      errors: errors.map(e => ({
        id: e.id,
        row_number: e.rowNumber,
        field_name: e.fieldName,
        raw_value: e.rawValue,
        error_code: e.errorCode,
        error_reason: e.errorReason,
        batch_index: e.batchIndex,
        created_at: e.createdAt,
      })),
      pagination: {
        page,
        page_size: pageSize,
        total: totalCount,
        total_pages: Math.ceil(totalCount / pageSize),
      },
      filters: {
        batch: batch ? parseInt(batch) : null,
        error_code: errorCode || null,
      },
    })
    
  } catch (error: any) {
    console.error('Get import task errors failed:', error)
    
    return NextResponse.json({
      error: '查询错误明细失败',
      details: error.message,
    }, { status: 500 })
  }
}
