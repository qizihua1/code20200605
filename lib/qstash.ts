import { Client } from '@upstash/qstash'
import { processBatch } from './batch-processor'

const qstashClient = process.env.QSTASH_TOKEN 
  ? new Client({ token: process.env.QSTASH_TOKEN })
  : null

export { qstashClient }

export async function publishBatchJob(taskId: string, unitId: string, batchIndex: number, payload: any) {
  const jobId = `${taskId}-${unitId}`
  
  // 无 QStash 或本地开发模式：直接处理批次
  if (!qstashClient) {
    console.log('[Direct Mode] Processing batch:', { taskId, unitId, batchIndex })
    try {
      const result = await processBatch({
        task_id: taskId,
        unit_id: unitId,
        batch_index: batchIndex,
        file_name: payload.file_name || '',
        rule_id: payload.rule_id,
        storage_key: payload.storage_key,
        start_row: payload.start_row,
        end_row: payload.end_row,
      })
      console.log('[Direct Mode] Batch result:', result)
      return jobId
    } catch (error) {
      console.error('[Direct Mode] Batch failed:', error)
      throw error
    }
  }
  
  // QStash 模式：通过消息队列分发
  const appUrl = process.env.NEXT_PUBLIC_APP_URL || 'https://code20200605.vercel.app'
  
  await qstashClient.publishJSON({
    url: `${appUrl}/api/worker/batch`,
    body: {
      task_id: taskId,
      unit_id: unitId,
      batch_index: batchIndex,
      ...payload,
    },
    retries: 3,
    retryBackoff: true,
    timeout: 300,
  })
  
  return jobId
}
