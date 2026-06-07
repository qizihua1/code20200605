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

      // 尝试多种解析策略，按优先级排序
      const strategies = [
        { name: '卡片式解析', fn: () => parseWithCardStyle(data) },
        { name: '表头检测解析', fn: () => parseWithHeaderDetection(data) },
        { name: '矩阵检测解析', fn: () => parseWithMatrixDetection(data) },
        { name: '宽松匹配解析', fn: () => parseWithLooseMatching(data) },
        { name: '简单提取解析', fn: () => parseWithSimpleExtraction(data) }
      ]

      let foundStrategy = false
      for (const strategy of strategies) {
        const result = strategy.fn()
        console.log(`${strategy.name}: 解析到 ${result.length} 条数据`)
        if (result.length > 0) {
          parsedData.push(...result)
          foundStrategy = true
          break
        }
      }

      // 如果所有策略都失败，输出前几行数据用于调试
      if (!foundStrategy && parsedData.length === 0) {
        console.log('所有策略都未成功，输出前5行数据用于调试:')
        for (let i = 0; i < Math.min(5, data.length); i++) {
          console.log(`行${i}:`, data[i]?.slice(0, 10))
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

// 安全的字符串转换函数
function safeString(value: any): string {
  if (value === null || value === undefined) {
    return ''
  }
  return String(value)
}

// 安全的trim函数
function safeTrim(value: any): string {
  return safeString(value).trim()
}

// 策略0: 卡片式解析（支持门店调拨单等卡片式布局）
function parseWithCardStyle(data: string[][]): any[] {
  const result: any[] = []
  
  // 检测是否是卡片式布局（查找"调拨记录"、"调拨单"等关键词）
  const firstRowStr = (data[0] || []).map(cell => safeString(cell)).join('')
  if (!firstRowStr.includes('调拨') && !firstRowStr.includes('卡片')) {
    return []
  }
  
  console.log('检测到卡片式布局')
  
  // 查找所有卡片块
  let currentCard: any = null
  
  for (let i = 0; i < data.length; i++) {
    const row = data[i]
    if (!row) continue
    
    const rowStr = row.map(cell => safeString(cell)).join('')
    
    // 检测新卡片开始（调拨记录 #N）
    if (rowStr.includes('调拨记录') || rowStr.includes('▶')) {
      currentCard = {}
      continue
    }
    
    // 检测表头行（物品编码、物品名称等）
    if (rowStr.includes('物品编码') || rowStr.includes('物品名称')) {
      // 找到表头，从下一行开始解析物品明细
      for (let j = i + 1; j < data.length; j++) {
        const itemRow = data[j]
        if (!itemRow) break
        
        const itemStr = itemRow.map(cell => safeString(cell)).join('')
        if (!safeTrim(itemStr)) break
        if (itemStr.includes('调拨记录') || itemStr.includes('▶')) {
          i = j - 1  // 回退到新卡片开始位置
          break
        }
        
        // 提取物品信息
        const item: any = {
          ...currentCard,
          skuCode: safeTrim(itemRow[0]),
          skuName: safeTrim(itemRow[1]),
          specification: safeTrim(itemRow[2]),
          quantity: parseInt(safeTrim(itemRow[3])) || 1
        }
        
        if (item.skuCode || item.skuName) {
          result.push(item)
        }
      }
      continue
    }
    
    // 提取卡片头部信息（调入门店、收货人、电话、地址）
    if (currentCard) {
      // 查找门店信息
      for (let idx = 0; idx < row.length; idx++) {
        const cell = row[idx]
        if (!cell) continue
        const cellStr = safeTrim(cell)
        
        // 检测门店名称
        if (cellStr.includes('调入门店') || cellStr.includes('门店')) {
          const nextCell = row[idx + 1]
          if (nextCell) currentCard.storeName = safeTrim(nextCell)
        }
        
        // 检测收货人
        if (cellStr.includes('收货人') || cellStr.includes('联系人')) {
          const nextCell = row[idx + 1]
          if (nextCell) currentCard.recipientName = safeTrim(nextCell)
        }
        
        // 检测电话
        if (cellStr.includes('电话') || cellStr.includes('手机')) {
          const nextCell = row[idx + 1]
          if (nextCell) currentCard.recipientPhone = safeTrim(nextCell)
        }
        
        // 检测地址
        if (cellStr.includes('地址') || cellStr.includes('收货地址')) {
          const nextCell = row[idx + 1]
          if (nextCell) currentCard.recipientAddress = safeTrim(nextCell)
        }
      }
    }
  }
  
  console.log(`卡片式解析完成，共 ${result.length} 条数据`)
  return result
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
    if (row.every(cell => !cell || safeTrim(cell) === '')) {
      continue
    }

    // 跳过合计行
    const rowStr = row.map(cell => safeString(cell)).join('')
    if (rowStr.includes('合计') || rowStr.includes('总计')) {
      continue
    }

    const item: any = {}
    let hasData = false

    for (const [field, colIdx] of Object.entries(fieldMapping)) {
      const value = row[colIdx as number]
      const valueStr = safeTrim(value)
      if (valueStr) {
        if (field === 'quantity') {
          const num = parseInt(valueStr)
          item[field] = !isNaN(num) ? num : 1
        } else {
          item[field] = valueStr
        }
        hasData = true
      }
    }

    if (hasData) {
      // 如果没有检测到 skuCode 或 skuName，尝试从其他字段推断
      if (!item.skuCode && !item.skuName) {
        // 使用 externalCode 作为备选
        if (item.externalCode) {
          item.skuCode = item.externalCode
        }
        // 或者使用 storeName
        if (!item.skuCode && item.storeName) {
          item.skuName = item.storeName
        }
      }
      // 只要有任何有效数据就添加
      if (item.skuCode || item.skuName || item.externalCode || item.storeName) {
        if (!item.quantity) item.quantity = 1
        result.push(item)
      }
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
    if (data[i]?.some(cell => cell && safeTrim(cell) && /\d/.test(safeTrim(cell)))) {
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

    const rowStr = row.map(cell => safeString(cell)).join('')
    if (!safeTrim(rowStr)) continue
    if (rowStr.includes('合计') || rowStr.includes('总计')) continue

    const item: any = {}
    
    // 尝试提取SKU
    if (skuColumn !== -1 && row[skuColumn]) {
      item.skuCode = safeTrim(row[skuColumn])
    }
    
    // 尝试提取数量
    if (qtyColumn !== -1 && row[qtyColumn]) {
      const num = parseInt(safeTrim(row[qtyColumn]))
      item.quantity = !isNaN(num) && num > 0 ? num : 1
    } else {
      item.quantity = 1
    }

    // 尝试提取名称（非数字的最长文本）
    let maxText = ''
    for (let j = 0; j < row.length; j++) {
      const cell = row[j]
      const cellStr = safeTrim(cell)
      if (cellStr && cellStr.length > maxText.length && !/^\d+$/.test(cellStr)) {
        maxText = cellStr
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
  
  // 尝试在第1行或第2行查找门店列
  let headerRowIndex = 0
  let headerRow: string[] = []
  let storeNames: string[] = []
  
  // 先检查第1行
  const firstRow = data[0] || []
  const firstRowStr = firstRow.map(cell => safeString(cell)).join('')
  
  // 检查是否包含门店关键词
  const storeKeywords = ['银泰', '金桥', '金银潭', '门店', '店', '仓', '仓库']
  let hasStoreColumns = false
  
  for (const cell of firstRow) {
    if (!cell) continue
    const cellStr = safeTrim(cell)
    for (const keyword of storeKeywords) {
      if (cellStr.includes(keyword) && !cellStr.includes('名称') && !cellStr.includes('编码')) {
        hasStoreColumns = true
        storeNames.push(cellStr)
        break
      }
    }
  }
  
  if (hasStoreColumns && storeNames.length >= 2) {
    // 第1行包含门店列
    headerRowIndex = 0
    headerRow = firstRow
    console.log(`第1行检测到门店列: ${storeNames.length}个`)
  } else {
    // 检查第2行
    const secondRow = data[1] || []
    for (const cell of secondRow) {
      if (!cell) continue
      const cellStr = safeTrim(cell)
      for (const keyword of storeKeywords) {
        if (cellStr.includes(keyword) && !cellStr.includes('名称') && !cellStr.includes('编码')) {
          hasStoreColumns = true
          storeNames.push(cellStr)
          break
        }
      }
    }
    
    if (hasStoreColumns && storeNames.length >= 2) {
      headerRowIndex = 1
      headerRow = secondRow
      console.log(`第2行检测到门店列: ${storeNames.length}个`)
    }
  }
  
  if (storeNames.length === 0) return []
  
  // 找到SKU编码和名称列
  let skuCodeCol = -1
  let skuNameCol = -1
  let qtyCol = -1
  
  for (let j = 0; j < headerRow.length; j++) {
    const cell = safeString(headerRow[j] || '')
    if (cell.includes('条码') || cell.includes('SKU编码') || cell.includes('编码')) {
      skuCodeCol = j
    } else if (cell.includes('SKU名称') || cell.includes('名称') || cell.includes('品名')) {
      skuNameCol = j
    } else if (cell.includes('数量') || cell.includes('Qty') || cell.includes('在库')) {
      qtyCol = j
    }
  }

  // 如果没有找到，使用默认列
  if (skuCodeCol === -1) skuCodeCol = 3  // 欢乐牧场模板中，条码在第4列（D列）
  if (skuNameCol === -1) skuNameCol = 2  // 名称在第3列（C列）
  
  console.log(`SKU编码列: ${skuCodeCol}, SKU名称列: ${skuNameCol}`)

  // 解析数据行
  const dataStartRow = headerRowIndex + 1
  for (let i = dataStartRow; i < data.length; i++) {
    const row = data[i]
    if (!row) continue

    const rowStr = row.map(cell => safeString(cell)).join('')
    if (!safeTrim(rowStr)) continue
    if (rowStr.includes('合计') || rowStr.includes('总计')) continue

    const skuCode = safeTrim(row[skuCodeCol])
    const skuName = safeTrim(row[skuNameCol])
    
    if (!skuCode && !skuName) continue

    // 每个门店生成一条记录
    for (let j = 0; j < headerRow.length; j++) {
      const cell = safeString(headerRow[j] || '')
      const storeName = safeTrim(cell)
      
      // 只处理门店列
      if (!storeNames.includes(storeName)) continue

      const qtyStr = safeTrim(row[j])
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

  console.log(`矩阵检测解析完成，共 ${result.length} 条数据`)
  return result
}

// 策略4: 简单提取解析
function parseWithSimpleExtraction(data: string[][]): any[] {
  const result: any[] = []
  
  // 从所有行中提取数据
  for (let i = 0; i < data.length; i++) {
    const row = data[i]
    if (!row) continue

    const rowStr = row.map(cell => safeString(cell)).join('')
    if (!safeTrim(rowStr)) continue
    if (rowStr.includes('合计') || rowStr.includes('总计')) continue

    const item = extractDataFromRow(row)
    if (item) {
      result.push(item)
    }
  }

  return result
}

// 智能检测表头行（支持复杂表单格式）
function detectHeaderRow(data: string[][]): number {
  const keywords = [
    '编码', '编号', 'SKU', '名称', '数量', '规格', '门店',
    '收货', '电话', '地址', '单价', '金额', '日期', '单号', '序号',
    '物品编码', '物品名称', '物品分类', '物品品牌', '规格型号'
  ]

  // 检测是否是复杂表单格式（配送发货单、出库单等）
  // 特点：第1行包含"发货单"、"出库单"、"调拨单"等关键词
  const firstRowStr = (data[0] || []).map(cell => safeString(cell)).join('')
  const isComplexForm = firstRowStr.includes('发货单') || 
                        firstRowStr.includes('出库单') || 
                        firstRowStr.includes('配送单') ||
                        firstRowStr.includes('调拨单')
  
  if (isComplexForm) {
    console.log('检测到复杂表单格式，从第4行开始查找表头')
    // 复杂表单格式，表头通常在第3-5行
    for (let i = 3; i < Math.min(6, data.length); i++) {
      const row = data[i]
      if (!row || row.length === 0) continue
      
      let score = 0
      const rowStr = row.map(cell => safeString(cell)).join('')
      
      // 检查是否包含表头关键词
      for (const keyword of keywords) {
        if (rowStr.includes(keyword)) {
          score += 2
        }
      }
      
      // 有序号列加分
      if (rowStr.includes('序号') || rowStr.includes('NO') || rowStr.includes('No')) {
        score += 3
      }
      
      // 列数较多（复杂表单通常有很多列）
      if (row.length >= 10) {
        score += 5
      }
      
      console.log(`第${i}行得分: ${score}, 列数: ${row.length}, 内容: ${rowStr.substring(0, 100)}`)
      
      if (score >= 10) {
        return i
      }
    }
  }

  // 标准格式，从第0行开始查找
  let bestRow = 0
  let bestScore = 0

  for (let i = 0; i < Math.min(10, data.length); i++) {
    const row = data[i]
    if (!row || row.length === 0) continue

    let score = 0
    const rowStr = row.map(cell => safeString(cell)).join('')

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
    const headerStr = safeTrim(header)
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
      const cellStr = safeTrim(cell)
      if (cellStr && pattern.test(cellStr)) {
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

// 从行数据中提取信息（更宽松的提取方式）
function extractDataFromRow(row: string[]): any | null {
  if (!row || row.length === 0) return null

  let skuCode = ''
  let skuName = ''
  let quantity = 1
  let hasAnyValue = false  // 标记是否有任何值

  for (const cell of row) {
    if (!cell) continue
    const value = safeTrim(cell)
    if (!value) continue
    
    hasAnyValue = true  // 有值

    // 尝试识别SKU编码（字母+数字组合）
    if (!skuCode && /[A-Za-z]{2,}[0-9]/.test(value)) {
      skuCode = value
    } else if (!skuCode && /^[A-Za-z0-9]{6,}$/.test(value)) {
      skuCode = value
    }
    
    // 尝试识别数量（记录最大的数字）
    const num = parseInt(value)
    if (!isNaN(num) && num > 0 && num < 10000 && value.match(/^\d+$/)) {
      if (num > quantity) {
        quantity = num
      }
    }

    // 尝试识别名称
    if (value.length > 3 && value.length < 150 && !/^\d+$/.test(value)) {
      if (!skuName || value.length > skuName.length) {
        skuName = value
      }
    }
  }

  // 放宽条件：只要有值就返回记录
  if (hasAnyValue) {
    // 如果没有识别到 skuCode，用第一个数字作为备选
    if (!skuCode) {
      // 查找第一个数字作为 skuCode
      for (const cell of row) {
        if (!cell) continue
        const value = safeTrim(cell)
        const num = parseInt(value)
        if (!isNaN(num) && num > 0) {
          skuCode = value
          break
        }
      }
    }
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
      const trimmed = safeTrim(line)
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

        if (row.every(cell => !cell || safeTrim(cell) === '')) {
          continue
        }

        const item: any = {}

        for (const [field, colIdx] of Object.entries(colIndexMap)) {
          const rawValue = row[colIdx as number]
          const valueStr = safeTrim(rawValue)
          if (valueStr) {
            if (field === 'quantity') {
              item[field] = parseInt(valueStr) || 0
            } else {
              item[field] = valueStr
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
    const headerStr = safeTrim(header)
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