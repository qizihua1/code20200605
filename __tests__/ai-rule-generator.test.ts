import { simulateAIGenerateRule } from '../lib/ai-rule-generator';
import * as XLSX from 'xlsx';

describe('AI Rule Generator Tests', () => {
  describe('Basic Rule Generation', () => {
    it('should generate a rule for simple Excel files', async () => {
      // 创建一个简单的 Excel buffer
      const ws = XLSX.utils.aoa_to_sheet([
        ['姓名', '电话', '地址', '商品', '数量'],
        ['张三', '13800138000', '北京市朝阳区', '苹果', '10'],
        ['李四', '13900139000', '上海市浦东新区', '香蕉', '20']
      ]);
      const wb = XLSX.utils.book_new();
      XLSX.utils.book_append_sheet(wb, ws, 'Sheet1');
      const buffer = XLSX.write(wb, { type: 'buffer' });

      const result = await simulateAIGenerateRule('test.xlsx', buffer);
      expect(result).toBeDefined();
      expect(result.recommendedRules).toBeDefined();
      expect(result.recommendedRules.length).toBeGreaterThan(0);
    });

    it('should detect header rows correctly', async () => {
      const ws = XLSX.utils.aoa_to_sheet([
        ['说明：这是一个测试文件'],
        ['部门', '日期', '姓名', '商品', '数量'],
        ['销售部', '2024-01-01', '王五', '橙子', '5']
      ]);
      const wb = XLSX.utils.book_new();
      XLSX.utils.book_append_sheet(wb, ws, 'Sheet1');
      const buffer = XLSX.write(wb, { type: 'buffer' });

      const result = await simulateAIGenerateRule('test.xlsx', buffer);
      expect(result).toBeDefined();
      expect(result.recommendedRules.length).toBeGreaterThan(0);
    });
  });

  describe('Field Mapping Detection', () => {
    it('should map common field names correctly', async () => {
      const ws = XLSX.utils.aoa_to_sheet([
        ['收货人', '手机', '收货地址', '商品编码', '商品名称', '发货数量'],
        ['赵六', '13700137000', '深圳市南山区', 'A001', '苹果', '15']
      ]);
      const wb = XLSX.utils.book_new();
      XLSX.utils.book_append_sheet(wb, ws, 'Sheet1');
      const buffer = XLSX.write(wb, { type: 'buffer' });

      const result = await simulateAIGenerateRule('test.xlsx', buffer);
      expect(result).toBeDefined();
      expect(result.recommendedRules.length).toBeGreaterThan(0);
    });
  });

  describe('Complex Structure Detection', () => {
    it('should handle multi-sheet detection', async () => {
      const ws = XLSX.utils.aoa_to_sheet([
        ['Sheet', 'Name'],
        ['1', '门店1'],
        ['2', '门店2']
      ]);
      const wb = XLSX.utils.book_new();
      XLSX.utils.book_append_sheet(wb, ws, 'Sheet1');
      const buffer = XLSX.write(wb, { type: 'buffer' });

      const result = await simulateAIGenerateRule('test.xlsx', buffer);
      expect(result).toBeDefined();
      expect(result.recommendedRules.length).toBeGreaterThan(0);
    });
  });
});
