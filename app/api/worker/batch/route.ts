import { NextRequest, NextResponse } from 'next/server'
import { processBatch } from '@/lib/batch-processor'
import { prisma } from '@/lib/prisma'

export async function POST(request: NextRequest) {
  try {
    const body = await request.json()
    
    const { task_id, unit_id, batch_index, ...payload } = body
    
    if (!task_id || !unit_id) {
      return NextResponse.json({ error: '缺少必要参数' }, { status: 400 })
    }
    
    const batch = await prisma.importTaskBatch.findUnique({
      where: { taskId_unitId: { taskId: task_id, unitId: unit_id } },
    })
    
    if (batch?.status === 'COMPLETED') {
      return NextResponse.json({
        success: true,
        message: '批次已完成，跳过处理',
        skipped: true,
      })
    }
    
    const result = await processBatch({
      task_id,
      unit_id,
      batch_index: batch_index || 0,
      ...payload,
    })
    
    return NextResponse.json({
      success: result.success,
      processed: result.processed,
      errors: result.errors,
    })
    
  } catch (error: any) {
    console.error('Worker batch processing failed:', error)
    
    return NextResponse.json({
      error: '批处理失败',
      details: error.message,
    }, { status: 500 })
  }
}
