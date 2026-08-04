import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'

export async function GET() {
  try {
    const fiveMinutesAgo = new Date(Date.now() - 5 * 60 * 1000)
    const oneHourAgo = new Date(Date.now() - 60 * 60 * 1000)
    
    const [
      recentTasks,
      pendingOutbox,
      recentBatches,
      errorDistribution,
      performanceStats,
    ] = await Promise.all([
      prisma.importTask.findMany({
        where: { createdAt: { gte: fiveMinutesAgo } },
        select: {
          id: true,
          status: true,
          totalRows: true,
          processedRows: true,
          successRows: true,
          failedRows: true,
          createdAt: true,
        },
        orderBy: { createdAt: 'desc' },
        take: 50,
      }),
      
      prisma.eventOutbox.count({
        where: { status: 'PENDING' },
      }),
      
      prisma.importTaskBatch.findMany({
        where: { status: 'PENDING' },
        select: {
          id: true,
          taskId: true,
          unitId: true,
          endRow: true,
        },
      }),
      
      prisma.importTaskError.groupBy({
        by: ['errorCode'],
        where: { createdAt: { gte: oneHourAgo } },
        _count: { errorCode: true },
      }),
      
      prisma.batchPerformanceLog.aggregate({
        where: { createdAt: { gte: oneHourAgo } },
        _avg: {
          parseDurationMs: true,
          ruleDurationMs: true,
          validateDurationMs: true,
          insertDurationMs: true,
          totalDurationMs: true,
        },
      }),
    ])
    
    const throughput = calculateThroughput(recentTasks)
    const pendingRows = recentBatches.reduce((sum, b) => sum + (b.endRow || 0), 0)
    
    const errorDistributionFormatted = errorDistribution.map(e => ({
      error_code: e.errorCode,
      count: e._count.errorCode,
    }))
    
    return NextResponse.json({
      timestamp: new Date().toISOString(),
      throughput: {
        rows_per_minute: throughput.rowsPerMinute,
        total_processed: throughput.totalProcessed,
        time_range: '5m',
      },
      queue: {
        pending_events: pendingOutbox,
        pending_batches: recentBatches.length,
        pending_rows: pendingRows,
        alert: pendingRows > 5000,
      },
      performance: {
        avg_parse_ms: Math.round(performanceStats._avg.parseDurationMs || 0),
        avg_rule_ms: Math.round(performanceStats._avg.ruleDurationMs || 0),
        avg_validate_ms: Math.round(performanceStats._avg.validateDurationMs || 0),
        avg_insert_ms: Math.round(performanceStats._avg.insertDurationMs || 0),
        avg_total_ms: Math.round(performanceStats._avg.totalDurationMs || 0),
      },
      errors: {
        distribution: errorDistributionFormatted,
        total_last_hour: errorDistributionFormatted.reduce((sum, e) => sum + e.count, 0),
      },
      recent_tasks: recentTasks.map(t => ({
        id: t.id,
        status: t.status,
        total_rows: t.totalRows,
        processed_rows: t.processedRows,
        success_rows: t.successRows,
        failed_rows: t.failedRows,
        created_at: t.createdAt,
      })),
    })
    
  } catch (error: any) {
    console.error('Get monitor summary failed:', error)
    
    return NextResponse.json({
      error: '获取监控数据失败',
      details: error.message,
    }, { status: 500 })
  }
}

function calculateThroughput(tasks: any[]) {
  const totalProcessed = tasks.reduce((sum, t) => sum + (t.successRows + t.failedRows), 0)
  
  return {
    rowsPerMinute: Math.round((totalProcessed / 5) * 100) / 100,
    totalProcessed,
  }
}
