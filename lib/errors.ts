export const ErrorCodes = {
  SKU_NOT_FOUND: 'E001',
  REQUIRED_FIELD_MISSING: 'E002',
  INVALID_PHONE_FORMAT: 'E003',
  INVALID_QUANTITY: 'E004',
  DUPLICATE_EXTERNAL_CODE: 'E005',
  RULE_MAPPING_FAILED: 'E006',
  DB_WRITE_FAILED: 'E007',
  UNSUPPORTED_FILE_FORMAT: 'E008',
} as const

export type ErrorCode = typeof ErrorCodes[keyof typeof ErrorCodes]

export const ErrorMessages: Record<ErrorCode, string> = {
  [ErrorCodes.SKU_NOT_FOUND]: 'SKU编码不存在于主数据中',
  [ErrorCodes.REQUIRED_FIELD_MISSING]: '必填字段缺失',
  [ErrorCodes.INVALID_PHONE_FORMAT]: '电话号码格式不正确',
  [ErrorCodes.INVALID_QUANTITY]: '数量必须是正数',
  [ErrorCodes.DUPLICATE_EXTERNAL_CODE]: '外部编码重复',
  [ErrorCodes.RULE_MAPPING_FAILED]: '规则映射失败',
  [ErrorCodes.DB_WRITE_FAILED]: '数据库写入失败',
  [ErrorCodes.UNSUPPORTED_FILE_FORMAT]: '文件格式不支持',
}

export function maskSensitiveValue(value: string | null | undefined, fieldName: string): string {
  if (!value) return ''
  
  const sensitiveFields = ['recipientPhone', 'phone', 'address', 'recipientAddress']
  const isSensitive = sensitiveFields.some(f => fieldName.toLowerCase().includes(f.toLowerCase()))
  
  if (!isSensitive) return String(value)
  
  const strValue = String(value)
  if (strValue.length <= 4) return '****'
  if (strValue.length <= 8) return strValue.slice(0, 2) + '****' + strValue.slice(-2)
  return strValue.slice(0, 3) + '****' + strValue.slice(-3)
}
