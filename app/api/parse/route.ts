import { NextRequest, NextResponse } from 'next/server'
import * as XLSX from 'xlsx'
import { PrismaClient } from '@prisma/client'

const prisma = new PrismaClient()

// ==================== 5 种 Excel 文件格式专用解析器 ====================

// 格式 1: 配送发货单 (PS2512220005001)
function parseFormat1(data: any[][]) {
  const result: any[] = []
  // 第 1 行是标题，第 2 行开始是数据
  // 格式：收货机构 | 黎明屯铁锅炖（海口龙湖天街店）| 供货机构 | ...
  // 需要成对读取
  const info: any = {}
  const rowData = data[1]
  for (let i = 0; i < rowData.length; i += 2) {
    const key = rowData[i]
    const value = rowData[i + 1]
    if (key && value) info[key] = value
  }
  
  // 从第 4 行开始是 SKU 数据
  for (let i = 3; i < data.length; i++) {
    const row = data[i]
    if (!row[0] && !row[1]) continue
    
    result.push({
      externalCode: info['订货单号'] || info['配送单号'] || `PS-${Date.now()}`,
      storeName: info['收货机构'] || info['收货门店'] || '',
      skuCode: row[0] || '',
      skuName: row[1] || '',
      quantity: parseInt(row[2] || '0'),
      specification: row[3] || '',
      remarks: row[4] || '',
    })
  }
  return result
}

// 格式 2: 多门店分 Sheet 出库单
function parseFormat2(workbook: XLSX.WorkBook) {
  const result: any[] = []
  
  for (const sheetName of workbook.SheetNames) {
    const sheet = workbook.Sheets[sheetName]
    const data = XLSX.utils.sheet_to_json(sheet, { header: 1 }) as any[][]
    
    // 第 1 行是标题（店名）
    // 第 2 行是：出库日期 | 日期 | 仓库 | 仓库名 | 配送方式 | 方式 | 打印时间 | 时间
    // 第 3 行是表头：序号 | 物品编号 | 物品名称 | 规格 | 单位 | 数量
    if (data.length < 4) continue
    
    const infoRow = data[1]
    const storeName = data[0][0] || sheetName
    
    for (let i = 3; i < data.length; i++) {
      const row = data[i]
      if (!row[1] && !row[2]) continue
      
      result.push({
        externalCode: `CK-${sheetName}-${Date.now()}`,
        storeName: storeName,
        skuCode: row[1] || '',
        skuName: row[2] || '',
        quantity: parseInt(row[5] || '0'),
        specification: row[3] || '',
        remarks: '',
      })
    }
  }
  return result
}

// 格式 3: 欢乐牧场模板 (库存表)
function parseFormat3(data: any[][]) {
  const result: any[] = []
  // 第 1 行是表头
  // 仓库名称 | 货主名称 | SKU 名称 | SKU 条码 | 外部商品编码 | ...
  for (let i = 1; i < data.length; i++) {
    const row = data[i]
    if (!row[2] && !row[3]) continue
    
    result.push({
      externalCode: row[4] || `KC-${Date.now()}-${i}`,
      storeName: row[0] || '',
      skuCode: row[3] || row[2] || '',
      skuName: row[2] || '',
      quantity: parseInt(row[8] || row[9] || '0'),
      specification: row[7] || '',
      remarks: '',
    })
  }
  return result
}

// 格式 4: 湖南仓 (带批次保质期)
function parseFormat4(data: any[][]) {
  const result: any[] = []
  // 第 1 行是说明，第 2 行是表头
  // 收货机构 | 配送汇总单号* | 配送单号 | 物品行号* | 物品分类 | 物品编码* | 物品名称 | ...
  const headers = data[1] || []
  
  const findCol = (...patterns: string[]) => {
    for (let i = 0; i < headers.length; i++) {
      const h = String(headers[i] || '')
      for (const p of patterns) {
        if (h.includes(p)) return i
      }
    }
    return -1
  }
  
  const colMap = {
    storeName: findCol('收货机构', '门店'),
    externalCode: findCol('配送汇总单号', '配送单号', '单号'),
    skuCode: findCol('物品编码', 'SKU 编码', '编码'),
    skuName: findCol('物品名称', 'SKU 名称', '名称'),
    quantity: findCol('数量', '发货数量'),
    specification: findCol('规格', '型号'),
    remarks: findCol('备注', '说明'),
  }
  
  for (let i = 2; i < data.length; i++) {
    const row = data[i]
    if (!row[colMap.skuCode] && !row[colMap.skuName]) continue
    
    result.push({
      externalCode: row[colMap.externalCode] || `HN-${Date.now()}-${i}`,
      storeName: row[colMap.storeName] || '',
      skuCode: row[colMap.skuCode] || '',
      skuName: row[colMap.skuName] || '',
      quantity: parseInt(row[colMap.quantity] || '0'),
      specification: row[colMap.specification] || '',
      remarks: row[colMap.remarks] || '',
    })
  }
  return result
}

// 格式 5: 门店调拨单 - 卡片式
function parseFormat5(data: any[][]) {
  const result: any[] = []
  // 第 1 行是标题，第 2 行是信息，第 3 行是表头
  // 从第 4 行开始是数据
  
  const infoRow = data[1]
  const externalCode = String(infoRow[0] || '').replace('调拨单号：', '').replace('DB', 'DB') || `DB-${Date.now()}`
  
  for (let i = 3; i < data.length; i++) {
    const row = data[i]
    if (!row[0] && !row[1]) continue
    
    const skuCode = row[0] || ''
    const skuName = row[1] || ''
    
    // 数量可能在多个列中，找数字列
    let quantity = 0
    for (let j = 2; j < row.length; j++) {
      const val = parseInt(row[j] || '0')
      if (val > 0) {
        quantity = val
        break
      }
    }
    
    result.push({
      externalCode,
      storeName: '',
      skuCode,
      skuName,
      quantity,
      specification: row[2] || '',
      remarks: row[row.length - 1] || '',
    })
  }
  return result
}

// ==================== 智能识别文件格式 ====================

function detectFormat(fileName: string, workbook: XLSX.WorkBook, firstSheetData: any[][]): number {
  // 根据文件名识别
  if (fileName.includes('配送发货单') || fileName.includes('PS')) return 1
  if (fileName.includes('多门店') || fileName.includes('分 Sheet')) return 2
  if (fileName.includes('欢乐牧场')) return 3
  if (fileName.includes('湖南仓')) return 4
  if (fileName.includes('调拨单')) return 5
  
  // 根据数据结构识别
  const firstRow = firstSheetData[0] || []
  const secondRow = firstSheetData[1] || []
  
  // 格式 2: 多 Sheet
  if (workbook.SheetNames.length > 2) return 2
  
  // 格式 3: 库存表 (有"在库数量"列)
  if (String(firstRow[8] || '').includes('在库数量')) return 3
  
  // 格式 4: 湖南仓 (第一行有说明文字)
  if (String(firstRow[0] || '').includes('①') || String(firstRow[0] || '').includes('必填')) return 4
  
  // 格式 5: 调拨单 (有"调拨单号")
  if (String(secondRow[0] || '').includes('调拨单号')) return 5
  
  // 默认格式 1
  return 1
}

export async function POST(request: NextRequest) {
  const formData = await request.formData()
  const file = formData.get('file') as File | null

  if (!file) {
    return NextResponse.json({ error: '请上传文件', hint: '没有收到文件，请重试' }, { status: 400 })
  }

  try {
    const bytes = await file.arrayBuffer()
    const workbook = XLSX.read(bytes, { type: 'array' })
    const fileName = file.name
    
    // 读取第一个 sheet 的数据用于格式识别
    const firstSheetName = workbook.SheetNames[0]
    const firstSheet = workbook.Sheets[firstSheetName]
    const firstSheetData = XLSX.utils.sheet_to_json(firstSheet, { header: 1 }) as any[][]
    
    // 识别文件格式
    const formatType = detectFormat(fileName, workbook, firstSheetData)
    
    // 根据格式解析
    let rawData: any[]
    switch (formatType) {
      case 1: rawData = parseFormat1(firstSheetData); break
      case 2: rawData = parseFormat2(workbook); break
      case 3: rawData = parseFormat3(firstSheetData); break
      case 4: rawData = parseFormat4(firstSheetData); break
      case 5: rawData = parseFormat5(firstSheetData); break
      default: rawData = []
    }
    
    // 保存到数据库
    const shipment = await prisma.shipment.create({
      data: {
        externalCode: rawData[0]?.externalCode || `UPLOAD-${Date.now()}`,
        storeName: rawData[0]?.storeName || '',
        status: 'pending',
        items: {
          create: rawData
            .filter(r => r.skuCode || r.skuName)
            .map(r => ({
              skuCode: r.skuCode || 'UNKNOWN',
              skuName: r.skuName || '',
              quantity: r.quantity || 0,
              specification: r.specification || '',
              remarks: r.remarks || '',
            }))
        }
      },
      include: {
        items: true
      }
    })
    
    await prisma.$disconnect()

    return NextResponse.json({
      success: true,
      formatType,
      formatName: ['未知', '配送发货单', '多门店出库单', '库存表', '湖南仓', '调拨单'][formatType],
      data: shipment.items.map((item: any) => ({
        ...item,
        storeName: shipment.storeName,
        externalCode: shipment.externalCode,
      })),
      total: shipment.items.length,
      shipmentId: shipment.id,
      message: `识别为【${['未知', '配送发货单', '多门店出库单', '库存表', '湖南仓', '调拨单'][formatType]}】格式，成功解析 ${shipment.items.length} 条数据并已保存到数据库`
    })
    
  } catch (error: any) {
    console.error('Parse Error:', error)
    await prisma.$disconnect()
    return NextResponse.json({
      error: '解析失败',
      details: error.message,
      hint: '请检查文件格式，支持 5 种 Excel 模板'
    }, { status: 500 })
  }
}
