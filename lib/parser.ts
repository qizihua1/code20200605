import * as XLSX from 'xlsx'
import mammoth from 'mammoth'

// ========== 智能解析（不需要规则，直接解析）==========
export async function smartParse(buffer: ArrayBuffer, fileName: string) {
  try {
    const lowerFileName = fileName.toLowerCase()
    
    if (lowerFileName.endsWith('.pdf')) {
      // PDF暂不支持，返回友好提示
      return {
        success: false,
        error: 'PDF解析暂未支持',
        details: '请将PDF转换为Excel格式后再上传'
      }
    } else if (lowerFileName.endsWith('.docx') || lowerFileName.endsWith('.doc')) {
      return await parseWord(buffer)
    } else {
      return parseExcel(buffer)
    }
  } catch (error: any) {
    console.error('智能解析失败:', error)
    return {
      success: false,
      error: '解析失败',
      details: error.message
    }
  }
}

// 智能解析Excel - 不需要规则
function parseExcel(buffer: ArrayBuffer) {
  try {
    // 读取Excel文件
    const workbook = XLSX.read(buffer, { type: 'array' })
    const parsedData: any[] = []

    // 遍历所有Sheet
    for (const sheetName of workbook.SheetNames) {
      const sheet = workbook.Sheets[sheetName]
      
      // 获取范围信息
      const range = XLSX.utils.decode_range(sheet['!ref'] || 'A1')
      
      // 使用原始数组方式读取，确保读取所有列
      const data = XLSX.utils.sheet_to_json(sheet, { 
        header: 1,
        defval: null,
        blankrows: false
      }) as any[][]

      if (data.length < 2) continue

      // 智能检测表头行
      const headerRowIndex = detectHeaderRow(data)
      const headers = data[headerRowIndex] || []

      // 智能生成字段映射
      const fieldMapping = generateFieldMapping(headers)

      // 解析数据行
      for (let i = headerRowIndex + 1; i < data.length; i++) {
        const row = data[i]
        if (!row || row.length === 0) continue

        // 跳过空行
        if (row.every(cell => cell === null || cell === undefined || String(cell).trim() === '')) {
          continue
        }

        // 跳过合计行
        const rowStr = row.map(c => String(c ?? '')).join('')
        if (rowStr.includes('合计') || rowStr.includes('总计')) {
          continue
        }

        const item: any = {}

        // 尝试从所有列提取数据
        for (let colIdx = 0; colIdx < row.length; colIdx++) {
          const value = row[colIdx]
          if (value === null || value === undefined) continue

          const valueStr = String(value).trim()
          if (!valueStr) continue

          // 根据列索引映射字段
          for (const [field, mappedIdx] of Object.entries(fieldMapping)) {
            if (mappedIdx === colIdx) {
              if (field === 'quantity') {
                const num = parseInt(valueStr)
                if (!isNaN(num)) {
                  item[field] = num
                }
              } else {
                item[field] = valueStr
              }
            }
          }
        }

        // 如果有SKU编码或名称，添加到结果
        if (item.skuCode || item.skuName) {
          // 确保数量有默认值
          if (!item.quantity || item.quantity === 0) {
            item.quantity = 1
          }
          parsedData.push(item)
        } else {
          // 如果没有识别到字段，尝试从整行提取数据
          const extracted = extractDataFromRow(row)
          if (extracted) {
            parsedData.push(extracted)
          }
        }
      }
    }

    // 如果没有解析到数据，尝试更宽松的解析
    if (parsedData.length === 0) {
      return parseExcelFallback(buffer)
    }

    return {
      success: true,
      data: parsedData,
      total: parsedData.length,
      parseMode: 'smart',
      message: `智能解析完成，共 ${parsedData.length} 条数据`
    }
  } catch (error: any) {
    console.error('Excel解析错误:', error)
    return {
      success: false,
      error: 'Excel解析失败',
      details: error.message
    }
  }
}

// 更宽松的Excel解析（备用方案）
function parseExcelFallback(buffer: ArrayBuffer) {
  try {
    const workbook = XLSX.read(buffer, { type: 'array' })
    const parsedData: any[] = []

    for (const sheetName of workbook.SheetNames) {
      const sheet = workbook.Sheets[sheetName]
      const data = XLSX.utils.sheet_to_json(sheet, { 
        header: 1,
        defval: '',
        blankrows: false
      }) as string[][]

      // 跳过前几行（可能是标题）
      const startRow = Math.min(5, data.length - 1)
      
      for (let i = startRow; i < data.length; i++) {
        const row = data[i]
        if (!row) continue

        const rowStr = row.join('').trim()
        if (!rowStr) continue
        if (rowStr.includes('合计') || rowStr.includes('总计')) continue

        // 尝试提取数据
        const extracted = extractDataFromRow(row)
        if (extracted) {
          parsedData.push(extracted)
        }
      }
    }

    return {
      success: true,
      data: parsedData,
      total: parsedData.length,
      parseMode: 'smart-fallback',
      message: `备用解析完成，共 ${parsedData.length} 条数据`
    }
  } catch (error: any) {
    return {
      success: false,
      error: 'Excel解析失败',
      details: error.message
    }
  }
}

// 从行数据中提取信息
function extractDataFromRow(row: any[]): any | null {
  if (!row || row.length === 0) return null

  let skuCode = ''
  let skuName = ''
  let quantity = 1

  for (const cell of row) {
    if (!cell) continue
    const value = String(cell).trim()
    if (!value) continue

    // 尝试识别SKU编码（通常是有字母数字组合）
    if (!skuCode && /[A-Z]{2,}[0-9]/.test(value)) {
      skuCode = value
    }
    
    // 尝试识别数量（纯数字，且在合理范围内）
    const num = parseInt(value)
    if (!isNaN(num) && num > 0 && num < 10000 && value.match(/^\d+$/)) {
      quantity = num
    }

    // 尝试识别名称（较长的文本）
    if (value.length > 3 && value.length < 100 && !/^\d+$/.test(value)) {
      if (!skuName || value.length > skuName.length) {
        skuName = value
      }
    }
  }

  if (skuCode || skuName) {
    return { skuCode, skuName, quantity }
  }

  return null
}

// 智能解析Word
async function parseWord(buffer: ArrayBuffer) {
  try {
    const { value } = await mammoth.extractRawText({ arrayBuffer: buffer })
    const lines = value.split('\n')
    const parsedData: any[] = []

    for (const line of lines) {
      const trimmed = line.trim()
      if (trimmed.length > 3) {
        parsedData.push({
          skuCode: '',
          skuName: trimmed.substring(0, 100),
          quantity: 1
        })
      }
    }

    return {
      success: true,
      data: parsedData,
      total: parsedData.length,
      parseMode: 'smart',
      message: `Word解析完成，共 ${parsedData.length} 条数据`
    }
  } catch (error: any) {
    return {
      success: false,
      error: 'Word解析失败',
      details: error.message
    }
  }
}

// 智能检测表头行
function detectHeaderRow(data: any[][]) {
  const keywords = [
    '编码', '编号', 'SKU', '名称', '数量', '规格', '门店',
    '收货', '电话', '地址', '单价', '金额', '日期', '单号'
  ]

  let bestRow = 0
  let bestScore = 0

  for (let i = 0; i < Math.min(20, data.length); i++) {
    const row = data[i]
    if (!row || row.length === 0) continue

    let score = 0
    const rowStr = row.map(c => String(c || '')).join('')

    for (const keyword of keywords) {
      if (rowStr.includes(keyword)) {
        score++
      }
    }

    if (rowStr.includes('序号') || rowStr.includes('NO')) {
      score += 3
    }

    if (row.length <= 50) {
      score += 1
    }

    if (score > bestScore) {
      bestScore = score
      bestRow = i
    }
  }

  return bestRow
}

// 生成字段映射
function generateFieldMapping(headers: any[]) {
  const mapping: Record<string, number> = {}
  const fieldKeywords: Record<string, string[]> = {
    externalCode: ['单号', '编号', '订单号', '配送单号', '出库单号'],
    skuCode: ['编码', '编号', 'SKU', '条码', '货号'],
    skuName: ['名称', '品名', '商品名称', '货品名称'],
    quantity: ['数量', '件数', 'Qty', '发货数量'],
    specification: ['规格', '规格型号', '型号', '单位'],
    storeName: ['门店', '店铺', '收货门店', '仓库'],
    recipientName: ['收货人', '收件人', '姓名', '联系人'],
    recipientPhone: ['电话', '手机', '联系电话'],
    recipientAddress: ['地址', '收货地址', '配送地址'],
    remarks: ['备注', '说明']
  }

  headers.forEach((header, index) => {
    const headerStr = String(header || '').trim()
    if (!headerStr) return

    for (const [field, keywords] of Object.entries(fieldKeywords)) {
      for (const keyword of keywords) {
        if (headerStr.includes(keyword) || headerStr === keyword) {
          if (mapping[field] === undefined) {
            mapping[field] = index
          }
          break
        }
      }
    }
  })

  return mapping
}

// ========== 使用规则解析 ==========
export function parseWithRule(buffer: ArrayBuffer, rule: any) {
  try {
    const workbook = XLSX.read(buffer, { type: 'array' })
    const parsedData: any[] = []

    for (const sheetName of workbook.SheetNames) {
      const sheet = workbook.Sheets[sheetName]
      const data = XLSX.utils.sheet_to_json(sheet, { header: 1 }) as any[][]

      const headerRow = rule.structure?.headerRow || 0
      const dataStartRow = rule.structure?.dataStartRow || headerRow + 1
      const dataEndRow = rule.structure?.dataEndRow === -1 ? data.length - 1 : (rule.structure?.dataEndRow || data.length - 1)

      // 构建列索引映射
      const colIndexMap: Record<string, number> = {}
      for (const mapping of rule.fieldMappings || []) {
        if (mapping.sourceType === 'column' && mapping.columnIndex !== undefined) {
          colIndexMap[mapping.field] = mapping.columnIndex
        }
      }

      // 解析数据行
      for (let i = dataStartRow; i <= dataEndRow && i < data.length; i++) {
        const row = data[i]
        if (!row) continue

        if (row.every(cell => !cell || String(cell).trim() === '')) {
          continue
        }

        const item: any = {}

        for (const [field, colIdx] of Object.entries(colIndexMap)) {
          let value = row[colIdx as number]
          if (value !== undefined && value !== null) {
            if (field === 'quantity') {
              value = parseInt(String(value)) || 0
            } else {
              value = String(value).trim()
            }
            item[field] = value
          }
        }

        if (item.skuCode || item.skuName) {
          parsedData.push(item)
        }
      }
    }

    return {
      success: true,
      data: parsedData,
      total: parsedData.length,
      parseMode: 'rule',
      message: `规则解析完成，共 ${parsedData.length} 条数据`
    }
  } catch (error: any) {
    return {
      success: false,
      error: '规则解析失败',
      details: error.message
    }
  }
}

// ========== 模拟AI分析（生成推荐规则）==========
export async function analyzeAndSuggestRule(buffer: ArrayBuffer, fileName: string) {
  try {
    const lowerFileName = fileName.toLowerCase()
    let analysis: any = {}

    if (lowerFileName.endsWith('.pdf')) {
      analysis = {
        type: 'pdf',
        note: 'PDF格式暂不支持解析，请转换为Excel格式'
      }
    } else if (lowerFileName.endsWith('.docx') || lowerFileName.endsWith('.doc')) {
      const { value } = await mammoth.extractRawText({ arrayBuffer: buffer })
      analysis = {
        type: 'word',
        textLength: value.length,
        sampleText: value.substring(0, 1000)
      }
    } else {
      // Excel分析
      const workbook = XLSX.read(buffer, { type: 'array' })
      const sheet = workbook.Sheets[workbook.SheetNames[0]]
      const data = XLSX.utils.sheet_to_json(sheet, { header: 1 }) as any[][]

      const headerRowIndex = detectHeaderRow(data)
      const headers = data[headerRowIndex] || []
      const fieldMappings = generateFieldMappingWithDetails(headers)

      analysis = {
        type: 'excel',
        sheetCount: workbook.SheetNames.length,
        sheetNames: workbook.SheetNames,
        totalRows: data.length,
        totalColumns: data[0]?.length || 0,
        headerRow: headerRowIndex,
        dataStartRow: headerRowIndex + 1,
        headers: headers.slice(0, 30),
        fieldMappings
      }
    }

    // 生成推荐规则
    const recommendedRule = {
      name: `推荐规则 - ${fileName}`,
      description: '由系统智能分析生成的推荐规则',
      structure: {
        type: analysis.type,
        headerRow: analysis.headerRow || 0,
        dataStartRow: analysis.dataStartRow || 1,
        dataEndRow: -1, // 到末尾
        multiSheet: analysis.sheetCount > 1
      },
      fieldMappings: analysis.fieldMappings || []
    }

    return {
      success: true,
      fileName,
      analysis,
      recommendedRule,
      message: '智能分析完成，请确认推荐规则或手动调整'
    }
  } catch (error: any) {
    console.error('AI分析失败:', error)
    return {
      success: false,
      error: '文件分析失败',
      details: error.message
    }
  }
}

// 生成字段映射（详细版，用于推荐规则）
function generateFieldMappingWithDetails(headers: any[]) {
  const mappings: any[] = []
  const fieldKeywords: Record<string, string[]> = {
    externalCode: ['单号', '编号', '订单号', '配送单号', '出库单号'],
    skuCode: ['编码', '编号', 'SKU', '条码', '货号'],
    skuName: ['名称', '品名', '商品名称', '货品名称'],
    quantity: ['数量', '件数', 'Qty', '发货数量'],
    specification: ['规格', '规格型号', '型号', '单位'],
    storeName: ['门店', '店铺', '收货门店', '仓库'],
    recipientName: ['收货人', '收件人', '姓名', '联系人'],
    recipientPhone: ['电话', '手机', '联系电话'],
    recipientAddress: ['地址', '收货地址', '配送地址'],
    remarks: ['备注', '说明']
  }

  headers.forEach((header, index) => {
    const headerStr = String(header || '').trim()
    if (!headerStr) return

    for (const [field, keywords] of Object.entries(fieldKeywords)) {
      for (const keyword of keywords) {
        if (headerStr.includes(keyword) || headerStr === keyword) {
          mappings.push({
            field,
            source: headerStr,
            columnIndex: index,
            sourceType: 'column'
          })
          break
        }
      }
    }
  })

  return mappings
}
