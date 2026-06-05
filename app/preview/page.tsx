'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { Toaster } from 'sonner'

export default function PreviewPage() {
  const router = useRouter()
  const [file, setFile] = useState<File | null>(null)
  const [parsing, setParsing] = useState(false)
  const [progress, setProgress] = useState(0)
  const [data, setData] = useState<any[]>([])
  const [errors, setErrors] = useState<any[]>([])

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const selectedFile = e.target.files?.[0]
    if (selectedFile) {
      setFile(selectedFile)
      console.log('文件已选择:', selectedFile.name, selectedFile.size, selectedFile.type)
    }
  }

  const handleUpload = async () => {
    console.log('=== 开始上传 ===')
    
    if (!file) {
      alert('请先选择文件！')
      return
    }

    console.log('上传文件:', file.name)
    setParsing(true)
    setProgress(10)
    setErrors([])

    try {
      const formData = new FormData()
      formData.append('file', file)

      console.log('发送请求...')
      setProgress(40)

      const res = await fetch('/api/parse', { 
        method: 'POST', 
        body: formData 
      })
      
      console.log('响应状态:', res.status)
      setProgress(70)
      
      const result = await res.json()
      console.log('完整响应:', result)
      setProgress(100)
      
      if (!res.ok) {
        const errorMsg = result.error || result.hint || '解析失败'
        alert(errorMsg)
        setParsing(false)
        return
      }
      
      setData(result.data || [])
      setErrors(result.errors || [])
      
      const successMsg = `解析成功！\n有效数据：${result.validCount}条\n错误：${result.errors?.length || 0}条`
      alert(successMsg)
      
      setParsing(false)
    } catch (error: any) {
      console.error('上传错误:', error)
      alert('解析失败：' + error.message)
      setParsing(false)
    }
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-blue-50 to-teal-50 p-8">
      <Toaster position="top-center" richColors />
      
      <div className="max-w-6xl mx-auto">
        <header className="mb-8">
          <a href="/" className="text-teal-600 hover:underline mb-4 inline-block">← 返回首页</a>
          <h1 className="text-3xl font-bold text-teal-600 mb-2">数据预览</h1>
          <p className="text-gray-600">上传 Excel 文件并解析数据</p>
        </header>

        {/* 文件上传 */}
        <div className="bg-white rounded-xl shadow-lg p-6 mb-6">
          <h2 className="text-xl font-semibold mb-4">1. 选择 Excel 文件</h2>
          <div className="space-y-4">
            <input
              type="file"
              accept=".xlsx,.xls"
              onChange={handleFileChange}
              className="block w-full text-sm text-gray-500
                file:mr-4 file:py-2 file:px-4
                file:rounded-lg file:border-0
                file:text-sm file:font-semibold
                file:bg-teal-50 file:text-teal-700
                hover:file:bg-teal-100"
              id="file-input"
            />
            
            {file && (
              <div className="bg-teal-50 border border-teal-200 rounded-lg p-4">
                <p className="text-teal-800 font-medium">已选择的文件:</p>
                <p className="text-teal-700">📄 {file.name}</p>
                <p className="text-teal-600 text-sm">大小：{(file.size / 1024).toFixed(2)} KB</p>
              </div>
            )}
            
            <button
              onClick={handleUpload}
              disabled={!file || parsing}
              className={`w-full py-3 px-6 rounded-lg font-semibold text-white transition-all
                ${!file || parsing 
                  ? 'bg-gray-400 cursor-not-allowed' 
                  : 'bg-teal-600 hover:bg-teal-700 hover:shadow-lg'
                }`}
            >
              {parsing ? `解析中... ${progress}%` : '开始解析'}
            </button>

            {parsing && (
              <div className="w-full bg-gray-200 rounded-full h-3">
                <div 
                  className="bg-teal-600 h-3 rounded-full transition-all duration-300"
                  style={{ width: `${progress}%` }}
                />
              </div>
            )}
          </div>
        </div>

        {/* 数据预览 */}
        {data.length > 0 && (
          <div className="bg-white rounded-xl shadow-lg p-6">
            <h2 className="text-xl font-semibold mb-4">2. 解析结果</h2>
            
            {errors.length > 0 && (
              <div className="bg-red-50 border border-red-200 rounded-lg p-4 mb-4">
                <h3 className="font-semibold text-red-800 mb-2">发现 {errors.length} 个错误:</h3>
                <ul className="space-y-1">
                  {errors.map((err, i) => (
                    <li key={i} className="text-red-700 text-sm">
                      第{err.rowIndex}行：{err.field} - {err.message}
                    </li>
                  ))}
                </ul>
              </div>
            )}

            <div className="overflow-x-auto">
              <table className="w-full border">
                <thead className="bg-gray-50">
                  <tr>
                    <th className="border p-2 text-sm font-semibold">外部编码</th>
                    <th className="border p-2 text-sm font-semibold">收货门店</th>
                    <th className="border p-2 text-sm font-semibold">SKU 编码</th>
                    <th className="border p-2 text-sm font-semibold">SKU 名称</th>
                    <th className="border p-2 text-sm font-semibold">数量</th>
                  </tr>
                </thead>
                <tbody>
                  {data.map((row, index) => (
                    <tr key={index} className="hover:bg-gray-50">
                      <td className="border p-2">{row.externalCode || '-'}</td>
                      <td className="border p-2">{row.storeName || '-'}</td>
                      <td className="border p-2">{row.skuCode}</td>
                      <td className="border p-2">{row.skuName}</td>
                      <td className="border p-2">{row.quantity}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            
            <p className="mt-4 text-center text-gray-600">
              共 {data.length} 条数据
            </p>
          </div>
        )}
      </div>
    </div>
  )
}
