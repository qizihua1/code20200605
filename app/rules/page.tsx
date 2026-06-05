'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'

export default function RulesPage() {
  const router = useRouter()
  const [rules, setRules] = useState([])
  const [loading, setLoading] = useState(false)
  const [showForm, setShowForm] = useState(false)

  const fetchRules = async () => {
    setLoading(true)
    try {
      const res = await fetch('/api/rules')
      const data = await res.json()
      setRules(data)
    } catch (error) {
      console.error('Failed to fetch rules:', error)
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-blue-50 to-teal-50 p-8">
      <div className="max-w-6xl mx-auto">
        <header className="mb-8">
          <a href="/" className="text-teal-600 hover:underline mb-4 inline-block">← 返回首页</a>
          <h1 className="text-3xl font-bold text-teal-600 mb-2">解析规则管理</h1>
          <p className="text-gray-600">管理文件解析规则，支持 AI 辅助生成</p>
        </header>

        <div className="bg-white rounded-xl shadow-lg p-6 mb-6">
          <div className="flex justify-between items-center mb-4">
            <h2 className="text-xl font-semibold">规则列表</h2>
            <button
              onClick={() => setShowForm(!showForm)}
              className="px-4 py-2 bg-teal-600 text-white rounded-lg hover:bg-teal-700"
            >
              + 新建规则
            </button>
          </div>

          {loading ? (
            <div className="text-center py-8 text-gray-500">加载中...</div>
          ) : rules.length === 0 ? (
            <div className="text-center py-8 text-gray-500">
              暂无规则，点击上方按钮创建或上传文件让 AI 生成
            </div>
          ) : (
            <div className="space-y-3">
              {rules.map((rule: any) => (
                <div key={rule.id} className="border rounded-lg p-4 hover:shadow-md transition-shadow">
                  <div className="flex justify-between items-start">
                    <div>
                      <h3 className="font-semibold text-lg">{rule.name}</h3>
                      <p className="text-gray-600 text-sm mt-1">{rule.description || '无描述'}</p>
                      <div className="mt-2">
                        <span className="inline-block px-2 py-1 bg-teal-100 text-teal-800 text-xs rounded">
                          {rule.format}
                        </span>
                      </div>
                    </div>
                    <div className="flex gap-2">
                      <button className="text-teal-600 hover:underline text-sm">编辑</button>
                      <button className="text-red-600 hover:underline text-sm">删除</button>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        {showForm && (
          <div className="bg-white rounded-xl shadow-lg p-6">
            <h2 className="text-xl font-semibold mb-4">创建规则</h2>
            <form className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">规则名称</label>
                <input
                  type="text"
                  className="w-full border rounded-lg px-3 py-2 focus:ring-2 focus:ring-teal-500 focus:border-transparent"
                  placeholder="如：标准出库单模板"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">文件格式</label>
                <select className="w-full border rounded-lg px-3 py-2 focus:ring-2 focus:ring-teal-500">
                  <option value="excel">Excel (.xlsx/.xls)</option>
                  <option value="word">Word (.docx)</option>
                  <option value="pdf">PDF (.pdf)</option>
                </select>
              </div>
              <div className="flex gap-3">
                <button
                  type="button"
                  className="flex-1 px-4 py-2 bg-teal-600 text-white rounded-lg hover:bg-teal-700"
                >
                  保存规则
                </button>
                <button
                  type="button"
                  onClick={() => setShowForm(false)}
                  className="flex-1 px-4 py-2 bg-gray-200 text-gray-800 rounded-lg hover:bg-gray-300"
                >
                  取消
                </button>
              </div>
            </form>
          </div>
        )}

        <div className="mt-6 bg-white rounded-xl shadow-lg p-6">
          <h2 className="text-xl font-semibold mb-4">💡 使用说明</h2>
          <ul className="space-y-2 text-gray-600">
            <li className="flex items-start">
              <span className="text-teal-500 mr-2">1.</span>
              上传文件后点击"AI 分析"自动生成解析规则
            </li>
            <li className="flex items-start">
              <span className="text-teal-500 mr-2">2.</span>
              手动创建规则适用于标准格式文件
            </li>
            <li className="flex items-start">
              <span className="text-teal-500 mr-2">3.</span>
              规则可复用，一次创建多次使用
            </li>
            <li className="flex items-start">
              <span className="text-teal-500 mr-2">4.</span>
              支持 9 种复杂格式：跨行聚合、矩阵转置、多 Sheet、卡片式等
            </li>
          </ul>
        </div>
      </div>
    </div>
  )
}
