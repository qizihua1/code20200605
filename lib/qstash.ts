import { Client } from '@upstash/qstash'

const qstashClient = new Client({
  token: process.env.QSTASH_TOKEN || '',
})

export { qstashClient }

export async function publishBatchJob(taskId: string, unitId: string, batchIndex: number, payload: any) {
  const jobId = `${taskId}-${unitId}`
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
