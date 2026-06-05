// AI 规则生成器 - 模拟大模型分析文件并生成解析规则
// 实际使用时可以替换为真实的大模型 API 调用

import * as XLSX from 'xlsx'

// 规则模板库 - 预设的规则模板
const ruleTemplates: Record<string, any> = {
  // 模板 1: 标准表格（第 1 行表头，第 2 行起数据）
  standardTable: {
    structure: {
      headerSkip: 0,
      dataStartRow: 1,
      sheetStrategy: 'first',
      extractionType: 'table',
      crossRowAggregate: false,
    },
    fieldMappings: [
      { field: 'skuCode', sourceType: 'column', source: '物品编码', transform: 'trim', required: true },
      { field: 'skuName', sourceType: 'column', source: '物品名称', transform: 'trim', required: true },
      { field: 'quantity', sourceType: 'column', source: '数量', transform: 'number', required: true },
      { field: 'storeName', sourceType: 'column', source: '门店', transform: 'trim', required: false },
    ],
  },
  
  // 模板 2: 带头部干扰（前 N 行跳过）
  skipHeader: {
    structure: {
      headerSkip: 3,
      dataStartRow: 4,
      sheetStrategy: 'first',
      extractionType: 'table',
      footerExtract: [
        { field: 'storeName', keywords: ['收货机构', '收货门店'], rowOffset: -1 },
      ],
      crossRowAggregate: true,
      aggregationKey: '配送单号',
    },
    fieldMappings: [
      { field: 'skuCode', sourceType: 'column', source: '物品编码', transform: 'trim', required: true },
      { field: 'skuName', sourceType: 'column', source: '物品名称', transform: 'trim', required: true },
      { field: 'quantity', sourceType: 'column', source: '数量', transform: 'number', required: true },
      { field: 'externalCode', sourceType: 'column', source: '配送单号', transform: 'trim', required: false },
    ],
  },
  
  // 模板 3: 多 Sheet 合并
  multiSheet: {
    structure: {
      headerSkip: 2,
      dataStartRow: 3,
      sheetStrategy: 'all',
      extractionType: 'table',
      footerExtract: [
        { field: 'storeName', keywords: ['店'], extractFrom: 'sheetName' },
      ],
      crossRowAggregate: false,
    },
    fieldMappings: [
      { field: 'skuCode', sourceType: 'column', source: '物品编号', transform: 'trim', required: true },
      { field: 'skuName', sourceType: 'column', source: '物品名称', transform: 'trim', required: true },
      { field: 'quantity', sourceType: 'column', source: '数量', transform: 'number', required: true },
    ],
  },
  
  // 模板 4: 矩阵转置（SKU×门店）
  matrixTranspose: {
    structure: {
      headerSkip: 1,
      dataStartRow: 2,
      sheetStrategy: 'first',
      extractionType: 'matrix',
      pivotKey: 'skuCode',
      valueColumns: 'dynamic', // 所有数字列作为门店
    },
    fieldMappings: [
      { field: 'skuCode', sourceType: 'column', source: 'SKU 编码', transform: 'trim', required: true },
      { field: 'skuName', sourceType: 'column', source: 'SKU 名称', transform: 'trim', required: true },
      { field: 'storeName', sourceType: 'matrix_column', transform: 'trim', required: true },
      { field: 'quantity', sourceType: 'matrix_value', transform: 'number', required: true },
    ],
    transformations: [
      { type: 'transpose', config: { pivot: 'skuCode', values: 'quantity' } },
    ],
  },
  
  // 模板 5: 卡片式布局
  cardLayout: {
    structure: {
      sheetStrategy: 'first',
      extractionType: 'card',
      cardMarker: '▶',
      cardFields: {
        externalCode: { pattern: /调拨单号 [：:]\s*(\S+)/, rowOffset: 0 },
        storeName: { pattern: /调出门店 [：:]\s*(\S+)/, rowOffset: 0 },
      },
    },
    fieldMappings: [
      { field: 'skuCode', sourceType: 'card_table', column: 0, required: true },
      { field: 'skuName', sourceType: 'card_table', column: 1, required: true },
      { field: 'quantity', sourceType: 'card_table', column: 3, transform: 'number', required: true },
    ],
  },
  
  // 模板 6: 纯文本段落（Word/PDF）
  textParagraph: {
    structure: {
      extractionType: 'text',
      textSeparator: '━━━',
      recordPattern: /(\d+)\.\s*([^|]+)\|([^|]+)\|([^|]+)\|([^|\n]+)/,
    },
    fieldMappings: [
      { field: 'skuCode', sourceType: 'regex_group', group: 2, transform: 'trim', required: true },
      { field: 'skuName', sourceType: 'regex_group', group: 3, transform: 'trim', required: true },
      { field: 'specification', sourceType: 'regex_group', group: 4, transform: 'trim' },
      { field: 'quantity', sourceType: 'regex_group', group: 5, transform: 'number', required: true },
    ],
  },
}

// Excel 文件特征分析
function analyzeExcel(buffer: ArrayBuffer) {
  const workbook = XLSX.read(buffer, { type: 'array' })
  const firstSheetName = workbook.SheetNames[0]
  const firstSheet = workbook.Sheets[firstSheetName]
  const data = XLSX.utils.sheet_to_json(firstSheet, { header: 1 }) as any[][]
  
  const analysis = {
    sheetCount: workbook.SheetNames.length,
    sheetNames: workbook.SheetNames,
    rowCount: data.length,
    columnCount: data[0]?.length || 0,
    firstRow: data[0] || [],
    secondRow: data[1] || [],
    thirdRow: data[2] || [],
    hasMergedHeader: false,
    hasCardMarker: false,
    textLike: false,
  }
  
  // 检测特征
  if (data[0]?.length === 1 && String(data[0][0]).includes('▶')) {
    analysis.hasCardMarker = true
  }
  
  if (data[0]?.length > 10 && data[0].some((c: any) => String(c).includes('丨') || String(c).includes('|'))) {
    analysis.textLike = true
  }
  
  if (data[0]?.length > 15 && data[1]?.length > 15) {
    analysis.hasMergedHeader = true
  }
  
  return analysis
}

// 模拟 AI 生成规则
export function simulateAIGenerateRule(fileName: string, buffer: ArrayBuffer) {
  const analysis = analyzeExcel(buffer)
  
  // 基于文件名和特征匹配规则模板
  const rules: Array<{
    name: string
    confidence: number
    description: string
    template: any
  }> = []
  
  // 规则 1: 多 Sheet 检测
  if (analysis.sheetCount >= 2) {
    rules.push({
      name: `${fileName.split('.')[0]}-多门店规则`,
      confidence: 0.95,
      description: `检测到 ${analysis.sheetCount} 个工作表，推测为多门店分 Sheet 格式`,
      template: ruleTemplates.multiSheet,
    })
  }
  
  // 规则 2: 卡片式检测
  if (analysis.hasCardMarker) {
    rules.push({
      name: `${fileName.split('.')[0]}-卡片式规则`,
      confidence: 0.92,
      description: `检测到卡片标记"▶"，推测为卡片式布局`,
      template: ruleTemplates.cardLayout,
    })
  }
  
  // 规则 3: 矩阵转置检测
  if (analysis.hasMergedHeader && analysis.columnCount > 15) {
    rules.push({
      name: `${fileName.split('.')[0]}-矩阵转置规则`,
      confidence: 0.88,
      description: `检测到宽表（${analysis.columnCount}列），推测为 SKU×门店矩阵格式`,
      template: ruleTemplates.matrixTranspose,
    })
  }
  
  // 规则 4: 跳过头部检测
  const firstRowHasNumber = analysis.firstRow.some((c: any) => !isNaN(parseFloat(c)))
  const secondRowHasNumber = analysis.secondRow.some((c: any) => !isNaN(parseFloat(c)))
  const thirdRowHasHeader = analysis.thirdRow?.some((c: any) => String(c).includes('编号') || String(c).includes('名称'))
  
  if (thirdRowHasHeader && !firstRowHasNumber) {
    rules.push({
      name: `${fileName.split('.')[0]}-标准表格规则`,
      confidence: 0.85,
      description: `检测到前 2 行为干扰信息，数据从第 3 行开始`,
      template: ruleTemplates.skipHeader,
    })
  }
  
  // 规则 5: 标准表格（兜底）
  if (rules.length === 0) {
    rules.push({
      name: `${fileName.split('.')[0]}-通用规则`,
      confidence: 0.75,
      description: `标准表格格式，第 1 行为表头，第 2 行起为数据`,
      template: ruleTemplates.standardTable,
    })
  }
  
  return {
    success: true,
    fileName,
    analysis,
    recommendedRules: rules,
  }
}

// 导出给 API 使用
export default simulateAIGenerateRule
