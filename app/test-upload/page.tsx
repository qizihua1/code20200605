'use client'

import { useState } from 'react'

export default function TestUploadPage() {
  const [file, setFile] = useState<File | null>(null)
  const [result, setResult] = useState<any>(null)
  const [logs, setLogs] = useState<string[]>([])

  const addLog = (msg: string) => {
    console.log(msg)
    setLogs(prev => [...prev, msg])
  }

  const handleUpload = async () => {
    addLog('=== 开始测试 ===')
    
    if (!file) {
      addLog('❌ 错误：没有选择文件')
      alert('请先选择文件！')
      return
    }

    addLog(`✓ 文件已选择：${file.name} (${file.size} bytes, ${file.type})`)

    try {
      addLog('正在上传...')
      const formData = new FormData()
      formData.append('file', file)
      
      addLog('发送 POST 请求到 /api/parse')
      
      const response = await fetch('/api/parse', {
        method: 'POST',
        body: formData
      })
      
      addLog(`✓ 响应状态：${response.status}`)
      addLog(`✓ 响应类型：${response.headers.get('content-type')}`)
      
      const data = await response.json()
      addLog(`✓ 响应数据：${JSON.stringify(data).substring(0, 200)}...`)
      
      setResult(data)
      
      if (response.ok) {
        alert(`✅ 成功！解析了 ${data.validCount} 条数据`)
      } else {
        alert(`❌ 失败：${data.error || data.hint}`)
      }
    } catch (error: any) {
      addLog(`❌ 异常：${error.message}`)
      alert(`上传失败：${error.message}`)
    }
  }

  return (
    <div className="min-h-screen p-8 bg-gray-50">
      <div className="max-w-4xl mx-auto">
        <h1 className="text-2xl font-bold mb-4">🧪 文件上传诊断页面</h1>
        <p className="mb-6 text-gray-600">测试 Excel 文件上传功能</p>

        <div className="bg-white rounded-lg shadow p-6 mb-4">
          <h2 className="font-semibold mb-3">1. 选择文件</h2>
          <input
            type="file"
            accept=".xlsx,.xls"
            onChange={(e) => {
              const f = e.target.files?.[0]
              if (f) {
                setFile(f)
                addLog(`选择文件：${f.name}, 类型：${f.type}, 大小：${f.size}`)
              }
            }}
            className="block w-full"
            id="fileInput"
          />
        </div>

        <div className="bg-white rounded-lg shadow p-6 mb-4">
          <h2 className="font-semibold mb-3">2. 上传测试</h2>
          <button
            onClick={handleUpload}
            disabled={!file}
            className={`px-6 py-2 rounded ${!file ? 'bg-gray-300' : 'bg-blue-600 text-white hover:bg-blue-700'}`}
          >
            点击上传
          </button>
        </div>

        {result && (
          <div className="bg-white rounded-lg shadow p-6">
            <h2 className="font-semibold mb-3">3. 响应结果</h2>
            <pre className="bg-gray-100 p-4 rounded text-xs overflow-auto">
              {JSON.stringify(result, null, 2)}
            </pre>
          </div>
        )}

        <div className="bg-white rounded-lg shadow p-6">
          <h2 className="font-semibold mb-3">4. 日志输出</h2>
          <div className="bg-black text-green-400 p-4 rounded font-mono text-xs h-64 overflow-auto">
            {logs.length === 0 ? (
              <p className="text-gray-500">暂无日志</p>
            ) : (
              logs.map((log, i) => <div key={i}>{log}</div>)
            )}
          </div>
          <button
            onClick={() => setLogs([])}
            className="mt-3 text-sm text-blue-600 hover:underline"
          >
            清空日志
          </button>
        </div>

        <div className="mt-8 p-4 bg-yellow-50 border border-yellow-200 rounded">
          <h3 className="font-semibold text-yellow-800 mb-2">💡 如果按钮没反应：</h3>
          <ol className="text-sm text-yellow-700 space-y-1">
            <li>1. 按 F12 打开浏览器开发者工具</li>
            <li>2. 切换到 Console（控制台）标签</li>
            <li>3. 点击"点击上传"按钮</li>
            <li>4. 截图 Console 中的红色错误信息并发给我</li>
          </ol>
        </div>
      </div>
    </div>
  )
}
