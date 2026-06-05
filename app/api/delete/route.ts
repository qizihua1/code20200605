import { NextRequest, NextResponse } from 'next/server'
import { PrismaClient } from '@prisma/client'

const prisma = new PrismaClient()

export async function DELETE(request: NextRequest) {
  try {
    const { id } = await request.json()
    
    if (id) {
      const shipment = await prisma.shipment.findUnique({
        where: { id }
      })
      
      if (!shipment) {
        return NextResponse.json({ error: '运单不存在' }, { status: 404 })
      }
      
      await prisma.shipmentItem.deleteMany({
        where: { shipmentId: id }
      })
      
      await prisma.shipment.delete({
        where: { id }
      })
      
      return NextResponse.json({
        success: true,
        message: '删除成功'
      })
    } else {
      const itemCount = await prisma.shipmentItem.count()
      const shipmentCount = await prisma.shipment.count()
      
      await prisma.shipmentItem.deleteMany()
      await prisma.shipment.deleteMany()
      
      return NextResponse.json({
        success: true,
        message: `删除成功，共删除 ${shipmentCount} 个运单，${itemCount} 条商品记录`
      })
    }
    
  } catch (error: any) {
    console.error('Delete error:', error.message, error.stack)
    return NextResponse.json({
      error: '删除失败',
      details: error.message,
    }, { status: 500 })
  } finally {
    await prisma.$disconnect()
  }
}
