import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'

export async function GET(request: NextRequest, { params }: { params: { taskId: string } }) {
  try {
    const { taskId } = params
    
    const task = await prisma.importTask.findUnique({
      where: { taskId },
      include: {
        batches: {
          select: {
            id: true,
            unitId: true,
            batchIndex: true,
            status: true,
            startRow: true,
            endRow: true,
            retryCount: true,
          },
          orderBy: { batchIndex: 'asc' },
        },
      },
    })
    
    if (!task) {
      return NextResponse.json({ error: '任务不存在' }, { status: 404 })
    }
    
    const now = Date.now()
    const elapsedMs = task.completedAt 
      ? task.completedAt.getTime() - task.createdAt.getTime()
      : now - task.createdAt.getTime()
    
    const rowsPerSecond = task.processedRows / Math.max(1, elapsedMs / 1000)
    const remainingRows = task.totalRows - task.processedRows
    const estimatedSecondsRemaining = rowsPerSecond > 0 ? Math.ceil(remainingRows / rowsPerSecond) : 0
    
    return NextResponse.json({
      task_id: task.taskId,
      trace_id: task.traceId,
      status: task.status,
      total_rows: task.totalRows,
      processed_rows: task.processedRows,
      success_rows: task.successRows,
      failed_rows: task.failedRows,
      total_batches: task.totalBatches,
      completed_batches: task.completedBatches,
      degraded: task.degraded,
      elapsed_seconds: Math.floor(elapsedMs / 1000),
      rows_per_second: Math.round(rowsPerSecond * 100) / 100,
      estimated_seconds_remaining: estimatedSecondsRemaining,
      batches: task.batches,
      created_at: task.createdAt,
      completed_at: task.completedAt,
    })
    
  } catch (error: any) {
    console.error('Get import task failed:', error)
    
    return NextResponse.json({
      error: '查询任务失败',
      details: error.message,
    }, { status: 500 })
  }
}
