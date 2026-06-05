import { NextRequest, NextResponse } from 'next/server'

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url)
    const page = parseInt(searchParams.get('page') || '1')
    const pageSize = parseInt(searchParams.get('pageSize') || '10')
    const keyword = searchParams.get('keyword') || ''
    
    const prisma = await import('@/lib/prisma').then(m => m.prisma)
    
    // 构建查询条件
    const where: any = {}
    if (keyword) {
      where.OR = [
        { externalCode: { contains: keyword } },
        { recipientName: { contains: keyword } },
        { storeName: { contains: keyword } },
      ]
    }
    
    const [shipments, total] = await Promise.all([
      prisma.shipment.findMany({
        where,
        skip: (page - 1) * pageSize,
        take: pageSize,
        orderBy: { createdAt: 'desc' },
        include: {
          items: true,
        },
      }),
      prisma.shipment.count({ where }),
    ])
    
    return NextResponse.json({
      data: shipments,
      total,
      page,
      pageSize,
    })
  } catch (error) {
    console.error('Get shipments error:', error)
    return NextResponse.json(
      { error: '获取运单列表失败' },
      { status: 500 }
    )
  }
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json()
    const { shipments, parsingRuleId } = body
    
    if (!Array.isArray(shipments) || shipments.length === 0) {
      return NextResponse.json(
        { error: '运单数据不能为空' },
        { status: 400 }
      )
    }
    
    const prisma = await import('@/lib/prisma').then(m => m.prisma)
    
    // 批量创建运单
    const created: any[] = []
    const failed: any[] = []
    
    for (const shipment of shipments) {
      try {
        const { items, ...shipmentData } = shipment
        
        // 验证 A/B 组必填
        const hasStore = !!shipmentData.storeName
        const hasRecipient = !!(shipmentData.recipientName && shipmentData.recipientPhone && shipmentData.recipientAddress)
        
        if (!hasStore && !hasRecipient) {
          failed.push({
            ...shipment,
            error: '缺少收货信息：必须填写 A 组 (门店) 或 B 组 (收件人信息)',
          })
          continue
        }
        
        const createdShipment = await prisma.shipment.create({
          data: {
            ...shipmentData,
            parsingRuleId,
            items: {
              create: Array.isArray(items) 
                ? items.map((item: any) => ({
                    skuCode: item.skuCode,
                    skuName: item.skuName,
                    quantity: item.quantity,
                    specification: item.specification,
                    remarks: item.remarks,
                  }))
                : [],
            },
            status: 'submitted',
            submittedAt: new Date(),
          },
          include: { items: true },
        })
        
        created.push(createdShipment)
      } catch (err: any) {
        failed.push({
          ...shipment,
          error: err.message || '创建失败',
        })
      }
    }
    
    return NextResponse.json({
      success: created.length,
      failed: failed.length,
      data: created,
      errors: failed,
    })
  } catch (error) {
    console.error('Create shipments error:', error)
    return NextResponse.json(
      { error: '批量创建运单失败' },
      { status: 500 }
    )
  }
}
