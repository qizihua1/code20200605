import { NextRequest, NextResponse } from 'next/server'
import * as XLSX from 'xlsx'

// Note: File size limit is configured in next.config.js

export async function POST(request: NextRequest) {
  console.log('Parse API called')
  
  try {
    const formData = await request.formData()
    const file = formData.get('file') as File | null

    console.log('File received:', file ? { name: file.name, size: file.size, type: file.type } : 'No file')

    if (!file) {
      console.error('No file in request')
      return NextResponse.json(
        { error: '请上传文件' },
        { status: 400 }
      )
    }

    // 验证文件格式
    const fileName = file.name.toLowerCase()
    if (!(fileName.endsWith('.xlsx') || fileName.endsWith('.xls'))) {
      console.log('Unsupported file type:', file.type)
      return NextResponse.json({
        error: '暂不支持此文件格式',
        hint: `当前仅支持 Excel 文件 (.xlsx/.xls)，您上传的是：${file.type || '未知类型'}`
      }, { status: 400 })
    }

    // 读取文件内容
    const bytes = await file.arrayBuffer()
    console.log('File bytes read:', bytes.byteLength)
    
    const workbook = XLSX.read(Buffer.from(bytes), { type: 'buffer' })
    console.log('Workbook sheets:', workbook.SheetNames)
    
    // 读取第一个 Sheet
    const sheetName = workbook.SheetNames[0]
    const sheet = workbook.Sheets[sheetName]
    
    // 转换为 JSON
    const jsonData = XLSX.utils.sheet_to_json(sheet, { header: 1 })
    
    // 简单的行转列映射（假设第一行是表头）
    const headers = jsonData[0] as string[]
    const rows = jsonData.slice(1) as any[][]
    
    const data = rows.map((row, index) => {
      const obj: any = { id: index + 1 }
      headers.forEach((header, i) => {
        obj[header] = row[i]
      })
      return obj
    })
    
    // 映射到目标字段（简化处理）
    const mappedData = data.map((row: any) => ({
      externalCode: row['外部编码'] || row['配送单号'] || `TEMP_${Date.now()}_${row.id}`,
      storeName: row['收货门店'] || row['门店名称'],
      recipientName: row['收件人姓名'] || row['收货人'],
      recipientPhone: row['收件人电话'] || row['联系电话'],
      recipientAddress: row['收件人地址'] || row['收货地址'],
      skuCode: row['SKU 物品编码'] || row['物品编码'] || row['商品编码'],
      skuName: row['SKU 物品名称'] || row['物品名称'] || row['商品名称'],
      quantity: parseInt(row['SKU 发货数量'] || row['数量'] || row['发货数量'] || '1'),
      specification: row['SKU 规格型号'] || row['规格'] || row['型号'],
      remarks: row['备注'] || '',
    })).filter((row: any) => row.skuCode || row.skuName) // 过滤空行

    // 基础校验
    const errors: any[] = []
    const validData = mappedData.filter((row: any, index: number) => {
      // 检查必填字段
      const hasStore = !!row.storeName
      const hasRecipient = !!(row.recipientName && row.recipientPhone && row.recipientAddress)
      
      if (!hasStore && !hasRecipient) {
        errors.push({
          rowIndex: index + 1,
          field: '收货信息',
          message: '必须填写 A 组（门店）或 B 组（收件人信息）',
          type: 'required'
        })
        return false
      }
      
      // 检查 SKU 必填
      if (!row.skuCode || !row.skuName || !row.quantity) {
        errors.push({
          rowIndex: index + 1,
          field: 'SKU 信息',
          message: 'SKU 编码、名称和数量为必填项',
          type: 'required'
        })
        return false
      }
      
      // 检查数量为正数
      if (row.quantity <= 0) {
        errors.push({
          rowIndex: index + 1,
          field: '发货数量',
          message: '发货数量必须为正数',
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
      totalCount: data.length,
      validCount: validData.length,
      message: `解析完成：有效${validData.length}条，错误${errors.length}条`
    })
    
  } catch (error: any) {
    console.error('Parse error details:', {
      message: error.message,
      stack: error.stack,
      name: error.name
    })
    return NextResponse.json(
      { error: '解析失败：' + (error.message || '未知错误'), details: error.stack },
      { status: 500 }
    )
  }
}
