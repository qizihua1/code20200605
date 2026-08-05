const { PrismaClient } = require('@prisma/client');

const prisma = new PrismaClient();

async function seedSkuMaster(count = 20000) {
  console.log(`开始生成 ${count} 条 SKU 主数据...`);
  
  const skuData = [];
  
  const categories = ['电子', '服装', '食品', '家居', '美妆', '运动', '图书', '玩具'];
  const brands = ['品牌A', '品牌B', '品牌C', '品牌D', '品牌E'];
  const units = ['个', '件', '盒', '瓶', '袋', '套'];
  const specs = ['标准', '大号', '小号', '加厚', '经典'];
  
  for (let i = 1; i <= count; i++) {
    const skuCode = 'SKU' + String(i).padStart(5, '0');
    const category = categories[i % categories.length];
    const brand = brands[i % brands.length];
    const unit = units[i % units.length];
    const spec = specs[i % specs.length];
    
    skuData.push({
      skuCode,
      name: `${brand}${category}商品${i}`,
      spec: spec,
      unit: unit,
    });
  }
  
  console.log(`准备写入 ${skuData.length} 条 SKU...`);
  
  const batchSize = 5000;
  let totalCreated = 0;
  
  for (let i = 0; i < skuData.length; i += batchSize) {
    const batch = skuData.slice(i, i + batchSize);
    const created = await prisma.skuMaster.createMany({ data: batch, skipDuplicates: true });
    totalCreated += created.count;
    console.log(`进度: ${totalCreated}/${skuData.length}`);
  }
  
  console.log(`完成！共创建 ${totalCreated} 条 SKU 主数据`);
  
  await prisma.$disconnect();
}

seedSkuMaster(20000).catch(console.error);
