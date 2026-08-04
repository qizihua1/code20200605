import { NextRequest, NextResponse } from 'next/server'
import { dispatchPendingEvents, retryFailedEvents } from '@/lib/outbox-dispatcher'

export async function GET() {
  try {
    const { dispatched, failed } = await dispatchPendingEvents()
    
    return NextResponse.json({
      success: true,
      dispatched,
      failed,
    })
    
  } catch (error: any) {
    console.error('Outbox dispatch failed:', error)
    
    return NextResponse.json({
      error: 'Outbox分发失败',
      details: error.message,
    }, { status: 500 })
  }
}

export async function POST() {
  try {
    const { retried } = await retryFailedEvents()
    
    return NextResponse.json({
      success: true,
      retried,
    })
    
  } catch (error: any) {
    console.error('Outbox retry failed:', error)
    
    return NextResponse.json({
      error: '重试失败',
      details: error.message,
    }, { status: 500 })
  }
}
