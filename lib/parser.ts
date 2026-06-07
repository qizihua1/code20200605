import * as XLSX from 'xlsx'
import mammoth from 'mammoth'

// ========== 智能解析（不需要规则，直接解析）==========
export async function smartParse(buffer: ArrayBuffer, fileName: string) {
  try {
    const lowerFileName = fileName.toLowerCase()
    
    if (lowerFileName.endsWith('.pdf')) {
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

// 智能解析Excel
function parseExcel(buffer: ArrayBuffer) {
  try {
    const workbook = XLSX.read(buffer, { type: 'array' })
    const parsedData: any[] = []

    for (const sheetName of workbook.SheetNames) {
      const sheet = workbook.Sheets[sheetName]
      const range = XLSX.utils.decode_range(sheet['!ref'] || 'A1')
      
      // 读取所有数据
      const data = XLSX.utils.sheet_to_json(sheet, { 
        header: 1,
        defval: '',
        blankrows: false
      }) as string[][]

      console.log(`Sheet: ${sheetName}, 行数: ${data.length}, 列数: ${data[0]?.length || 0}`)

      if (data.length < 2) continue

      // 尝试多种解析策略
      const strategies = [
        () => parseWithHeaderDetection(data),
        () => parseWithLooseMatching(data),
        () => parseWithMatrixDetection(data),
        () => parseWithSimpleExtraction(data)
      ]

      for (const strategy of strategies) {
        const result = strategy()
        if (result.length > 0) {
          parsedData.push(...result)
          console.log(`策略成功，解析到 ${result.length} 条数据`)
          break
        }
      }
    }

    if (parsedData.length === 0) {
      return {
        success: false,
        error: '未解析到数据',
        details: '请检查文件格式是否正确，或尝试使用规则解析'
      }
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

// 策略1: 表头检测解析
function parseWithHeaderDetection(data: string[][]): any[] {
  const result: any[] = []
  
  // 检测表头行
  const headerRowIndex = detectHeaderRow(data)
  console.log(`检测到表头行: ${headerRowIndex}`)
  
  if (headerRowIndex >= data.length - 1) {
    return []
  }

  const headers = data[headerRowIndex] || []
  const fieldMapping = generateFieldMapping(headers)
  
  console.log('字段映射:', JSON.stringify(fieldMapping))
  
  // 如果没有映射到任何字段，返回空
  if (Object.keys(fieldMapping).length === 0) {
    return []
  }

  // 解析数据行
  for (let i = headerRowIndex + 1; i < data.length; i++) {
    const row = data[i]
    if (!row) continue

    // 跳过空行
    if (row.every(cell => !cell || cell.trim() === '')) {
      continue
    }

    // 跳过合计行
    const rowStr = row.join('')
    if (rowStr.includes('合计') || rowStr.includes('总计')) {
      continue
    }

    const item: any = {}
    let hasData = false

    for (const [field, colIdx] of Object.entries(fieldMapping)) {
      const value = row[colIdx as number]
      if (value && value.trim()) {
        if (field === 'quantity') {
          const num = parseInt(value.trim())
          item[field] = !isNaN(num) ? num : 1
        } else {
          item[field] = value.trim()
        }
        hasData = true
      }
    }

    if (hasData && (item.skuCode || item.skuName)) {
      if (!item.quantity) item.quantity = 1
      result.push(item)
    }
  }

  return result
}

// 策略2: 宽松匹配解析
function parseWithLooseMatching(data: string[][]): any[] {
  const result: any[] = []
  
  // 查找可能包含数据的行范围
  let startRow = 0
  for (let i = 0; i < Math.min(10, data.length); i++) {
    if (data[i]?.some(cell => cell && cell.trim() && /\d/.test(cell.trim()))) {
      startRow = i
      break
    }
  }

  // 查找可能的SKU列和数量列
  const skuColumn = findColumnWithPattern(data, /[A-Za-z]{2,}\d+/, startRow)
  const qtyColumn = findColumnWithPattern(data, /^\d+$/, startRow)
  
  console.log(`宽松匹配: SKU列=${skuColumn}, 数量列=${qtyColumn}`)

  for (let i = startRow; i < data.length; i++) {
    const row = data[i]
    if (!row) continue

    const rowStr = row.join('')
    if (!rowStr.trim()) continue
    if (rowStr.includes('合计') || rowStr.includes('总计')) continue

    const item: any = {}
    
    // 尝试提取SKU
    if (skuColumn !== -1 && row[skuColumn]) {
      item.skuCode = row[skuColumn].trim()
    }
    
    // 尝试提取数量
    if (qtyColumn !== -1 && row[qtyColumn]) {
      const num = parseInt(row[qtyColumn].trim())
      item.quantity = !isNaN(num) && num > 0 ? num : 1
    } else {
      item.quantity = 1
    }

    // 尝试提取名称（非数字的最长文本）
    let maxText = ''
    for (let j = 0; j < row.length; j++) {
      const cell = row[j]
      if (cell && cell.trim().length > maxText.length && !/^\d+$/.test(cell.trim())) {
        maxText = cell.trim()
      }
    }
    if (maxText && !item.skuCode) {
      item.skuName = maxText
    } else if (maxText) {
      item.skuName = maxText
    }

    if (item.skuCode || item.skuName) {
      result.push(item)
    }
  }

  return result
}

// 策略3: 矩阵检测解析（适用于欢乐牧场模板）
function parseWithMatrixDetection(data: string[][]): any[] {
  const result: any[] = []
  
  // 检测是否是矩阵格式（门店作为列头）
  if (data.length < 3) return []
  
  // 假设第一行是标题，第二行是门店名，第三行开始是数据
  const headerRow = data[1] || []
  const storeNames: string[] = []
  
  for (let j = 0; j < headerRow.length; j++) {
    const cell = headerRow[j]
    if (cell && cell.trim() && !cell.includes('编码') && !cell.includes('名称')) {
      storeNames.push(cell.trim())
    }
  }

  console.log(`检测到门店列: ${storeNames.length}个`)
  
  if (storeNames.length === 0) return []

  // 找到SKU编码和名称列
  let skuCodeCol = -1
  let skuNameCol = -1
  
  for (let j = 0; j < headerRow.length; j++) {
    const cell = headerRow[j] || ''
    if (cell.includes('编码') || cell.includes('编号')) {
      skuCodeCol = j
    } else if (cell.includes('名称') || cell.includes('品名')) {
      skuNameCol = j
    }
  }

  // 如果没有找到，使用前两列
  if (skuCodeCol === -1) skuCodeCol = 0
  if (skuNameCol === -1) skuNameCol = 1

  // 解析数据行
  for (let i = 2; i < data.length; i++) {
    const row = data[i]
    if (!row) continue

    const rowStr = row.join('')
    if (!rowStr.trim()) continue
    if (rowStr.includes('合计') || rowStr.includes('总计')) continue

    const skuCode = row[skuCodeCol]?.trim() || ''
    const skuName = row[skuNameCol]?.trim() || ''
    
    if (!skuCode && !skuName) continue

    // 每个门店生成一条记录
    for (let j = 0; j < headerRow.length; j++) {
      const cell = headerRow[j] || ''
      const storeName = cell.trim()
      
      if (!storeNames.includes(storeName)) continue

      const qtyStr = row[j]?.trim() || ''
      const quantity = qtyStr ? (parseInt(qtyStr) || 1) : 0
      
      if (quantity > 0) {
        result.push({
          skuCode,
          skuName,
          quantity,
          storeName
        })
      }
    }
  }

  return result
}

// 策略4: 简单提取解析
function parseWithSimpleExtraction(data: string[][]): any[] {
  const result: any[] = []
  
  // 从所有行中提取数据
  for (let i = 0; i < data.length; i++) {
    const row = data[i]
    if (!row) continue

    const rowStr = row.join('')
    if (!rowStr.trim()) continue
    if (rowStr.includes('合计') || rowStr.includes('总计')) continue

    const item = extractDataFromRow(row)
    if (item) {
      result.push(item)
    }
  }

  return result
}

// 智能检测表头行
function detectHeaderRow(data: string[][]): number {
  const keywords = [
    '编码', '编号', 'SKU', '名称', '数量', '规格', '门店',
    '收货', '电话', '地址', '单价', '金额', '日期', '单号', '序号'
  ]

  let bestRow = 0
  let bestScore = 0

  for (let i = 0; i < Math.min(10, data.length); i++) {
    const row = data[i]
    if (!row || row.length === 0) continue

    let score = 0
    const rowStr = row.join('')

    for (const keyword of keywords) {
      if (rowStr.includes(keyword)) {
        score += 2
      }
    }

    // 有序号或NO列加分
    if (rowStr.includes('序号') || rowStr.includes('NO') || rowStr.includes('No')) {
      score += 3
    }

    // 列数适中（标题行通常列数较少）
    if (row.length >= 3 && row.length <= 50) {
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
function generateFieldMapping(headers: string[]): Record<string, number> {
  const mapping: Record<string, number> = {}
  const fieldKeywords: Record<string, string[]> = {
    externalCode: ['单号', '编号', '订单号', '配送单号', '出库单号'],
    skuCode: ['编码', '编号', 'SKU', '条码', '货号', '品号'],
    skuName: ['名称', '品名', '商品名称', '货品名称', '产品名称'],
    quantity: ['数量', '件数', 'Qty', '发货数量', '出库数量'],
    specification: ['规格', '规格型号', '型号', '单位'],
    storeName: ['门店', '店铺', '收货门店', '仓库', '分店'],
    recipientName: ['收货人', '收件人', '姓名', '联系人'],
    recipientPhone: ['电话', '手机', '联系电话', '手机号'],
    recipientAddress: ['地址', '收货地址', '配送地址'],
    remarks: ['备注', '说明', '备注信息']
  }

  headers.forEach((header, index) => {
    const headerStr = (header || '').trim()
    if (!headerStr) return

    for (const [field, keywords] of Object.entries(fieldKeywords)) {
      for (const keyword of keywords) {
        if (headerStr.includes(keyword)) {
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

// 查找符合模式的列
function findColumnWithPattern(data: string[][], pattern: RegExp, startRow: number): number {
  const colScores: Record<number, number> = {}
  
  for (let i = startRow; i < Math.min(startRow + 20, data.length); i++) {
    const row = data[i]
    if (!row) continue
    
    for (let j = 0; j < row.length; j++) {
      const cell = row[j]
      if (cell && cell.trim() && pattern.test(cell.trim())) {
        colScores[j] = (colScores[j] || 0) + 1
      }
    }
  }

  let bestCol = -1
  let bestScore = 0
  
  for (const [col, score] of Object.entries(colScores)) {
    if (score > bestScore) {
      bestScore = score
      bestCol = parseInt(col)
    }
  }

  return bestCol
}

// 从行数据中提取信息
function extractDataFromRow(row: string[]): any | null {
  if (!row || row.length === 0) return null

  let skuCode = ''
  let skuName = ''
  let quantity = 1

  for (const cell of row) {
    if (!cell) continue
    const value = cell.trim()
    if (!value) continue

    // 尝试识别SKU编码（字母+数字组合）
    if (!skuCode && /[A-Za-z]{2,}[0-9]/.test(value)) {
      skuCode = value
    } else if (!skuCode && /^[A-Za-z0-9]{6,}$/.test(value)) {
      skuCode = value
    }
    
    // 尝试识别数量
    const num = parseInt(value)
    if (!isNaN(num) && num > 0 && num < 10000 && value.match(/^\d+$/)) {
      quantity = num
    }

    // 尝试识别名称
    if (value.length > 3 && value.length < 150 && !/^\d+$/.test(value)) {
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

// 使用规则解析
export function parseWithRule(buffer: ArrayBuffer, rule: any) {
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

      const headerRow = rule.structure?.headerRow || 0
      const dataStartRow = rule.structure?.dataStartRow || headerRow + 1
      const dataEndRow = rule.structure?.dataEndRow === -1 ? data.length - 1 : (rule.structure?.dataEndRow || data.length - 1)

      const colIndexMap: Record<string, number> = {}
      for (const mapping of rule.fieldMappings || []) {
        if (mapping.sourceType === 'column' && mapping.columnIndex !== undefined) {
          colIndexMap[mapping.field] = mapping.columnIndex
        }
      }

      for (let i = dataStartRow; i <= dataEndRow && i < data.length; i++) {
        const row = data[i]
        if (!row) continue

        if (row.every(cell => !cell || cell.trim() === '')) {
          continue
        }

        const item: any = {}

        for (const [field, colIdx] of Object.entries(colIndexMap)) {
          const rawValue = row[colIdx as number]
          if (rawValue && rawValue.trim()) {
            if (field === 'quantity') {
              item[field] = parseInt(rawValue.trim()) || 0
            } else {
              item[field] = rawValue.trim()
            }
          }
        }

        if (item.skuCode || item.skuName) {
          if (!item.quantity) item.quantity = 1
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

// 模拟AI分析（生成推荐规则）
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
      const workbook = XLSX.read(buffer, { type: 'array' })
      const sheet = workbook.Sheets[workbook.SheetNames[0]]
      const data = XLSX.utils.sheet_to_json(sheet, { header: 1 }) as string[][]

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

    const recommendedRule = {
      name: `推荐规则 - ${fileName}`,
      description: '由系统智能分析生成的推荐规则',
      structure: {
        type: analysis.type,
        headerRow: analysis.headerRow || 0,
        dataStartRow: analysis.dataStartRow || 1,
        dataEndRow: -1,
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

function generateFieldMappingWithDetails(headers: string[]) {
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
    const headerStr = (header || '').trim()
    if (!headerStr) return

    for (const [field, keywords] of Object.entries(fieldKeywords)) {
      for (const keyword of keywords) {
        if (headerStr.includes(keyword)) {
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