import { PrismaClient } from '@prisma/client'
import * as XLSX from 'xlsx'
import * as fs from 'fs'
import * as path from 'path'

const prisma = new PrismaClient()

const SKU_COUNT = 20000
const ORDER_COUNT = 10000
const TEST_DATA_DIR = path.join(process.cwd(), 'test-data')

async function main() {
  console.log('🚀 开始生成压测数据...')
  console.log(`   SKU数量: ${SKU_COUNT}`)
  console.log(`   订单行数: ${ORDER_COUNT}`)

  if (!fs.existsSync(TEST_DATA_DIR)) {
    fs.mkdirSync(TEST_DATA_DIR, { recursive: true })
  }

  console.log('\n📦 步骤 1: 清理旧数据...')
  await prisma.skuMaster.deleteMany()
  console.log('   已清理 SKU 主数据')

  console.log(`\n📦 步骤 2: 生成 ${SKU_COUNT} 条 SKU 主数据...`)
  const skuData = []
  const categories = ['电子', '日用', '食品', '服装', '文具', '家居', '运动', '美妆']
  const units = ['个', '盒', '包', '瓶', '箱', '袋']
  
  for (let i = 1; i <= SKU_COUNT; i++) {
    const skuCode = `SKU_${String(i).padStart(5, '0')}`
    const category = categories[Math.floor(Math.random() * categories.length)]
    const unit = units[Math.floor(Math.random() * units.length)]
    
    skuData.push({
      skuCode,
      name: `${category}商品-${i}`,
      spec: `${Math.floor(Math.random() * 100) + 1}${['ml', 'g', 'kg', 'L', 'mm', 'cm'][Math.floor(Math.random() * 6)]}`,
      unit,
    })
  }

  const batchSize = 5000
  for (let i = 0; i < skuData.length; i += batchSize) {
    const batch = skuData.slice(i, i + batchSize)
    await prisma.skuMaster.createMany({ data: batch })
    console.log(`   已插入 ${Math.min(i + batchSize, skuData.length)} / ${skuData.length} 条 SKU`)
  }

  const validSkuCodes = skuData.map(s => s.skuCode)
  const invalidSkuCode = 'SKU_99999'
  console.log(`\n   ✅ SKU 主数据生成完成`)

  console.log(`\n📦 步骤 3: 生成 ${ORDER_COUNT} 行运单 Excel 文件...`)
  
  const stores = [
    '旗舰店-浦东新区',
    '旗舰店-徐汇区',
    '旗舰店-静安区',
    '标准店-长宁区',
    '标准店-黄浦区',
    '标准店-虹口区',
    '标准店-杨浦区',
    '便利店-闵行区',
    '便利店-宝山区',
    '便利店-嘉定区',
  ]
  
  const recipients = [
    { name: '张三', phone: '13812345678' },
    { name: '李四', phone: '13987654321' },
    { name: '王五', phone: '13611112222' },
    { name: '赵六', phone: '13733334444' },
    { name: '钱七', phone: '13555556666' },
  ]
  
  const orderData = []
  
  for (let i = 1; i <= ORDER_COUNT; i++) {
    let skuCode: string
    if (i % 100 === 0) {
      skuCode = invalidSkuCode
    } else {
      skuCode = validSkuCodes[Math.floor(Math.random() * validSkuCodes.length)]
    }
    
    const useStore = Math.random() > 0.3
    const store = stores[Math.floor(Math.random() * stores.length)]
    const recipient = recipients[Math.floor(Math.random() * recipients.length)]
    
    const phone = i % 50 === 0 ? 'invalid-phone' : recipient.phone
    
    orderData.push({
      '外部编码': `ORD-${Date.now()}-${String(i).padStart(5, '0')}`,
      '收货门店': useStore ? store : '',
      '收件人姓名': useStore ? '' : recipient.name,
      '收件人电话': useStore ? '' : phone,
      '收件人地址': useStore ? '' : `${['上海市', '北京市', '广州市', '深圳市'][Math.floor(Math.random() * 4)]}朝阳区某某路${Math.floor(Math.random() * 1000) + 1}号`,
      'SKU编码': skuCode,
      'SKU名称': skuData.find(s => s.skuCode === skuCode)?.name || '未知商品',
      '数量': Math.floor(Math.random() * 100) + 1,
      '规格型号': skuData.find(s => s.skuCode === skuCode)?.spec || '',
      '备注': i % 20 === 0 ? '加急处理' : '',
    })
  }

  const worksheet = XLSX.utils.json_to_sheet(orderData)
  const workbook = XLSX.utils.book_new()
  XLSX.utils.book_append_sheet(workbook, worksheet, '出库单')
  
  const excelPath = path.join(TEST_DATA_DIR, '10000-orders.xlsx')
  XLSX.writeFile(workbook, excelPath)
  console.log(`   ✅ Excel 文件已生成: ${excelPath}`)
  console.log(`   📊 文件大小: ${(fs.statSync(excelPath).size / 1024).toFixed(2)} KB`)

  console.log('\n📦 步骤 4: 验证数据...')
  const skuCount = await prisma.skuMaster.count()
  console.log(`   SKU 总数: ${skuCount}`)

  console.log('\n✅ 压测数据生成完成！')
  console.log('\n📋 使用说明:')
  console.log('   1. SKU 主数据已写入数据库')
  console.log('   2. 压测 Excel 文件位于: test-data/10000-orders.xlsx')
  console.log('   3. 运行 `npm run db:push` 确保数据库结构正确')
}

main()
  .catch((e) => {
    console.error('❌ 生成失败:', e)
    process.exit(1)
  })
  .finally(() => prisma.$disconnect())
