import { NextRequest, NextResponse } from 'next/server'
import { createImportTask } from '@/lib/task-service'
import { prisma } from '@/lib/prisma'
import { dispatchPendingEvents } from '@/lib/outbox-dispatcher'

export async function POST(request: NextRequest) {
  try {
    const formData = await request.formData()
    const file = formData.get('file') as File
    const ruleId = formData.get('ruleId') as string | null
    
    if (!file) {
      return NextResponse.json({ error: '缺少文件' }, { status: 400 })
    }
    
    const buffer = await file.arrayBuffer()
    
    const result = await createImportTask({
      file: buffer,
      fileName: file.name,
      ruleId: ruleId || undefined,
    })
    
    dispatchPendingEvents().catch(err => {
      console.error('Immediate outbox dispatch failed:', err)
    })
    
    return NextResponse.json({
      task_id: result.task_id,
      trace_id: result.trace_id,
      status: result.status,
      total_rows: result.total_rows,
      total_batches: result.total_batches,
    })
    
  } catch (error: any) {
    console.error('Import task creation failed:', error)
    
    return NextResponse.json({
      error: '创建导入任务失败',
      details: error.message,
    }, { status: 500 })
  }
}

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url)
    const page = parseInt(searchParams.get('page') || '1')
    const pageSize = parseInt(searchParams.get('page_size') || '20')
    const status = searchParams.get('status')
    
    const where: any = {}
    if (status) {
      where.status = status
    }
    
    const [tasks, total] = await Promise.all([
      prisma.importTask.findMany({
        where,
        orderBy: { createdAt: 'desc' },
        skip: (page - 1) * pageSize,
        take: pageSize,
        include: {
          batches: {
            orderBy: { batchIndex: 'asc' },
          },
        },
      }),
      prisma.importTask.count({ where }),
    ])
    
    return NextResponse.json({
      tasks: tasks.map(t => ({
        task_id: t.taskId,
        trace_id: t.traceId,
        status: t.status,
        file_name: t.fileName,
        total_rows: t.totalRows,
        processed_rows: t.processedRows,
        success_rows: t.successRows,
        failed_rows: t.failedRows,
        total_batches: t.totalBatches,
        completed_batches: t.completedBatches,
        degraded: t.degraded,
        created_at: t.createdAt,
        completed_at: t.completedAt,
        batches: t.batches.map(b => ({
          unit_id: b.unitId,
          batch_index: b.batchIndex,
          status: b.status,
          start_row: b.startRow,
          end_row: b.endRow,
        })),
      })),
      pagination: {
        page,
        page_size: pageSize,
        total,
        total_pages: Math.ceil(total / pageSize),
      },
    })
  } catch (error: any) {
    console.error('Get import tasks failed:', error)
    return NextResponse.json({
      error: '获取任务列表失败',
      details: error.message,
    }, { status: 500 })
  }
}
