'use client'

import { useState, useEffect } from 'react'
import Link from 'next/link'

export default function RulesPage() {
  const [rules, setRules] = useState<any[]>([])
  const [loading, setLoading] = useState(true)
  const [showForm, setShowForm] = useState(false)
  const [editingId, setEditingId] = useState<number | null>(null)
  const [formData, setFormData] = useState({
    fileName: '',
    skuCodeColumn: '',
    skuNameColumn: '',
    quantityColumn: '',
    externalCodeColumn: '',
    storeNameColumn: '',
    recipientNameColumn: '',
    recipientPhoneColumn: '',
    recipientAddressColumn: '',
    specificationColumn: '',
    remarksColumn: '',
  })

  useEffect(() => {
    const saved = localStorage.getItem('parsing_rules')
    if (saved) {
      setRules(JSON.parse(saved))
    }
    setLoading(false)
  }, [])

  const handleSave = () => {
    if (!formData.fileName || !formData.skuCodeColumn) {
      alert('请填写文件名称和 SKU 编码列名')
      return
    }

    const newRule = {
      id: editingId || Date.now(),
      ...formData,
      updatedAt: new Date().toISOString(),
    }

    let updatedRules
    if (editingId) {
      updatedRules = rules.map(r => r.id === editingId ? newRule : r)
    } else {
      updatedRules = [...rules, newRule]
    }

    setRules(updatedRules)
    localStorage.setItem('parsing_rules', JSON.stringify(updatedRules))
    alert('保存成功！')
    setShowForm(false)
    setEditingId(null)
    setFormData({
      fileName: '',
      skuCodeColumn: '',
      skuNameColumn: '',
      quantityColumn: '',
      externalCodeColumn: '',
      storeNameColumn: '',
      recipientNameColumn: '',
      recipientPhoneColumn: '',
      recipientAddressColumn: '',
      specificationColumn: '',
      remarksColumn: '',
    })
  }

  const handleEdit = (rule: any) => {
    setFormData(rule)
    setEditingId(rule.id)
    setShowForm(true)
  }

  const handleDelete = (id: number) => {
    if (confirm('确定要删除这条规则吗？')) {
      const updated = rules.filter(r => r.id !== id)
      setRules(updated)
      localStorage.setItem('parsing_rules', JSON.stringify(updated))
    }
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-blue-50 to-teal-50 p-8">
      <div className="max-w-6xl mx-auto">
        <header className="mb-8">
          <Link href="/" className="text-teal-600 hover:underline mb-4 inline-block">← 返回首页</Link>
          <h1 className="text-3xl font-bold text-teal-600 mb-2">解析规则管理</h1>
          <p className="text-gray-600">配置不同 Excel 文件的列映射规则（数据存储在浏览器本地）</p>
        </header>

        <div className="bg-white rounded-xl shadow-lg p-6 mb-6">
          <div className="flex justify-between items-center mb-4">
            <h2 className="text-xl font-semibold">已配置的规则 ({rules.length})</h2>
            <button
              onClick={() => { setShowForm(true); setEditingId(null) }}
              className="bg-teal-600 text-white px-4 py-2 rounded-lg hover:bg-teal-700"
            >
              + 新增规则
            </button>
          </div>

          {loading ? (
            <p className="text-center text-gray-500">加载中...</p>
          ) : rules.length === 0 ? (
            <p className="text-center text-gray-500 py-8">暂无规则，点击上方按钮添加</p>
          ) : (
            <div className="space-y-3">
              {rules.map(rule => (
                <div key={rule.id} className="border rounded-lg p-4 hover:shadow-md transition-shadow">
                  <div className="flex justify-between items-start">
                    <div>
                      <h3 className="font-semibold text-lg">{rule.fileName}</h3>
                      <p className="text-sm text-gray-600 mt-1">
                        SKU 编码：{rule.skuCodeColumn} | 数量：{rule.quantityColumn || '-'}
                      </p>
                      <p className="text-xs text-gray-400 mt-1">
                        更新于：{new Date(rule.updatedAt).toLocaleString()}
                      </p>
                    </div>
                    <div className="space-x-2">
                      <button onClick={() => handleEdit(rule)} className="text-blue-600 hover:underline text-sm">编辑</button>
                      <button onClick={() => handleDelete(rule.id)} className="text-red-600 hover:underline text-sm">删除</button>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        {showForm && (
          <div className="bg-white rounded-xl shadow-lg p-6">
            <h2 className="text-xl font-semibold mb-4">{editingId ? '编辑规则' : '新建规则'}</h2>
            
            <div className="space-y-4">
              <div>
                <label className="block text-sm font-medium mb-1">文件名称（支持通配符）</label>
                <input
                  type="text"
                  value={formData.fileName}
                  onChange={e => setFormData({...formData, fileName: e.target.value})}
                  className="w-full border rounded-lg px-3 py-2"
                  placeholder="例如：data.xlsx, 入库*.xls"
                />
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium mb-1">SKU 编码列名 *</label>
                  <input
                    type="text"
                    value={formData.skuCodeColumn}
                    onChange={e => setFormData({...formData, skuCodeColumn: e.target.value})}
                    className="w-full border rounded-lg px-3 py-2"
                    placeholder="例如：SKU 物品编码"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium mb-1">SKU 名称列名 *</label>
                  <input
                    type="text"
                    value={formData.skuNameColumn}
                    onChange={e => setFormData({...formData, skuNameColumn: e.target.value})}
                    className="w-full border rounded-lg px-3 py-2"
                    placeholder="例如：SKU 物品名称"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium mb-1">数量列名</label>
                  <input
                    type="text"
                    value={formData.quantityColumn}
                    onChange={e => setFormData({...formData, quantityColumn: e.target.value})}
                    className="w-full border rounded-lg px-3 py-2"
                    placeholder="例如：SKU 发货数量"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium mb-1">外部编码列名</label>
                  <input
                    type="text"
                    value={formData.externalCodeColumn}
                    onChange={e => setFormData({...formData, externalCodeColumn: e.target.value})}
                    className="w-full border rounded-lg px-3 py-2"
                    placeholder="例如：外部编码"
                  />
                </div>
              </div>

              <div className="flex space-x-4 pt-4">
                <button
                  onClick={handleSave}
                  className="bg-teal-600 text-white px-6 py-2 rounded-lg hover:bg-teal-700"
                >
                  保存
                </button>
                <button
                  onClick={() => setShowForm(false)}
                  className="bg-gray-300 text-gray-700 px-6 py-2 rounded-lg hover:bg-gray-400"
                >
                  取消
                </button>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
