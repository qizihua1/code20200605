import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { dispatchPendingEvents, retryFailedEvents } from '@/lib/outbox-dispatcher'

// Vercel Cron 调用：每分钟执行
// 1. 分发待处理的 Outbox 事件
// 2. 重试失败的 Outbox 事件
// 3. 扫描超时任务并标记失败
export async function GET(request: NextRequest) {
  // 验证 Vercel Cron 请求
  const authHeader = request.headers.get('authorization')
  if (process.env.CRON_SECRET && authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const results = {
    dispatched: 0,
    retried: 0,
    stuckTasksRecovered: 0,
    stuckBatchesRecovered: 0,
    errors: [] as string[],
  }

  try {
    // 1. 分发待处理的 Outbox 事件
    const dispatchResult = await dispatchPendingEvents()
    results.dispatched = dispatchResult.dispatched
  } catch (e: any) {
    results.errors.push(`dispatch: ${e.message}`)
  }

  try {
    // 2. 重试失败的 Outbox 事件
    const retryResult = await retryFailedEvents()
    results.retried = retryResult.retried
  } catch (e: any) {
    results.errors.push(`retry: ${e.message}`)
  }

  try {
    // 3. 扫描超时任务（PENDING 超过 5 分钟未变更为 PROCESSING）
    const fiveMinutesAgo = new Date(Date.now() - 5 * 60 * 1000)
    const stuckTasks = await prisma.importTask.findMany({
      where: {
        status: 'PENDING',
        createdAt: { lt: fiveMinutesAgo },
      },
      select: { id: true, traceId: true },
    })

    for (const task of stuckTasks) {
      await prisma.importTask.update({
        where: { id: task.id },
        data: {
          status: 'FAILED',
          completedAt: new Date(),
        },
      })
      results.stuckTasksRecovered++
    }
  } catch (e: any) {
    results.errors.push(`stuckTasks: ${e.message}`)
  }

  try {
    // 4. 扫描超时批次（PROCESSING 超过 3 分钟）
    const threeMinutesAgo = new Date(Date.now() - 3 * 60 * 1000)
    const stuckBatches = await prisma.importBatch.findMany({
      where: {
        status: 'PROCESSING',
        createdAt: { lt: threeMinutesAgo },
      },
      select: { id: true, taskId: true },
    })

    for (const batch of stuckBatches) {
      await prisma.importBatch.update({
        where: { id: batch.id },
        data: { status: 'FAILED' },
      })
      results.stuckBatchesRecovered++
    }
  } catch (e: any) {
    results.errors.push(`stuckBatches: ${e.message}`)
  }

  console.log('[Cron Recovery]', results)

  return NextResponse.json({
    success: true,
    ...results,
  })
}
