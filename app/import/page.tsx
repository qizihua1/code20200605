'use client'

import { useState, useEffect } from 'react'
import Link from 'next/link'
import { Toaster, toast } from 'sonner'

interface Rule {
  id: string
  name: string
  description?: string
  fileFormat: string
}

export default function ImportPage() {
  const [file, setFile] = useState<File | null>(null)
  const [rules, setRules] = useState<Rule[]>([])
  const [selectedRule, setSelectedRule] = useState<string>('')
  const [loading, setLoading] = useState(false)
  const [parsing, setParsing] = useState(false)
  const [parsedData, setParsedData] = useState<any[]>([])
  const [showPreview, setShowPreview] = useState(false)

  // 加载规则列表
  useEffect(() => {
    loadRules()
  }, [])

  const loadRules = async () => {
    try {
      const res = await fetch('/api/rules')
      const data = await res.json()
      setRules(data.rules || [])
    } catch (error) {
      toast.error('加载规则失败')
    }
  }

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const selected = e.target.files?.[0]
    if (selected) {
      setFile(selected)
      toast.success(`已选择：${selected.name}`)
    }
  }

  const handleUpload = async () => {
    if (!file) {
      toast.error('请先选择文件')
      return
    }

    if (!selectedRule) {
      toast.error('请选择或创建一个解析规则')
      return
    }

    setParsing(true)
    toast.info('正在解析文件...')

    try {
      const formData = new FormData()
      formData.append('file', file)
      formData.append('ruleId', selectedRule)

      const res = await fetch('/api/parse', {
        method: 'POST',
        body: formData,
      })

      const result = await res.json()

      if (result.error) {
        toast.error(result.error)
        return
      }

      setParsedData(result.data || [])
      setShowPreview(true)
      toast.success(`解析成功！共 ${result.data?.length || 0} 条数据`)
    } catch (error) {
      toast.error('解析失败')
    } finally {
      setParsing(false)
    }
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-cyan-50 to-teal-50">
      <Toaster position="top-center" richColors />
      
      <div className="max-w-7xl mx-auto px-6 py-8">
        <header className="mb-8">
          <Link href="/" className="text-teal-600 hover:underline text-sm">← 返回首页</Link>
          <h1 className="text-3xl font-bold text-teal-600 mt-2">文件导入</h1>
          <p className="text-gray-600 mt-1">上传 Excel/Word/PDF 文件，使用已配置的规则进行智能解析</p>
        </header>

        {/* 上传区域 */}
        <div className="bg-white rounded-xl shadow-lg p-8 mb-6 border border-cyan-100">
          <h2 className="text-xl font-semibold text-gray-800 mb-6">1. 上传文件</h2>
          
          <div className="border-2 border-dashed border-teal-300 rounded-xl p-12 text-center hover:border-teal-500 transition-colors bg-teal-50">
            <input
              type="file"
              accept=".xlsx,.xls,.docx,.pdf"
              onChange={handleFileChange}
              className="hidden"
              id="file-upload"
            />
            <label htmlFor="file-upload" className="cursor-pointer">
              <svg className="mx-auto h-12 w-12 text-teal-400" stroke="currentColor" fill="none" viewBox="0 0 48 48">
                <path d="M28 8H12a4 4 0 00-4 4v20m32-12v8m0 0v8a4 4 0 01-4 4H12a4 4 0 01-4-4v-4m32-4l-3.172-3.172a4 4 0 00-5.656 0L28 28M8 32l9.172-9.172a4 4 0 015.656 0L28 28m0 0l4 4m4-24h8m-4-4v8m-12 4h.02" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
              </svg>
              <p className="mt-4 text-lg text-gray-600">
                {file ? file.name : '点击或拖拽文件到此处'}
              </p>
              <p className="mt-2 text-sm text-gray-500">
                支持 Excel(.xlsx/.xls)、Word(.docx)、PDF(.pdf)
              </p>
            </label>
          </div>

          {file && (
            <div className="mt-6 bg-gradient-to-r from-teal-50 to-cyan-50 rounded-lg p-4 border border-teal-200">
              <div className="flex items-center justify-between">
                <div>
                  <p className="font-semibold text-gray-800">📄 {file.name}</p>
                  <p className="text-sm text-gray-600">
                    大小：{(file.size / 1024).toFixed(2)} KB
                  </p>
                </div>
                <button
                  onClick={() => setFile(null)}
                  className="text-red-600 hover:text-red-700 text-sm"
                >
                  移除
                </button>
              </div>
            </div>
          )}
        </div>

        {/* 规则选择 */}
        <div className="bg-white rounded-xl shadow-lg p-6 mb-6 border border-cyan-100">
          <h2 className="text-xl font-semibold text-gray-800 mb-4">2. 选择解析规则</h2>
          
          {rules.length === 0 ? (
            <div className="bg-yellow-50 border border-yellow-200 rounded-lg p-6">
              <p className="text-yellow-800 mb-4">
                ⚠️ 还没有可用的解析规则
              </p>
              <Link
                href="/rules"
                className="inline-block bg-teal-600 text-white px-6 py-2 rounded-lg hover:bg-teal-700 transition-colors"
              >
                前往创建规则
              </Link>
            </div>
          ) : (
            <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-4">
              {rules.map(rule => (
                <div
                  key={rule.id}
                  onClick={() => setSelectedRule(rule.id)}
                  className={`
                    border rounded-lg p-4 cursor-pointer transition-all
                    ${selectedRule === rule.id 
                      ? 'border-teal-500 bg-teal-50 ring-2 ring-teal-200' 
                      : 'border-gray-200 hover:border-teal-300'
                    }
                  `}
                >
                  <div className="flex items-center mb-2">
                    <div className={`w-4 h-4 rounded-full border-2 mr-2
                      ${selectedRule === rule.id ? 'border-teal-600 bg-teal-600' : 'border-gray-300'}
                    `} />
                    <span className="font-semibold text-gray-800">{rule.name}</span>
                  </div>
                  <p className="text-sm text-gray-600 truncate">
                    {rule.description || '暂无描述'}
                  </p>
                  <div className="mt-2 flex items-center text-xs text-gray-500">
                    <span className="px-2 py-1 bg-gray-100 rounded">
                      {rule.fileFormat.toUpperCase()}
                    </span>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* 解析按钮 */}
        <div className="bg-white rounded-xl shadow-lg p-6 mb-6 border border-cyan-100">
          <button
            onClick={handleUpload}
            disabled={!file || !selectedRule || parsing}
            className={`
              w-full py-4 rounded-lg text-white font-semibold text-lg transition-all
              ${!file || !selectedRule || parsing
                ? 'bg-gray-400 cursor-not-allowed' 
                : 'bg-teal-600 hover:bg-teal-700 hover:shadow-lg transform hover:-translate-y-0.5'
              }
            `}
          >
            {parsing ? (
              <span className="flex items-center justify-center">
                <svg className="animate-spin -ml-1 mr-3 h-5 w-5 text-white" fill="none" viewBox="0 0 24 24">
                  <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" fill="none" />
                  <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
                </svg>
                解析中...
              </span>
            ) : (
              '开始解析并预览'
            )}
          </button>
        </div>

        {/* 数据预览 */}
        {showPreview && parsedData.length > 0 && (
          <div className="bg-white rounded-xl shadow-lg p-6 border border-cyan-100">
            <h2 className="text-xl font-semibold text-gray-800 mb-4">
              3. 数据预览
            </h2>
            
            <div className="overflow-x-auto">
              <table className="w-full border">
                <thead className="bg-teal-50">
                  <tr>
                    <th className="border p-3 text-left font-semibold text-gray-700">外部编码</th>
                    <th className="border p-3 text-left font-semibold text-gray-700">收货门店</th>
                    <th className="border p-3 text-left font-semibold text-gray-700">SKU 编码</th>
                    <th className="border p-3 text-left font-semibold text-gray-700">SKU 名称</th>
                    <th className="border p-3 text-left font-semibold text-gray-700">数量</th>
                    <th className="border p-3 text-left font-semibold text-gray-700">规格</th>
                  </tr>
                </thead>
                <tbody>
                  {parsedData.slice(0, 100).map((row, idx) => (
                    <tr key={idx} className="hover:bg-gray-50">
                      <td className="border p-3">{row.externalCode || '-'}</td>
                      <td className="border p-3">{row.storeName || '-'}</td>
                      <td className="border p-3">{row.skuCode || '-'}</td>
                      <td className="border p-3">{row.skuName || '-'}</td>
                      <td className="border p-3">{row.quantity || '-'}</td>
                      <td className="border p-3">{row.specification || '-'}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
              
              {parsedData.length > 100 && (
                <p className="text-center text-gray-500 mt-4">
                  仅显示前 100 条，共 {parsedData.length} 条数据
                </p>
              )}
            </div>

            <div className="mt-6 flex justify-end space-x-4">
              <button
                onClick={() => setShowPreview(false)}
                className="px-6 py-2 border border-gray-300 rounded-lg hover:bg-gray-50"
              >
                关闭
              </button>
              <button
                className="px-6 py-2 bg-teal-600 text-white rounded-lg hover:bg-teal-700"
              >
                提交下单
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
