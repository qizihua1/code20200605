import { NextRequest, NextResponse } from 'next/server'
import { v4 as uuidv4 } from 'uuid'
import { xlsx, utils } from 'xlsx'

export const config = {
  api: {
    bodyParser: {
      sizeLimit: '10mb',
    },
  },
}

export async function POST(request: NextRequest) {
  try {
    const formData = await request.formData()
    const file = formData.get('file') as File | null
    const ruleId = formData.get('ruleId') as string | null

    if (!file) {
      return NextResponse.json(
        { error: '请上传文件' },
        { status: 400 }
      )
    }

    // 验证文件格式
    const allowedTypes = [
      'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      'application/vnd.ms-excel',
      'application/pdf',
      'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    ]

    if (!allowedTypes.some(type => file.type.includes(type.split('/')[1]))) {
      return NextResponse.json(
        { error: '不支持的文件格式，请上传 .xlsx/.xls/.docx/.pdf 文件' },
        { status: 400 }
      )
    }

    // 读取文件内容
    const bytes = await file.arrayBuffer()
    
    // 解析 Excel 文件（简化版，后续可扩展）
    let data: any[] = []
    
    if (file.name.endsWith('.xlsx') || file.name.endsWith('.xls')) {
      const workbook = xlsx.read(Buffer.from(bytes), { type: 'buffer' })
      
      // 读取第一个 Sheet
      const sheetName = workbook.SheetNames[0]
      const sheet = workbook.Sheets[sheetName]
      
      // 转换为 JSON
      const jsonData = utils.sheet_to_json(sheet, { header: 1 })
      
      // 简单的行转列映射（假设第一行是表头）
      const headers = jsonData[0] as string[]
      const rows = jsonData.slice(1) as any[][]
      
      data = rows.map((row, index) => {
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
    } else {
      // PDF/Word 文件暂时返回提示
      return NextResponse.json({
        error: 'PDF/Word 文件解析功能开发中，请先上传 Excel 文件',
        hint: '当前版本仅支持 Excel 文件格式'
      }, { status: 400 })
    }

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
    console.error('Parse error:', error)
    return NextResponse.json(
      { error: '解析失败：' + (error.message || '未知错误') },
      { status: 500 }
    )
  }
}
