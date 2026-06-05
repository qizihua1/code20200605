'use client'

import { useState } from 'react'

export default function DebugPage() {
  const [file, setFile] = useState<File | null>(null)
  const [rawData, setRawData] = useState<any[]>([])
  const [headers, setHeaders] = useState<string[]>([])

  const handleFile = async () => {
    if (!file) return

    const bytes = await file.arrayBuffer()
    const XLSX = await import('xlsx')
    const workbook = XLSX.read(bytes, { type: 'array' })
    
    const sheetName = workbook.SheetNames[0]
    const sheet = workbook.Sheets[sheetName]
    const jsonData = XLSX.utils.sheet_to_json(sheet, { header: 1 })
    
    const headersRow = jsonData[0] as string[]
    const firstRows = jsonData.slice(0, 5)
    
    setHeaders(headersRow)
    setRawData(firstRows)
  }

  return (
    <div className="min-h-screen p-8 bg-gray-50">
      <div className="max-w-6xl mx-auto">
        <h1 className="text-2xl font-bold mb-4">🔬 Excel 结构分析</h1>
        
        <div className="bg-white rounded-lg shadow p-6 mb-4">
          <h2 className="font-semibold mb-3">1. 选择文件</h2>
          <input
            type="file"
            accept=".xlsx,.xls"
            onChange={(e) => setFile(e.target.files?.[0] || null)}
            className="block w-full mb-3"
          />
          <button
            onClick={handleFile}
            disabled={!file}
            className="bg-blue-600 text-white px-6 py-2 rounded disabled:bg-gray-300"
          >
            分析文件结构
          </button>
        </div>

        {headers.length > 0 && (
          <div className="bg-white rounded-lg shadow p-6 mb-4">
            <h2 className="font-semibold mb-3">2. 表头（第一行）</h2>
            <div className="grid grid-cols-4 gap-2">
              {headers.map((h, i) => (
                <div key={i} className="bg-blue-50 p-2 rounded border">
                  <span className="text-xs text-gray-500">列{i}</span>
                  <p className="font-semibold">"{h}"</p>
                </div>
              ))}
            </div>
          </div>
        )}

        {rawData.length > 0 && (
          <div className="bg-white rounded-lg shadow p-6">
            <h2 className="font-semibold mb-3">3. 前 5 行数据</h2>
            <table className="w-full border text-sm">
              <thead className="bg-gray-100">
                <tr>
                  {headers.map((h, i) => (
                    <th key={i} className="border p-2">{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {rawData.slice(1).map((row, i) => (
                  <tr key={i} className="hover:bg-gray-50">
                    {headers.map((_, j) => (
                      <td key={j} className="border p-2">{row[j] || '-'}</td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        {headers.length > 0 && (
          <div className="bg-yellow-50 border border-yellow-200 rounded-lg p-4 mt-4">
            <h3 className="font-semibold text-yellow-800 mb-2">📋 请告诉我：</h3>
            <p className="text-sm text-yellow-700 mb-2">根据上面的表头，哪一列是：</p>
            <ul className="text-sm space-y-1">
              <li>• SKU 编码 = <span className="font-mono bg-white px-2 py-1 rounded">?</span></li>
              <li>• SKU 名称 = <span className="font-mono bg-white px-2 py-1 rounded">?</span></li>
              <li>• 数量 = <span className="font-mono bg-white px-2 py-1 rounded">?</span></li>
              <li>• 外部编码/订单号 = <span className="font-mono bg-white px-2 py-1 rounded">?</span></li>
            </ul>
            <p className="text-xs text-yellow-600 mt-3">
              告诉我这些列的准确名称（就是上面表头显示的文字），我会更新代码来正确解析您的文件。
            </p>
          </div>
        )}
      </div>
    </div>
  )
}
