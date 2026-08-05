import * as XLSX from 'xlsx';
import * as fs from 'fs';

// 创建测试数据
const data = [
  { SKU: 'SKU001', 数量: 10, 单价: 100.00, 备注: '测试商品1' },
  { SKU: 'SKU002', 数量: 20, 单价: 200.00, 备注: '测试商品2' },
  { SKU: 'SKU003', 数量: 30, 单价: 300.00, 备注: '测试商品3' },
  { SKU: 'SKU004', 数量: 40, 单价: 400.00, 备注: '测试商品4' },
  { SKU: 'SKU005', 数量: 50, 单价: 500.00, 备注: '测试商品5' },
];

// 创建工作簿
const ws = XLSX.utils.json_to_sheet(data);
const wb = XLSX.utils.book_new();
XLSX.utils.book_append_sheet(wb, ws, 'Sheet1');

// 写入文件
XLSX.writeFile(wb, 'test-import.xlsx');
console.log('测试文件已创建: test-import.xlsx');
