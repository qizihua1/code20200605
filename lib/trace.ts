import { v4 as uuidv4 } from 'uuid'

export function generateTraceId(): string {
  return `trace_${uuidv4().replace(/-/g, '')}`
}

export function generateTaskId(): string {
  return `task_${uuidv4().replace(/-/g, '')}`
}

export function generateUnitId(batchIndex: number): string {
  return `unit_${String(batchIndex).padStart(3, '0')}`
}

export async function logTraceEvent(
  prisma: any,
  traceId: string,
  eventName: string,
  eventStatus: string,
  message?: string,
  taskId?: string,
  unitId?: string
) {
  try {
    await prisma.traceEvent.create({
      data: {
        traceId,
        taskId,
        unitId,
        eventName,
        eventStatus,
        message,
        occurredAt: new Date(),
      },
    })
  } catch (error) {
    console.error('Failed to log trace event:', error)
  }
}
