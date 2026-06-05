import { NextRequest, NextResponse } from 'next/server'
import * as XLSX from 'xlsx'

// 智能列映射识别
function identifyColumns(headers: string[]) {
  const lowerHeaders = headers.map(h => (h || '').toLowerCase().trim())
  
  const findColumn = (...patterns: string[]) => {
    for (let i = 0; i < lowerHeaders.length; i++) {
      const header = lowerHeaders[i]
      for (const pattern of patterns) {
        if (header.includes(pattern)) return i
      }
    }
    return -1
  }

  return {
    externalCode: findColumn('外部编码', '订单号', '配送单号', '单号', '编号'),
    storeName: findColumn('收货门店', '门店', '店铺', '收货方', '收货机构', '门店名称'),
    recipientName: findColumn('收件人', '收货人', '姓名', '联系人'),
    recipientPhone: findColumn('电话', '手机', '联系方式', '手机号'),
    recipientAddress: findColumn('地址', '收货地址', '配送地址', '详细地址'),
    skuCode: findColumn('SKU 编码', '物品编码', '商品编码', '编码', 'SKU', '物品编号', '商品 ID'),
    skuName: findColumn('SKU 名称', '物品名称', '商品名称', '名称', '品名'),
    quantity: findColumn('数量', '发货数量', 'SKU 数量', '出库数量'),
    specification: findColumn('规格', '型号', '规格型号'),
    remarks: findColumn('备注', '说明', '注释'),
    sheetName: '' // 会被单独设置
  }
}

// 智能识别多 Sheet 文件
function extractFromAllSheets(workbook: XLSX.Workbook) {
  const allRows: any[] = []
  
  for (const sheetName of workbook.SheetNames) {
    const sheet = workbook.Sheets[sheetName]
    const data = XLSX.utils.sheet_to_json(sheet, { header: 1 }) as any[][]
    
    if (data.length < 2) continue
    
    const headers = data[0]
    const colMap = identifyColumns(headers.map(h => String(h)))
    colMap.sheetName = sheetName
    
    const rows = data.slice(1).map((row: any[], idx: number) => {
      const item: any = {
        id: `${sheetName}-${idx + 1}`,
        sheetName: sheetName,
        externalCode: row[colMap.externalCode] || '',
        storeName: row[colMap.storeName] || '',
        recipientName: row[colMap.recipientName] || '',
        recipientPhone: row[colMap.recipientPhone] || '',
        recipientAddress: row[colMap.recipientAddress] || '',
        skuCode: row[colMap.skuCode] || '',
        skuName: row[colMap.skuName] || '',
        quantity: parseInt(row[colMap.quantity] || '0'),
        specification: row[colMap.specification] || '',
        remarks: row[colMap.remarks] || '',
      }
      
      // 如果某个必填字段缺失，尝试从其他列找
      if (!item.externalCode) {
        const possibleKeys = ['配送汇总单号', '配送单号', '外部编码', '订单号', '单号']
        for (const key of possibleKeys) {
          const idx = headers.findIndex(h => String(h).includes(key))
          if (idx >= 0) {
            item.externalCode = row[idx]
            break
          }
        }
      }
      
      return item
    }).filter((r: any) => r.skuCode || r.skuName)
    
    allRows.push(...rows)
  }
  
  return allRows
}

export async function POST(request: NextRequest) {
  try {
    const formData = await request.formData()
    const file = formData.get('file') as File | null

    if (!file) {
      return NextResponse.json({ error: '请上传文件', hint: '没有收到文件，请重试' }, { status: 400 })
    }

    const fileName = file.name.toLowerCase()
    if (!(fileName.endsWith('.xlsx') || fileName.endsWith('.xls'))) {
      return NextResponse.json({ 
        error: '不支持的格式', 
        hint: `当前仅支持 Excel 文件，您上传的是：${file.type || '未知类型'}` 
      }, { status: 400 })
    }

    const bytes = await file.arrayBuffer()
    const workbook = XLSX.read(bytes, { type: 'array' })
    
    // 检查是否有多 sheet
    const isMultiSheet = workbook.SheetNames.length > 1
    
    let rawData: any[]
    if (isMultiSheet) {
      rawData = extractFromAllSheets(workbook)
    } else {
      const sheetName = workbook.SheetNames[0]
      const sheet = workbook.Sheets[sheetName]
      const jsonData = XLSX.utils.sheet_to_json(sheet, { header: 1 }) as any[][]
      
      const headers = jsonData[0]
      const colMap = identifyColumns(headers.map(h => String(h)))
      
      rawData = jsonData.slice(1).map((row: any[], idx: number) => ({
        id: idx + 1,
        externalCode: row[colMap.externalCode] || '',
        storeName: row[colMap.storeName] || '',
        recipientName: row[colMap.recipientName] || '',
        recipientPhone: row[colMap.recipientPhone] || '',
        recipientAddress: row[colMap.recipientAddress] || '',
        skuCode: row[colMap.skuCode] || '',
        skuName: row[colMap.skuName] || '',
        quantity: parseInt(row[colMap.quantity] || '0'),
        specification: row[colMap.specification] || '',
        remarks: row[colMap.remarks] || '',
      })).filter((r: any) => r.skuCode || r.skuName)
    }

    // 校验
    const errors: any[] = []
    const validData = rawData.filter((row: any, idx: number) => {
      const hasStore = !!row.storeName
      const hasRecipient = !!(row.recipientName && row.recipientPhone && row.recipientAddress)
      
      if (!hasStore && !hasRecipient) {
        errors.push({ 
          rowIndex: idx + 1, 
          field: '收货信息', 
          message: '必须填写 A 组（门店）或 B 组（收件人）', 
          type: 'required' 
        })
        return false
      }
      
      if (!row.skuCode || !row.skuName) {
        errors.push({ 
          rowIndex: idx + 1, 
          field: 'SKU 信息', 
          message: 'SKU 编码、名称为必填', 
          type: 'required' 
        })
        return false
      }
      
      if (row.quantity <= 0) {
        errors.push({ 
          rowIndex: idx + 1, 
          field: '数量', 
          message: '数量必须为正数', 
          type: 'format' 
        })
        return false
      }
      
      return true
    })

    return NextResponse.json({
      success: true,
      data: validData,
      errors,
      totalCount: rawData.length,
      validCount: validData.length,
      sheetCount: workbook.SheetNames.length,
      sheetNames: workbook.SheetNames,
      message: `成功解析 ${validData.length} 条数据，共 ${workbook.SheetNames.length} 个工作表`
    })
    
  } catch (error: any) {
    console.error('Parse API Error:', error)
    return NextResponse.json({
      error: '解析失败',
      details: error.message,
      hint: '请检查文件格式是否正确'
    }, { status: 500 })
  }
}
