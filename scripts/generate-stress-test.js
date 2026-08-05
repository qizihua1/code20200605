const xlsx = require('xlsx');
const path = require('path');

function generateStressTestData(rowCount) {
  const data = [];
  
  for (let i = 1; i <= rowCount; i++) {
    data.push({
      订单号: 'ORDER_' + String(i).padStart(6, '0'),
      SKU编码: 'SKU' + String((i % 200) + 1).padStart(4, '0'),
      SKU名称: '商品' + ((i % 200) + 1),
      数量: Math.floor(Math.random() * 100) + 1,
      单价: (Math.random() * 1000 + 10).toFixed(2),
      收件人: '收件人' + i,
      联系电话: '138' + String(Math.floor(Math.random() * 100000000)).padStart(8, '0'),
      收件地址: '北京市朝阳区测试地址' + i + '号',
      规格: '规格' + ((i % 5) + 1),
      备注: i % 10 === 0 ? '加急订单' : '',
    });
  }
  
  const ws = xlsx.utils.json_to_sheet(data);
  ws['!cols'] = [
    { wch: 15 }, { wch: 12 }, { wch: 12 }, { wch: 8 },
    { wch: 10 }, { wch: 10 }, { wch: 14 }, { wch: 20 },
    { wch: 10 }, { wch: 15 }
  ];
  
  const wb = xlsx.utils.book_new();
  xlsx.utils.book_append_sheet(wb, ws, '订单数据');
  const fileName = 'stress-test-' + rowCount + 'rows.xlsx';
  const filePath = path.join(__dirname, '..', fileName);
  xlsx.writeFile(wb, filePath);
  console.log('已生成: ' + fileName + ' (' + rowCount + ' 行)');
  return filePath;
}

// 生成 10000 行测试文件
generateStressTestData(10000);
