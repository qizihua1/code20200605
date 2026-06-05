import { NextRequest, NextResponse } from 'next/server'
import * as XLSX from 'xlsx'

export async function POST(request: NextRequest) {
  try {
    const formData = await request.formData()
    const file = formData.get('file') as File | null

    if (!file) {
      return NextResponse.json({ error: '请上传文件', hint: '没有收到文件，请重试' }, { status: 400 })
    }

    // 验证文件格式
    const fileName = file.name.toLowerCase()
    if (!(fileName.endsWith('.xlsx') || fileName.endsWith('.xls'))) {
      return NextResponse.json({ 
        error: '不支持的格式', 
        hint: `当前仅支持 Excel 文件，您上传的是：${file.type || '未知类型'}` 
      }, { status: 400 })
    }

    // 读取并解析 Excel
    const bytes = await file.arrayBuffer()
    const workbook = XLSX.read(bytes, { type: 'array' })
    
    const sheetName = workbook.SheetNames[0]
    const sheet = workbook.Sheets[sheetName]
    const jsonData = XLSX.utils.sheet_to_json(sheet, { header: 1 })
    
    // 转换数据
    const headers = jsonData[0] as string[]
    const rows = jsonData.slice(1)
    
    const data = rows.map((row: any, idx: number) => ({
      id: idx + 1,
      externalCode: row[headers.indexOf('外部编码')] !== undefined ? row[headers.indexOf('外部编码')] : `TEMP_${Date.now()}_${idx}`,
      storeName: row[headers.indexOf('收货门店')] || row[headers.indexOf('门店名称')] || '',
      recipientName: row[headers.indexOf('收件人姓名')] || row[headers.indexOf('收货人')] || '',
      recipientPhone: row[headers.indexOf('收件人电话')] || row[headers.indexOf('联系电话')] || '',
      recipientAddress: row[headers.indexOf('收件人地址')] || row[headers.indexOf('收货地址')] || '',
      skuCode: row[headers.indexOf('SKU 物品编码')] || row[headers.indexOf('物品编码')] || '',
      skuName: row[headers.indexOf('SKU 物品名称')] || row[headers.indexOf('物品名称')] || '',
      quantity: parseInt(row[headers.indexOf('SKU 发货数量')] || row[headers.indexOf('数量')] || row[headers.indexOf('发货数量')] || '1'),
      specification: row[headers.indexOf('SKU 规格型号')] || row[headers.indexOf('规格')] || '',
      remarks: row[headers.indexOf('备注')] || '',
    })).filter((r: any) => r.skuCode || r.skuName)

    // 校验
    const errors: any[] = []
    const validData = data.filter((row: any, idx: number) => {
      const hasStore = !!row.storeName
      const hasRecipient = !!(row.recipientName && row.recipientPhone && row.recipientAddress)
      if (!hasStore && !hasRecipient) {
        errors.push({ rowIndex: idx + 1, field: '收货信息', message: '必须填写 A 组（门店）或 B 组（收件人）', type: 'required' })
        return false
      }
      if (!row.skuCode || !row.skuName || !row.quantity) {
        errors.push({ rowIndex: idx + 1, field: 'SKU 信息', message: 'SKU 编码、名称、数量为必填', type: 'required' })
        return false
      }
      if (row.quantity <= 0) {
        errors.push({ rowIndex: idx + 1, field: '数量', message: '数量必须为正数', type: 'format' })
        return false
      }
      return true
    })

    return NextResponse.json({
      success: true,
      data: validData,
      errors,
      totalCount: data.length,
      validCount: validData.length,
      message: `成功解析 ${validData.length} 条数据`
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
