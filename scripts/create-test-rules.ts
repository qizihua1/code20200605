/**
 * 创建 9 份测试文件的解析规则
 * 这些规则可以手动导入数据库或通过 API 创建
 */

const testRules = [
  {
    name: '黎明屯配送发货单 (Excel)',
    description: '42 列，干扰头部 + 散落尾部 + 跨行聚合',
    format: 'excel',
    structure: {
      headerRowsToSkip: 3,
      dataStartRow: 4,
      footerRowsToSkip: 2,
      multipleSheets: false,
      cardStyle: false,
      hasMatrix: false,
    },
    fieldMappings: [
      { sourceField: '物品编码', targetField: 'skuCode', required: true },
      { sourceField: '物品名称', targetField: 'skuName', required: true },
      { sourceField: '数量', targetField: 'quantity', required: true },
      { sourceField: '规格', targetField: 'specification', required: false },
      // 收货人信息从尾部提取
    ],
    extractions: [{
      type: 'footer',
      targetRow: -2,
      fields: [
        { sourceField: '收货门店', targetField: 'storeName' },
        { sourceField: '电话', targetField: 'recipientPhone' },
      ]
    }]
  },
  {
    name: '湖南仓发货明细 (Excel)',
    description: '32 列，跨行聚合 - 按配送单号聚合多个 SKU',
    format: 'excel',
    structure: {
      headerRowsToSkip: 1,
      dataStartRow: 2,
      footerRowsToSkip: 0,
      multipleSheets: false,
      cardStyle: false,
      hasMatrix: false,
    },
    fieldMappings: [
      { sourceField: '配送单号', targetField: 'externalCode', required: false },
      { sourceField: '门店名称', targetField: 'storeName', required: false },
      { sourceField: '收货人', targetField: 'recipientName', required: false },
      { sourceField: '联系电话', targetField: 'recipientPhone', required: false },
      { sourceField: '收货地址', targetField: 'recipientAddress', required: false },
      { sourceField: 'SKU 编码', targetField: 'skuCode', required: true },
      { sourceField: 'SKU 名称', targetField: 'skuName', required: true },
      { sourceField: '数量', targetField: 'quantity', required: true },
    ],
    aggregations: [{
      groupBy: 'externalCode',
      mergeFields: ['storeName', 'recipientName', 'recipientPhone', 'recipientAddress'],
      dataFields: ['skuCode', 'skuName', 'quantity', 'specification']
    }]
  },
  {
    name: '欢乐牧场模板 (Excel)',
    description: '19 列，矩阵转置 - 门店名作为列头横向排列',
    format: 'excel',
    structure: {
      headerRowsToSkip: 0,
      dataStartRow: 2,
      footerRowsToSkip: 0,
      multipleSheets: false,
      cardStyle: false,
      hasMatrix: true,
      matrixPivotColumn: 'SKU 信息',
    },
    fieldMappings: [
      { sourceField: 'SKU 编码', targetField: 'skuCode', required: true },
      { sourceField: 'SKU 名称', targetField: 'skuName', required: true },
      { sourceField: '数量', targetField: 'quantity', required: true },
      // 动态列：门店名作为目标字段
    ],
    transformations: [{
      type: 'transpose',
      sourceField: '门店列',
      targetField: 'storeName',
    }]
  },
  {
    name: '黔寨寨配送单 (PDF)',
    description: 'PDF 2 页，头部元信息 + 表格 + 底部收货人签字区',
    format: 'pdf',
    structure: {
      headerRowsToSkip: 0,
      dataStartRow: 1,
      footerRowsToSkip: 0,
      multipleSheets: false,
      cardStyle: false,
      hasMatrix: false,
    },
    fieldMappings: [
      { sourceField: '物品类别', targetField: 'remarks', required: false },
      { sourceField: '物品编码', targetField: 'skuCode', required: true },
      { sourceField: '物品名称', targetField: 'skuName', required: true },
      { sourceField: '数量', targetField: 'quantity', required: true },
      // 收货人从底部文本提取
    ],
    extractions: [{
      type: 'regex',
      pattern: '收货人：(.+)' ,
      fields: [
        { sourceField: '收货人', targetField: 'recipientName' },
      ]
    }]
  },
  {
    name: '多门店分 Sheet 出库单 (Excel)',
    description: '3 个 Sheet，每个 Sheet 是一个门店的独立出库单',
    format: 'excel',
    structure: {
      headerRowsToSkip: 1,
      dataStartRow: 2,
      footerRowsToSkip: 2,
      multipleSheets: true,
      cardStyle: false,
      hasMatrix: false,
    },
    fieldMappings: [
      { sourceField: 'SKU 编码', targetField: 'skuCode', required: true },
      { sourceField: 'SKU 名称', targetField: 'skuName', required: true },
      { sourceField: '数量', targetField: 'quantity', required: true },
    ],
  },
  {
    name: '门店调拨单 - 卡片式 (Excel)',
    description: '非标准表格，每条记录是独立的"卡片"区域',
    format: 'excel',
    structure: {
      headerRowsToSkip: 0,
      dataStartRow: 1,
      footerRowsToSkip: 0,
      multipleSheets: false,
      cardStyle: true,
      cardStartPattern: '▶ 调拨记录',
      hasMatrix: false,
    },
    fieldMappings: [
      { sourceField: '门店名称', targetField: 'storeName', required: true },
      { sourceField: '物品编码', targetField: 'skuCode', required: true },
      { sourceField: '物品名称', targetField: 'skuName', required: true },
      { sourceField: '数量', targetField: 'quantity', required: true },
    ],
  },
  {
    name: '门店配送确认单 (Word)',
    description: '纯文本段落格式，无表格，分隔线划分记录',
    format: 'word',
    structure: {
      headerRowsToSkip: 0,
      dataStartRow: 1,
      footerRowsToSkip: 0,
      multipleSheets: false,
      cardStyle: false,
      hasMatrix: false,
    },
    fieldMappings: [
      { sourceField: '编号', targetField: 'externalCode', required: false },
      { sourceField: '编码', targetField: 'skuCode', required: true },
      { sourceField: '名称', targetField: 'skuName', required: true },
      { sourceField: '数量', targetField: 'quantity', required: true },
    ],
  },
  {
    name: '周配送计划 (Excel)',
    description: '日期×门店矩阵，双重转置 + 复合单元格拆分',
    format: 'excel',
    structure: {
      headerRowsToSkip: 0,
      dataStartRow: 1,
      footerRowsToSkip: 0,
      multipleSheets: false,
      cardStyle: false,
      hasMatrix: true,
      matrixPivotColumn: '门店名称',
    },
    fieldMappings: [
      { sourceField: '门店', targetField: 'storeName', required: true },
      { sourceField: '物品', targetField: 'skuName', required: true },
      { sourceField: '数量', targetField: 'quantity', required: true },
    ],
    transformations: [
      { type: 'transpose', sourceField: '日期列', targetField: 'externalCode' },
      { type: 'split', sourceField: '单元格', splitBy: 'newline', targetField: 'items' },
    ]
  },
  {
    name: '配送签收单 - 多单 PDF',
    description: '一个 PDF 内含 3 个独立的配送签收单，需拆分',
    format: 'pdf',
    structure: {
      headerRowsToSkip: 0,
      dataStartRow: 1,
      footerRowsToSkip: 0,
      multipleSheets: false,
      cardStyle: true,
      hasMatrix: false,
    },
    fieldMappings: [
      { sourceField: '物品编码', targetField: 'skuCode', required: true },
      { sourceField: '物品名称', targetField: 'skuName', required: true },
      { sourceField: '数量', targetField: 'quantity', required: true },
    ],
  },
]

console.log('9 份测试文件的解析规则:')
console.log(JSON.stringify(testRules, null, 2))
