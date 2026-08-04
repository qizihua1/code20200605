import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'

export async function GET(
  request: NextRequest,
  { params }: { params: { taskId: string } }
) {
  try {
    const { taskId } = params
    
    const batches = await prisma.importTaskBatch.findMany({
      where: { taskId },
      include: {
        performanceLog: {
          select: {
            parseDurationMs: true,
            ruleDurationMs: true,
            validateDurationMs: true,
            insertDurationMs: true,
            totalDurationMs: true,
          },
        },
      },
      orderBy: { batchIndex: 'asc' },
    })
    
    const summary = {
      total: batches.length,
      pending: batches.filter(b => b.status === 'PENDING').length,
      processing: batches.filter(b => b.status === 'PROCESSING').length,
      completed: batches.filter(b => b.status === 'COMPLETED').length,
      failed: batches.filter(b => b.status === 'FAILED').length,
      avgDurationMs: batches.length > 0
        ? Math.round(batches.reduce((sum, b) => sum + (b.performanceLog?.totalDurationMs || 0), 0) / batches.length)
        : 0,
    }
    
    return NextResponse.json({
      task_id: taskId,
      summary,
      batches: batches.map(b => ({
        unit_id: b.unitId,
        batch_index: b.batchIndex,
        start_row: b.startRow,
        end_row: b.endRow,
        status: b.status,
        retry_count: b.retryCount,
        performance: b.performanceLog ? {
          parse_ms: b.performanceLog.parseDurationMs,
          rule_ms: b.performanceLog.ruleDurationMs,
          validate_ms: b.performanceLog.validateDurationMs,
          insert_ms: b.performanceLog.insertDurationMs,
          total_ms: b.performanceLog.totalDurationMs,
        } : null,
      })),
    })
    
  } catch (error: any) {
    console.error('Get task batches failed:', error)
    
    return NextResponse.json({
      error: '查询批次列表失败',
      details: error.message,
    }, { status: 500 })
  }
}
