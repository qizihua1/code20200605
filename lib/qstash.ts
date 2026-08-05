import { Client } from '@upstash/qstash'
import { processBatch } from './batch-processor'

const qstashClient = process.env.QSTASH_TOKEN 
  ? new Client({ token: process.env.QSTASH_TOKEN })
  : null

export { qstashClient }

export async function publishBatchJob(taskId: string, unitId: string, batchIndex: number, payload: any) {
  const jobId = `${taskId}-${unitId}`
  
  // 本地开发模式：直接处理批次
  if (!qstashClient) {
    console.log('[Local Mode] Processing batch directly:', { taskId, unitId, batchIndex })
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
    console.log('[Local Mode] Batch result:', result)
    return jobId
  }
  
  // 生产模式：通过 QStash 分发
  const appUrl = process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3000'
  
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
