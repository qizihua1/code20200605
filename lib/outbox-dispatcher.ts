import { prisma } from './prisma'
import { publishBatchJob } from './qstash'
import { logTraceEvent } from './trace'

export async function dispatchPendingEvents(): Promise<{ dispatched: number; failed: number }> {
  const pendingEvents = await prisma.eventOutbox.findMany({
    where: {
      status: 'PENDING',
      OR: [
        { nextRetryAt: { lte: new Date() } },
        { nextRetryAt: null },
      ],
    },
    take: 50,
  })
  
  let dispatched = 0
  let failed = 0
  
  for (const event of pendingEvents) {
    try {
      if (event.eventType === 'ImportBatchCreated') {
        const { task_id, unit_id, batch_index } = event.payload as any
        
        await publishBatchJob(task_id, unit_id, batch_index, event.payload)
        
        await prisma.eventOutbox.update({
          where: { id: event.id },
          data: {
            status: 'SENT',
            sentAt: new Date(),
          },
        })
        
        const task = await prisma.importTask.findUnique({ where: { taskId: task_id } })
        if (task) {
          await logTraceEvent(prisma, task.traceId, 'ImportBatchDispatched', 'SUCCESS', `批次 ${unit_id} 已分发`, task_id, unit_id)
        }
        
        dispatched++
      }
    } catch (error) {
      console.error(`Failed to dispatch event ${event.id}:`, error)
      
      const nextRetryCount = event.retryCount + 1
      const backoffSeconds = Math.min(60 * Math.pow(2, nextRetryCount), 3600)
      
      await prisma.eventOutbox.update({
        where: { id: event.id },
        data: {
          status: nextRetryCount >= 5 ? 'FAILED' : 'PENDING',
          retryCount: nextRetryCount,
          nextRetryAt: new Date(Date.now() + backoffSeconds * 1000),
        },
      })
      
      failed++
    }
  }
  
  return { dispatched, failed }
}

export async function retryFailedEvents(): Promise<{ retried: number }> {
  const failedEvents = await prisma.eventOutbox.findMany({
    where: { status: 'FAILED' },
  })
  
  let retried = 0
  
  for (const event of failedEvents) {
    try {
      await prisma.eventOutbox.update({
        where: { id: event.id },
        data: {
          status: 'PENDING',
          retryCount: 0,
          nextRetryAt: new Date(),
        },
      })
      retried++
    } catch (error) {
      console.error(`Failed to retry event ${event.id}:`, error)
    }
  }
  
  return { retried }
}
