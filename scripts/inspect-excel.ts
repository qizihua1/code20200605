
import * as XLSX from 'xlsx'
import * as fs from 'fs'
import * as path from 'path'

const DEMO_DIR = '/Users/shaofan/Downloads/demos'

function inspectExcel(filePath: string) {
  console.log(`\n=== 检查文件: ${path.basename(filePath)} ===`)
  
  const buffer = fs.readFileSync(filePath)
  const workbook = XLSX.read(buffer)
  
  console.log(`Sheet 数量: ${workbook.SheetNames.length}`)
  console.log(`Sheet 名称: ${workbook.SheetNames.join(', ')}`)
  
  workbook.SheetNames.forEach((sheetName, idx) =&gt; {
    console.log(`\n--- Sheet ${idx + 1}: ${sheetName} ---`)
    
    const sheet = workbook.Sheets[sheetName]
    const data = XLSX.utils.sheet_to_json(sheet, { header: 1 }) as any[][]
    
    console.log(`行数: ${data.length}`)
    console.log(`最大列数: ${Math.max(...data.map(row =&gt; row.length))}`)
    
    console.log('\n前 10 行内容:')
    data.slice(0, 10).forEach((row, rowIdx) =&gt; {
      console.log(`[${rowIdx}]: ${row.map(cell =&gt; String(cell || '').trim()).join(' | ')}`)
    })
    
    if (data.length &gt; 10) {
      console.log(`... 还有 ${data.length - 10} 行`)
    }
  })
}

// 检查所有 demo 文件
fs.readdirSync(DEMO_DIR).forEach(file =&gt; {
  if (file.endsWith('.xlsx') || file.endsWith('.xls')) {
    inspectExcel(path.join(DEMO_DIR, file))
  }
})
