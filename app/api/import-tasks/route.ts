import { NextRequest, NextResponse } from 'next/server'
import { createImportTask } from '@/lib/task-service'
import { logTraceEvent } from '@/lib/trace'
import { prisma } from '@/lib/prisma'
import { dispatchPendingEvents } from '@/lib/outbox-dispatcher'

export async function POST(request: NextRequest) {
  try {
    const formData = await request.formData()
    const file = formData.get('file') as File
    const ruleId = formData.get('ruleId') as string | null
    
    if (!file) {
      return NextResponse.json({ error: '缺少文件' }, { status: 400 })
    }
    
    const buffer = await file.arrayBuffer()
    
    const result = await createImportTask({
      file: buffer,
      fileName: file.name,
      ruleId: ruleId || undefined,
    })
    
    dispatchPendingEvents().catch(err => {
      console.error('Immediate outbox dispatch failed (will retry via cron):', err)
    })
    
    return NextResponse.json({
      task_id: result.task_id,
      trace_id: result.trace_id,
      status: result.status,
      total_rows: result.total_rows,
      total_batches: result.total_batches,
    })
    
  } catch (error: any) {
    console.error('Import task creation failed:', error)
    
    return NextResponse.json({
      error: '创建导入任务失败',
      details: error.message,
    }, { status: 500 })
  }
}
