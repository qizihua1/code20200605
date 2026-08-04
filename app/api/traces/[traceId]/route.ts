import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'

export async function GET(
  request: NextRequest,
  { params }: { params: { traceId: string } }
) {
  try {
    const { traceId } = params
    const { searchParams } = new URL(request.url)
    
    const taskId = searchParams.get('task_id')
    const errorCode = searchParams.get('error_code')
    
    const where: any = { traceId }
    
    if (taskId) {
      where.taskId = taskId
    }
    
    const [traceEvents, errors] = await Promise.all([
      prisma.traceEvent.findMany({
        where,
        orderBy: { occurredAt: 'asc' },
        take: 100,
      }),
      
      errorCode 
        ? prisma.importTaskError.findMany({
            where: { traceId, errorCode },
            orderBy: { rowNumber: 'asc' },
            take: 50,
          })
        : prisma.importTaskError.findMany({
            where: { traceId },
            orderBy: { rowNumber: 'asc' },
            take: 50,
          }),
    ])
    
    const task = traceEvents.length > 0 && traceEvents[0].taskId
      ? await prisma.importTask.findUnique({
          where: { taskId: traceEvents[0].taskId! },
        })
      : null
    
    return NextResponse.json({
      trace_id: traceId,
      task_id: task?.taskId || null,
      task_status: task?.status || null,
      events: traceEvents.map(e => ({
        event_name: e.eventName,
        event_status: e.eventStatus,
        message: e.message,
        unit_id: e.unitId,
        occurred_at: e.occurredAt,
      })),
      errors: errors.map(e => ({
        row_number: e.rowNumber,
        field_name: e.fieldName,
        error_code: e.errorCode,
        error_reason: e.errorReason,
        raw_value: e.rawValue,
        batch_index: e.batchIndex,
      })),
    })
    
  } catch (error: any) {
    console.error('Get trace failed:', error)
    
    return NextResponse.json({
      error: '查询Trace失败',
      details: error.message,
    }, { status: 500 })
  }
}
