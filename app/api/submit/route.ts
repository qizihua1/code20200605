import { NextRequest, NextResponse } from 'next/server'
import { PrismaClient } from '@prisma/client'

const prisma = new PrismaClient()

export async function POST(request: NextRequest) {
  try {
    const { data } = await request.json()
    
    if (!data || !Array.isArray(data) || data.length === 0) {
      return NextResponse.json({ error: '没有数据可提交' }, { status: 400 })
    }
    
    const groupedData = new Map<string, any[]>()
    data.forEach(item => {
      const key = item.externalCode || `UNGROUPED-${Date.now()}-${Math.random()}`
      if (!groupedData.has(key)) {
        groupedData.set(key, [])
      }
      groupedData.get(key)!.push(item)
    })
    
    const shipments: any[] = []
    for (const [externalCode, items] of groupedData) {
      const firstItem = items[0]
      
      const shipment = await prisma.shipment.create({
        data: {
          externalCode: externalCode.startsWith('UNGROUPED-') ? null : externalCode,
          storeName: firstItem.storeName || '',
          recipientName: firstItem.recipientName || '',
          recipientPhone: firstItem.recipientPhone || '',
          recipientAddress: firstItem.recipientAddress || '',
          status: 'pending',
          items: {
            create: items.map(item => ({
              skuCode: item.skuCode || 'UNKNOWN',
              skuName: item.skuName || '',
              quantity: item.quantity || 0,
              specification: item.specification || '',
              remarks: item.remarks || '',
            }))
          }
        },
        include: {
          items: true
        }
      })
      shipments.push(shipment)
    }
    
    return NextResponse.json({
      success: true,
      shipments,
      total: data.length,
      message: `成功提交 ${shipments.length} 个运单，共 ${data.length} 条商品记录`,
    })
    
  } catch (error: any) {
    console.error('Submit error:', error.message, error.stack)
    return NextResponse.json({
      error: '提交失败',
      details: error.message,
    }, { status: 500 })
  } finally {
    await prisma.$disconnect()
  }
}
