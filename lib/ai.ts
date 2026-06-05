import { generateText } from 'ai'
import { openai } from '@ai-sdk/openai'

const AI_MODEL = process.env.AI_MODEL || 'deepseek-chat'
const API_KEY = process.env.DEEPSEEK_API_KEY || process.env.OPENAI_API_KEY

// 配置 AI Provider
if (API_KEY) {
  process.env.OPENAI_API_KEY = API_KEY
  process.env.OPENAI_BASE_URL = AI_MODEL.includes('deepseek') 
    ? 'https://api.deepseek.com/v1' 
    : undefined
}

/**
 * AI 分析文件并生成解析规则
 */
export async function analyzeFileWithAI(params: {
  fileName: string
  format: 'excel' | 'word' | 'pdf'
  structure: string
  sampleData: string
}): Promise<string> {
  const { fileName, format, structure, sampleData } = params

  const prompt = `分析上传的文件 "${fileName}" (${format})，生成解析规则。

## 文件结构信息
${structure}

## 样本数据 (前 5 行)
${sampleData}

## 任务
请分析文件结构并生成完整的解析规则 (JSON 格式),包括:

1. 识别文件格式特征:
   - 头部干扰信息有几行？
   - 数据从第几行开始？
   - 是否有尾部信息？
   - 是否为矩阵结构 (横向排列)?
   - 是否为卡片式结构？

2. 识别字段映射:
   - 表头各列对应哪个目标字段？
   - 目标字段包括：externalCode(外部编码), storeName(收货门店), recipientName(收件人), recipientPhone(电话), recipientAddress(地址), skuCode(SKU 编码), skuName(SKU 名称),quantity(数量), specification(规格), remarks(备注)

3. 识别特殊处理:
   - 是否需要跨行聚合 (按 externalCode 聚合)?
   - 是否需要矩阵转置？
   - 是否需要提取尾部收货人信息？
   - 是否有复合单元格需要拆分？

## 输出格式
返回 JSON 格式的 ParsingRule 对象:

\`\`\`json
{
  "name": "规则名称",
  "description": "规则描述",
  "format": "${format}",
  "structure": {
    "headerRowsToSkip": 0,
    "dataStartRow": 1,
    "footerRowsToSkip": 0,
    "multipleSheets": false,
    "cardStyle": false,
    "hasMatrix": false
  },
  "fieldMappings": [
    {"sourceField": "列名", "targetField": "目标字段", "required": true/false}
  ],
  "aggregations":[],
  "transformations": [],
  "extractions": []
}
\`\`\`

注意：必须返回有效的 JSON，不要包含额外说明。`

  const { text } = await generateText({
    model: openai(AI_MODEL.replace('deepseek-', '')),
    prompt,
    maxTokens: 2048,
    temperature: 0.3,
  })

  // 提取 JSON 部分
  const jsonMatch = text.match(/```json\s*([\s\S]*?)\s*```/)
  if (jsonMatch) {
    return jsonMatch[1]
  }
  
  // 如果没有 markdown 标记，尝试直接解析
  const directJson = text.match(/{[\s\S]*}/)
  if (directJson) {
    return directJson[0]
  }
  
  throw new Error('AI 返回的内容不包含有效的 JSON')
}
