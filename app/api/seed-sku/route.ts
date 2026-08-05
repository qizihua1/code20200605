import { NextResponse } from 'next/server'
import { PrismaClient } from '@prisma/client'

const prisma = new PrismaClient()

export async function GET() {
  console.log('🚀 开始生成 SKU 主数据...')
  
  const SKU_COUNT = 20000
  const categories = ['电子', '日用', '食品', '服装', '文具', '家居', '运动', '美妆']
  const units = ['个', '盒', '包', '瓶', '箱', '袋']
  
  const skuData = []
  
  for (let i = 1; i <= SKU_COUNT; i++) {
    const skuCode = `SKU_${String(i).padStart(5, '0')}`
    const category = categories[i % categories.length]
    const unit = units[i % units.length]
    
    skuData.push({
      skuCode,
      name: `${category}商品-${i}`,
      spec: `${(i % 100) + 1}ml`,
      unit,
    })
  }
  
  console.log(`准备写入 ${skuData.length} 条 SKU...`)
  
  const batchSize = 5000
  let totalCreated = 0
  
  for (let i = 0; i < skuData.length; i += batchSize) {
    const batch = skuData.slice(i, i + batchSize)
    const created = await prisma.skuMaster.createMany({ data: batch, skipDuplicates: true })
    totalCreated += created.count
    console.log(`进度: ${totalCreated}/${skuData.length}`)
  }
  
  const total = await prisma.skuMaster.count()
  
  return NextResponse.json({
    success: true,
    message: `SKU 主数据生成完成`,
    totalCreated,
    totalInDatabase: total,
  })
}
