'use client'

import { useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'

export default function ShipmentsPage() {
  const router = useRouter()
  const [shipments, setShipments] = useState([])
  const [loading, setLoading] = useState(true)
  const [keyword, setKeyword] = useState('')
  const [page, setPage] = useState(1)
  const [total, setTotal] = useState(0)
  const [deleting, setDeleting] = useState<string | null>(null)

  useEffect(() => {
    fetchShipments()
  }, [page, keyword])

  const fetchShipments = async () => {
    setLoading(true)
    try {
      const params = new URLSearchParams({ page: String(page), pageSize: '10' })
      if (keyword) params.set('keyword', keyword)
      
      const res = await fetch(`/api/shipments?${params}`)
      const data = await res.json()
      setShipments(data.data || [])
      setTotal(data.total || 0)
    } catch (error) {
      console.error('Failed to fetch shipments:', error)
    } finally {
      setLoading(false)
    }
  }

  const handleDelete = async (id: string) => {
    if (!confirm('确定要删除这个运单吗？')) return
    
    setDeleting(id)
    try {
      const res = await fetch('/api/delete', {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id })
      })
      
      if (res.ok) {
        fetchShipments()
      } else {
        alert('删除失败')
      }
    } catch (error) {
      console.error('Delete error:', error)
      alert('删除失败')
    } finally {
      setDeleting(null)
    }
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-blue-50 to-teal-50 p-8">
      <div className="max-w-6xl mx-auto">
        <header className="mb-8">
          <a href="/" className="text-teal-600 hover:underline mb-4 inline-block">← 返回首页</a>
          <h1 className="text-3xl font-bold text-teal-600 mb-2">已导入运单</h1>
          <p className="text-gray-600">查看和管理历史运单记录</p>
        </header>

        {/* 搜索栏 */}
        <div className="bg-white rounded-xl shadow-lg p-4 mb-6">
          <div className="flex gap-3">
            <input
              type="text"
              value={keyword}
              onChange={(e) => setKeyword(e.target.value)}
              placeholder="搜索外部编码、收件人姓名..."
              className="flex-1 border rounded-lg px-4 py-2 focus:ring-2 focus:ring-teal-500 focus:border-transparent"
            />
            <button
              onClick={() => { setPage(1); fetchShipments() }}
              className="px-6 py-2 bg-teal-600 text-white rounded-lg hover:bg-teal-700"
            >
              搜索
            </button>
          </div>
        </div>

        {/* 运单列表 */}
        <div className="bg-white rounded-xl shadow-lg p-6">
          <h2 className="text-xl font-semibold mb-4">运单列表 (共 {total} 条)</h2>
          
          {loading ? (
            <div className="text-center py-8 text-gray-500">加载中...</div>
          ) : shipments.length === 0 ? (
            <div className="text-center py-8 text-gray-500">
              暂无运单记录
              <div className="mt-2">
                <a href="/preview" className="text-teal-600 hover:underline">
                  导入第一批运单
                </a>
              </div>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full">
                <thead>
                  <tr className="border-b">
                    <th className="text-left py-3 px-4 text-sm font-semibold text-gray-700">外部编码</th>
                    <th className="text-left py-3 px-4 text-sm font-semibold text-gray-700">收货信息</th>
                    <th className="text-left py-3 px-4 text-sm font-semibold text-gray-700">SKU 数量</th>
                    <th className="text-left py-3 px-4 text-sm font-semibold text-gray-700">状态</th>
                    <th className="text-left py-3 px-4 text-sm font-semibold text-gray-700">提交时间</th>
                    <th className="text-left py-3 px-4 text-sm font-semibold text-gray-700">操作</th>
                  </tr>
                </thead>
                <tbody>
                  {shipments.map((shipment: any) => (
                    <tr key={shipment.id} className="border-b hover:bg-gray-50">
                      <td className="py-3 px-4 text-sm">
                        {shipment.externalCode || '-'}
                      </td>
                      <td className="py-3 px-4 text-sm">
                        {shipment.storeName || shipment.recipientName || '-'}
                      </td>
                      <td className="py-3 px-4 text-sm">
                        {shipment.items?.length || 0} 个 SKU
                      </td>
                      <td className="py-3 px-4 text-sm">
                        <span className={`px-2 py-1 rounded text-xs ${
                          shipment.status === 'submitted' 
                            ? 'bg-green-100 text-green-800' 
                            : 'bg-yellow-100 text-yellow-800'
                        }`}>
                          {shipment.status === 'submitted' ? '已提交' : '待处理'}
                        </span>
                      </td>
                      <td className="py-3 px-4 text-sm text-gray-600">
                        {new Date(shipment.submittedAt || shipment.createdAt).toLocaleDateString('zh-CN')}
                      </td>
                      <td className="py-3 px-4 text-sm">
                        <button
                          onClick={() => handleDelete(shipment.id)}
                          disabled={deleting === shipment.id}
                          className="px-3 py-1 bg-red-500 text-white text-xs rounded hover:bg-red-600 disabled:opacity-50"
                        >
                          {deleting === shipment.id ? '删除中...' : '删除'}
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}

          {/* 分页 */}
          {shipments.length > 0 && (
            <div className="flex justify-center gap-2 mt-6">
              <button
                onClick={() => setPage(Math.max(1, page - 1))}
                disabled={page === 1}
                className="px-4 py-2 border rounded-lg disabled:opacity-50 disabled:cursor-not-allowed hover:bg-gray-50"
              >
                上一页
              </button>
              <span className="px-4 py-2 text-gray-600">
                第 {page} 页
              </span>
              <button
                onClick={() => setPage(page + 1)}
                disabled={page * 10 >= total}
                className="px-4 py-2 border rounded-lg disabled:opacity-50 disabled:cursor-not-allowed hover:bg-gray-50"
              >
                下一页
              </button>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
