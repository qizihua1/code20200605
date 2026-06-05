'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { toast } from 'sonner'

export default function PreviewPage() {
  const router = useRouter()
  const [file, setFile] = useState<File | null>(null)
  const [parsing, setParsing] = useState(false)
  const [progress, setProgress] = useState(0)
  const [data, setData] = useState<any[]>([])
  const [selectedRule, setSelectedRule] = useState('')

  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files[0]) {
      setFile(e.target.files[0])
    }
  }

  const handleUpload = async () => {
    if (!file) {
      toast.error('请选择文件')
      return
    }

    setParsing(true)
    setProgress(0)

    // 模拟进度
    const progressInterval = setInterval(() => {
      setProgress(prev => Math.min(prev + 10, 90))
    }, 300)

    try {
      // 这里后续会实现真实的上传和解析逻辑
      const formData = new FormData()
      formData.append('file', file)
      if (selectedRule) formData.append('ruleId', selectedRule)

      // TODO: 调用实际 API
      // const res = await fetch('/api/parse', { method: 'POST', body: formData })
      
      // 模拟解析完成
      setTimeout(() => {
        clearInterval(progressInterval)
        setProgress(100)
        setParsing(false)
        setData([
          { externalCode: 'TEST001', storeName: '测试门店', skuCode: 'SKU001', skuName: '测试商品', quantity: 10 },
        ])
        toast.success('解析成功')
      }, 2000)
    } catch (error) {
      clearInterval(progressInterval)
      setParsing(false)
      toast.error('解析失败：' + (error as Error).message)
    }
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-blue-50 to-teal-50 p-8">
      <div className="max-w-6xl mx-auto">
        <header className="mb-8">
          <a href="/" className="text-teal-600 hover:underline mb-4 inline-block">← 返回首页</a>
          <h1 className="text-3xl font-bold text-teal-600 mb-2">数据预览</h1>
          <p className="text-gray-600">上传文件、AI 解析、编辑并提交数据</p>
        </header>

        {/* 文件上传 */}
        <div className="bg-white rounded-xl shadow-lg p-6 mb-6">
          <h2 className="text-xl font-semibold mb-4">1. 上传文件</h2>
          <div className="border-2 border-dashed border-teal-300 rounded-lg p-8 text-center">
            <input
              type="file"
              accept=".xlsx,.xls,.docx,.pdf"
              onChange={handleFileSelect}
              className="hidden"
              id="file-upload"
            />
            <label htmlFor="file-upload" className="cursor-pointer">
              <div className="text-teal-600 text-4xl mb-2">📄</div>
              <div className="text-gray-700 font-medium">
                {file ? file.name : '点击选择文件或拖拽到此处'}
              </div>
              <div className="text-sm text-gray-500 mt-2">
                支持 Excel (.xlsx/.xls)、Word (.docx)、PDF (.pdf)
              </div>
            </label>
          </div>
        </div>

        {/* 规则选择 */}
        <div className="bg-white rounded-xl shadow-lg p-6 mb-6">
          <h2 className="text-xl font-semibold mb-4">2. 选择解析规则</h2>
          <div className="flex gap-3">
            <select
              value={selectedRule}
              onChange={(e) => setSelectedRule(e.target.value)}
              className="flex-1 border rounded-lg px-4 py-2 focus:ring-2 focus:ring-teal-500"
            >
              <option value="">-- 选择已有规则 --</option>
              <option value="1">标准出库单模板</option>
              <option value="2">矩阵转置模板</option>
            </select>
            <a
              href="/rules"
              className="px-4 py-2 bg-teal-600 text-white rounded-lg hover:bg-teal-700 inline-block text-center"
            >
              新建规则
            </a>
            <button
              onClick={handleUpload}
              disabled={!file || parsing}
              className="px-6 py-2 bg-teal-600 text-white rounded-lg hover:bg-teal-700 disabled:opacity-50"
            >
              {parsing ? '解析中...' : 'AI 解析'}
            </button>
          </div>

          {parsing && (
            <div className="mt-4">
              <div className="w-full bg-gray-200 rounded-full h-2">
                <div 
                  className="bg-teal-600 h-2 rounded-full transition-all duration-300"
                  style={{ width: `${progress}%` }}
                />
              </div>
              <div className="text-sm text-gray-600 mt-2 text-center">
                正在解析文件... {progress}%
              </div>
            </div>
          )}
        </div>

        {/* 数据预览 */}
        {data.length > 0 && (
          <div className="bg-white rounded-xl shadow-lg p-6">
            <h2 className="text-xl font-semibold mb-4">3. 预览与编辑</h2>
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
                  {data.map((row: any, index) => (
                    <tr key={index} className="hover:bg-gray-50">
                      <td className="border p-2">{row.externalCode}</td>
                      <td className="border p-2">{row.storeName}</td>
                      <td className="border p-2">{row.skuCode}</td>
                      <td className="border p-2">{row.skuName}</td>
                      <td className="border p-2">{row.quantity}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <div className="flex gap-3 mt-4">
              <button className="px-6 py-2 bg-teal-600 text-white rounded-lg hover:bg-teal-700">
                提交下单
              </button>
              <button className="px-6 py-2 bg-green-600 text-white rounded-lg hover:bg-green-700">
                导出 Excel
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
