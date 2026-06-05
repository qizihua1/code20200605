'use client'

import { useState, useEffect } from 'react'
import Link from 'next/link'
import { Toaster, toast } from 'sonner'

interface Rule {
  id: string
  name: string
  description?: string
  fileFormat: string
  fileNamePattern?: string
  structure: any
  fieldMappings: any[]
  createdAt: string
  updatedAt: string
  _count?: { shipments: number }
}

export default function RulesPage() {
  const [rules, setRules] = useState<Rule[]>([])
  const [loading, setLoading] = useState(true)
  const [showForm, setShowForm] = useState(false)
  const [editingRule, setEditingRule] = useState<Rule | null>(null)
  const [aiAnalysis, setAiAnalysis] = useState<any>(null)
  const [analyzing, setAnalyzing] = useState(false)
  const [testFile, setTestFile] = useState<File | null>(null)

  const [formData, setFormData] = useState({
    name: '',
    description: '',
    fileFormat: 'excel',
    fileNamePattern: '',
  })

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
    } finally {
      setLoading(false)
    }
  }

  // AI 分析文件
  const handleAIAnalyze = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file) return

    setAnalyzing(true)
    toast.info('AI 正在分析文件结构...')

    try {
      const formData = new FormData()
      formData.append('file', file)
      setTestFile(file)

      const res = await fetch('/api/parse', {
        method: 'POST',
        body: formData,
      })

      const result = await res.json()
      
      if (result.error) {
        toast.error(result.error)
        return
      }

      setAiAnalysis(result)
      toast.success(`分析完成！推荐 ${result.recommendedRules?.length || 0} 条规则`)
    } catch (error) {
      toast.error('分析失败')
    } finally {
      setAnalyzing(false)
    }
  }

  // 使用 AI 生成的规则创建
  const handleUseRecommended = (recommendedRule: any) => {
    setFormData({
      name: recommendedRule.name,
      description: recommendedRule.description || '',
      fileFormat: 'excel',
      fileNamePattern: testFile?.name || '',
    })

    // TODO: 这里应该设置 structure 和 fieldMappings
    // 为了 demo，我们先保存基本信息
    toast.info('规则已填充，请完善字段映射配置')
    setShowForm(true)
  }

  // 保存规则
  const handleSave = async () => {
    try {
      const res = await fetch('/api/rules', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          ...formData,
          structure: {
            headerSkip: 0,
            dataStartRow: 1,
            sheetStrategy: 'first',
            extractionType: 'table',
          },
          fieldMappings: [
            { field: 'skuCode', sourceType: 'column', source: 'SKU 编码', required: true },
            { field: 'skuName', sourceType: 'column', source: 'SKU 名称', required: true },
            { field: 'quantity', sourceType: 'column', source: '数量', required: true },
          ],
        }),
      })

      const result = await res.json()
      
      if (result.rule) {
        toast.success('规则保存成功！')
        loadRules()
        setShowForm(false)
        setAiAnalysis(null)
        setTestFile(null)
        setFormData({ name: '', description: '', fileFormat: 'excel', fileNamePattern: '' })
      } else {
        toast.error('保存失败')
      }
    } catch (error) {
      toast.error('保存失败')
    }
  }

  // 删除规则
  const handleDelete = async (id: string) => {
    if (!confirm('确定删除此规则吗？')) return

    try {
      await fetch(`/api/rules?id=${id}`, { method: 'DELETE' })
      toast.success('规则已删除')
      loadRules()
    } catch (error) {
      toast.error('删除失败')
    }
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-cyan-50 to-teal-50">
      <Toaster position="top-center" richColors />
      
      <div className="max-w-7xl mx-auto px-6 py-8">
        {/* Header */}
        <header className="mb-8">
          <div className="flex items-center justify-between">
            <div>
              <Link href="/" className="text-teal-600 hover:underline text-sm">← 返回首页</Link>
              <h1 className="text-3xl font-bold text-teal-600 mt-2">解析规则管理</h1>
              <p className="text-gray-600 mt-1">配置 Excel/Word/PDF 文件的解析规则，支持 AI 自动生成</p>
            </div>
            <button
              onClick={() => { setShowForm(true); setEditingRule(null); setAiAnalysis(null) }}
              className="bg-teal-600 text-white px-6 py-3 rounded-lg hover:bg-teal-700 transition-colors font-semibold shadow-lg"
            >
              + 新建规则
            </button>
          </div>
        </header>

        {/* AI 分析区域 */}
        <div className="bg-white rounded-xl shadow-lg p-6 mb-6 border border-cyan-100">
          <h2 className="text-xl font-semibold text-gray-800 mb-4">
            🤖 AI 智能生成规则
          </h2>
          <p className="text-gray-600 mb-4">
            上传一个样例文件，AI 会自动分析文件结构并生成推荐规则。您可以在 AI 建议的基础上微调并保存。
          </p>
          
          <div className="flex items-center space-x-4">
            <input
              type="file"
              accept=".xlsx,.xls,.docx,.pdf"
              onChange={handleAIAnalyze}
              className="block w-full text-sm text-gray-500
                file:mr-4 file:py-2 file:px-4
                file:rounded-lg file:border-0
                file:text-sm file:font-semibold
                file:bg-teal-50 file:text-teal-700
                hover:file:bg-teal-100"
              disabled={analyzing}
            />
            
            {analyzing && (
              <div className="flex items-center text-teal-600">
                <svg className="animate-spin h-5 w-5 mr-2" viewBox="0 0 24 24">
                  <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" fill="none" />
                  <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
                </svg>
                AI 分析中...
              </div>
            )}
          </div>

          {/* AI 分析结果 */}
          {aiAnalysis && (
            <div className="mt-6 border-t pt-6">
              <h3 className="font-semibold text-gray-800 mb-3">
                📋 文件分析结果 - {aiAnalysis.fileName}
              </h3>
              
              <div className="grid md:grid-cols-2 gap-4 mb-4">
                <div className="bg-gray-50 rounded-lg p-4">
                  <div className="text-sm text-gray-600">Sheet 数量</div>
                  <div className="text-xl font-bold text-teal-600">
                    {aiAnalysis.analysis?.sheetCount || 1}
                  </div>
                </div>
                <div className="bg-gray-50 rounded-lg p-4">
                  <div className="text-sm text-gray-600">行数</div>
                  <div className="text-xl font-bold text-teal-600">
                    {aiAnalysis.analysis?.rowCount || 0}
                  </div>
                </div>
                <div className="bg-gray-50 rounded-lg p-4">
                  <div className="text-sm text-gray-600">列数</div>
                  <div className="text-xl font-bold text-teal-600">
                    {aiAnalysis.analysis?.columnCount || 0}
                  </div>
                </div>
                <div className="bg-gray-50 rounded-lg p-4">
                  <div className="text-sm text-gray-600">检测特征</div>
                  <div className="text-sm font-medium text-gray-800">
                    {aiAnalysis.analysis?.hasCardMarker ? '卡片式布局' : '标准表格'}
                  </div>
                </div>
              </div>

              {aiAnalysis.recommendedRules && aiAnalysis.recommendedRules.length > 0 && (
                <div>
                  <h4 className="font-semibold text-gray-800 mb-3">AI 推荐规则：</h4>
                  <div className="space-y-3">
                    {aiAnalysis.recommendedRules.map((rule: any, idx: number) => (
                      <div
                        key={idx}
                        className="bg-gradient-to-r from-teal-50 to-cyan-50 rounded-lg p-4 border border-teal-200"
                      >
                        <div className="flex items-start justify-between">
                          <div className="flex-1">
                            <div className="flex items-center mb-2">
                              <span className="text-lg mr-2">
                                {idx === 0 ? '🎯' : '💡'}
                              </span>
                              <span className="font-semibold text-gray-800">
                                {rule.name}
                              </span>
                              {idx === 0 && (
                                <span className="ml-2 px-2 py-1 bg-teal-600 text-white text-xs rounded">
                                  推荐
                                </span>
                              )}
                            </div>
                            <p className="text-gray-600 text-sm mb-3">
                              {rule.description}
                            </p>
                            <div className="flex items-center text-sm">
                              <span className="text-gray-500 mr-2">置信度:</span>
                              <div className="w-32 bg-gray-200 rounded-full h-2">
                                <div
                                  className="bg-teal-600 h-2 rounded-full"
                                  style={{ width: `${(rule.confidence || 0) * 100}%` }}
                                />
                              </div>
                              <span className="ml-2 text-teal-600 font-medium">
                                {Math.round((rule.confidence || 0) * 100)}%
                              </span>
                            </div>
                          </div>
                          <button
                            onClick={() => handleUseRecommended(rule)}
                            className="ml-4 px-4 py-2 bg-teal-600 text-white rounded-lg hover:bg-teal-700 transition-colors"
                          >
                            使用此规则
                          </button>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>
          )}
        </div>

        {/* 规则列表 */}
        <div className="bg-white rounded-xl shadow-lg p-6 border border-cyan-100">
          <h2 className="text-xl font-semibold text-gray-800 mb-4">
            已配置的规则 ({rules.length})
          </h2>

          {loading ? (
            <div className="text-center py-12 text-gray-500">加载中...</div>
          ) : rules.length === 0 ? (
            <div className="text-center py-12 text-gray-500">
              暂无规则，点击上方"新建规则"按钮或上传文件让 AI 自动生成
            </div>
          ) : (
            <div className="space-y-3">
              {rules.map(rule => (
                <div
                  key={rule.id}
                  className="border rounded-lg p-4 hover:shadow-md transition-shadow flex items-center justify-between"
                >
                  <div className="flex-1">
                    <div className="flex items-center mb-1">
                      <h3 className="font-semibold text-lg text-gray-800">
                        {rule.name}
                      </h3>
                      <span className="ml-2 px-2 py-1 bg-teal-100 text-teal-700 text-xs rounded">
                        {rule.fileFormat.toUpperCase()}
                      </span>
                    </div>
                    <p className="text-sm text-gray-600">
                      {rule.description || '暂无描述'}
                    </p>
                    <p className="text-xs text-gray-400 mt-1">
                      更新于：{new Date(rule.updatedAt).toLocaleString()}
                      {rule._count?.shipments !== undefined && (
                        <span className="ml-2">
                          · 已用于 {rule._count.shipments} 个运单
                        </span>
                      )}
                    </p>
                  </div>
                  <div className="space-x-2">
                    <button
                      onClick={() => {
                        setEditingRule(rule)
                        setShowForm(true)
                      }}
                      className="px-3 py-1 text-blue-600 hover:bg-blue-50 rounded transition-colors"
                    >
                      编辑
                    </button>
                    <button
                      onClick={() => handleDelete(rule.id)}
                      className="px-3 py-1 text-red-600 hover:bg-red-50 rounded transition-colors"
                    >
                      删除
                    </button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* 新建/编辑表单 */}
        {showForm && (
          <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center p-4 z-50">
            <div className="bg-white rounded-xl shadow-2xl max-w-2xl w-full max-h-[90vh] overflow-auto">
              <div className="p-6">
                <h2 className="text-2xl font-bold text-gray-800 mb-6">
                  {editingRule ? '编辑规则' : '新建规则'}
                </h2>

                <div className="space-y-4">
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">
                      规则名称 *
                    </label>
                    <input
                      type="text"
                      value={formData.name}
                      onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                      className="w-full border rounded-lg px-3 py-2 focus:ring-2 focus:ring-teal-500 focus:border-transparent"
                      placeholder="例如：黎明屯配送单规则"
                    />
                  </div>

                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">
                      描述
                    </label>
                    <textarea
                      value={formData.description}
                      onChange={(e) => setFormData({ ...formData, description: e.target.value })}
                      className="w-full border rounded-lg px-3 py-2 focus:ring-2 focus:ring-teal-500 focus:border-transparent"
                      rows={3}
                      placeholder="规则描述，例如：适用于黎明屯配送中心的发货单格式"
                    />
                  </div>

                  <div className="grid grid-cols-2 gap-4">
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-1">
                        文件格式 *
                      </label>
                      <select
                        value={formData.fileFormat}
                        onChange={(e) => setFormData({ ...formData, fileFormat: e.target.value })}
                        className="w-full border rounded-lg px-3 py-2 focus:ring-2 focus:ring-teal-500"
                      >
                        <option value="excel">Excel (.xlsx/.xls)</option>
                        <option value="word">Word (.docx)</option>
                        <option value="pdf">PDF (.pdf)</option>
                      </select>
                    </div>

                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-1">
                        文件名匹配模式
                      </label>
                      <input
                        type="text"
                        value={formData.fileNamePattern}
                        onChange={(e) => setFormData({ ...formData, fileNamePattern: e.target.value })}
                        className="w-full border rounded-lg px-3 py-2 focus:ring-2 focus:ring-teal-500"
                        placeholder="例如：*配送单*、黎明屯*"
                      />
                    </div>
                  </div>

                  {/* TODO: 字段映射配置 UI */}
                  <div className="bg-yellow-50 border border-yellow-200 rounded-lg p-4">
                    <p className="text-sm text-yellow-800">
                      ⚠️ 字段映射配置功能开发中... 目前使用默认映射
                    </p>
                  </div>

                  <div className="flex justify-end space-x-4 pt-4">
                    <button
                      onClick={() => {
                        setShowForm(false)
                        setEditingRule(null)
                        setAiAnalysis(null)
                      }}
                      className="px-6 py-2 border border-gray-300 rounded-lg hover:bg-gray-50 transition-colors"
                    >
                      取消
                    </button>
                    <button
                      onClick={handleSave}
                      className="px-6 py-2 bg-teal-600 text-white rounded-lg hover:bg-teal-700 transition-colors"
                    >
                      保存规则
                    </button>
                  </div>
                </div>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
