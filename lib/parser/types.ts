/**
 * 解析规则引擎类型定义
 */

// 结构配置
export interface StructureConfig {
  headerRowsToSkip: number;      // 跳过头部行数
  dataStartRow: number;          // 数据起始行 (1-based)
  footerRowsToSkip: number;      // 跳过尾部行数
  multipleSheets: boolean;       // 多 Sheet 合并
  cardStyle: boolean;            // 卡片式布局
  hasMatrix: boolean;            // 矩阵转置
  matrixPivotColumn?: string;    // 矩阵转置的主键列 (如日期/门店)
  cardStartPattern?: string;     // 卡片起始标识正则
}

// 字段映射
export interface FieldMapping {
  sourceField: string;    // 源文件字段 (列名/索引)
  targetField: string;    // 目标字段 (shipment 字段)
  required: boolean;
  validator?: 'phone' | 'positiveNumber' | 'notEmpty' | 'email';
  defaultValue?: any;
  transform?: 'trim' | 'uppercase' | 'lowercase' | 'number' | 'json';
  description?: string;
}

// 跨行聚合规则
export interface AggregationRule {
  groupBy: string;        // 聚合字段 (如 externalCode)
  mergeFields: string[];  // 需要合并的字段 (收货信息等)
  dataFields: string[];   // 数据字段 (SKU 信息)
}

// 转换规则
export interface TransformRule {
  type: 'transpose' | 'split' | 'extract';
  sourceField: string;
  targetField?: string;
  delimiter?: string;
  splitBy?: 'newline' | 'comma' | 'pipe';
}

// 提取规则 (尾部信息)
export interface ExtractionRule {
  type: 'footer' | 'header' | 'regex';
  pattern?: string;
  targetRow?: number;
  fields: FieldMapping[];
}

// 解析规则
export interface ParsingRule {
  id?: string;
  name: string;
  description?: string;
  format: 'excel' | 'word' | 'pdf';
  
  // 结构配置
  structure: StructureConfig;
  
  // 字段映射
  fieldMappings: FieldMapping[];
  
  // 复杂处理
  aggregations?: AggregationRule[];
  transformations?: TransformRule[];
  extractions?: ExtractionRule[];
}

// 解析后的运单数据结构
export interface ShipmentData {
  externalCode?: string;
  storeName?: string;
  recipientName?: string;
  recipientPhone?: string;
  recipientAddress?: string;
  skuCode: string;
  skuName: string;
  quantity: number;
  specification?: string;
  remarks?: string;
}

// 验证错误
export interface ValidationError {
  rowIndex: number;
  field: string;
  message: string;
  type: 'required' | 'format' | 'duplicate' | 'custom';
}

// 解析结果
export interface ParseResult {
  data: ShipmentData[];
  errors: ValidationError[];
  warnings: string[];
}

// AI 分析结果
export interface AIAnalyzeResult {
  rule: ParsingRule;
  confidence: number;
  warnings: string[];
}
