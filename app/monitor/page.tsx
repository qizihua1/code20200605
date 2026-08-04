'use client'

import { useState, useEffect } from 'react'
import Link from 'next/link'

interface MonitorSummary {
  timestamp: string
  throughput: {
    rows_per_minute: number
    total_processed: number
    time_range: string
  }
  queue: {
    pending_events: number
    pending_batches: number
    pending_rows: number
    alert: boolean
  }
  performance: {
    avg_parse_ms: number
    avg_rule_ms: number
    avg_validate_ms: number
    avg_insert_ms: number
    avg_total_ms: number
  }
  errors: {
    distribution: Array<{ error_code: string; count: number }>
    total_last_hour: number
  }
  recent_tasks: Array<{
    id: string
    status: string
    total_rows: number
    processed_rows: number
    success_rows: number
    failed_rows: number
    created_at: string
  }>
}

const statusColors: Record<string, string> = {
  PENDING: 'bg-yellow-100 text-yellow-800',
  PROCESSING: 'bg-blue-100 text-blue-800',
  COMPLETED: 'bg-green-100 text-green-800',
  PARTIAL_SUCCESS: 'bg-orange-100 text-orange-800',
  FAILED: 'bg-red-100 text-red-800',
}

const errorCodeMap: Record<string, string> = {
  E001: 'SKU不存在',
  E002: '必填字段缺失',
  E003: '电话格式错误',
  E004: '数量非正数',
  E005: '外部编码重复',
  E006: '规则映射失败',
  E007: '数据库写入失败',
  E008: '文件格式不支持',
}

export default function MonitorPage() {
  const [data, setData] = useState<MonitorSummary | null>(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')

  useEffect(() => {
    fetchData()
    const interval = setInterval(fetchData, 5000)
    return () => clearInterval(interval)
  }, [])

  const fetchData = async () => {
    try {
      setLoading(true)
      const res = await fetch('/api/import-monitor/summary')
      const result = await res.json()
      
      if (res.ok) {
        setData(result)
      } else {
        setError(result.error || '获取监控数据失败')
      }
    } catch (err: any) {
      setError(err.message || '网络错误')
    } finally {
      setLoading(false)
    }
  }

  const maxErrorCount = data?.errors.distribution.length 
    ? Math.max(...data.errors.distribution.map(e => e.count)) 
    : 1

  return (
    <div className="min-h-screen p-6">
      <div className="max-w-7xl mx-auto">
        <div className="flex items-center justify-between mb-6">
          <h1 className="text-2xl font-bold text-gray-800">导入监控看板</h1>
          <div className="flex gap-2">
            <Link href="/import" className="text-teal-600 hover:underline">
              返回导入
            </Link>
            <button
              onClick={fetchData}
              disabled={loading}
              className="px-4 py-2 bg-teal-600 text-white rounded-lg hover:bg-teal-700 disabled:opacity-50"
            >
              {loading ? '刷新中...' : '刷新'}
            </button>
          </div>
        </div>

        {error && (
          <div className="bg-red-50 border border-red-200 rounded-lg p-4 mb-6">
            <p className="text-red-800">{error}</p>
          </div>
        )}

        {data && (
          <>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mb-6">
              <div className="bg-white rounded-xl shadow-lg p-6">
                <h2 className="text-lg font-semibold text-gray-800 mb-4">实时吞吐量</h2>
                <div className="text-4xl font-bold text-teal-600 mb-2">
                  {data.throughput.rows_per_minute.toFixed(0)}
                  <span className="text-lg text-gray-500 ml-1">行/秒</span>
                </div>
                <div className="text-sm text-gray-500">
                  总处理量: {data.throughput.total_processed.toLocaleString()} 行
                </div>
                <div className="text-xs text-gray-400 mt-2">
                  统计区间: {data.throughput.time_range}
                </div>
              </div>

              <div className={`rounded-xl shadow-lg p-6 ${data.queue.alert ? 'bg-orange-50 border-2 border-orange-300' : 'bg-white'}`}>
                <h2 className="text-lg font-semibold text-gray-800 mb-4">
                  队列积压
                  {data.queue.alert && (
                    <span className="ml-2 text-orange-600 text-sm">⚠️ 告警</span>
                  )}
                </h2>
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <p className="text-sm text-gray-500">待处理事件</p>
                    <p className="text-2xl font-bold">{data.queue.pending_events}</p>
                  </div>
                  <div>
                    <p className="text-sm text-gray-500">待处理批次</p>
                    <p className="text-2xl font-bold">{data.queue.pending_batches}</p>
                  </div>
                </div>
                {data.queue.pending_rows > 0 && (
                  <div className="mt-4 pt-4 border-t">
                    <p className="text-sm text-gray-500">待处理行数</p>
                    <p className={`text-xl font-bold ${data.queue.pending_rows > 5000 ? 'text-orange-600' : ''}`}>
                      {data.queue.pending_rows.toLocaleString()}
                    </p>
                  </div>
                )}
              </div>

              <div className="bg-white rounded-xl shadow-lg p-6">
                <h2 className="text-lg font-semibold text-gray-800 mb-4">阶段耗时</h2>
                <div className="space-y-3">
                  <div className="flex items-center justify-between">
                    <span className="text-sm text-gray-600">解析</span>
                    <span className="font-mono text-sm">{data.performance.avg_parse_ms}ms</span>
                  </div>
                  <div className="flex items-center justify-between">
                    <span className="text-sm text-gray-600">规则</span>
                    <span className="font-mono text-sm">{data.performance.avg_rule_ms}ms</span>
                  </div>
                  <div className="flex items-center justify-between">
                    <span className="text-sm text-gray-600">校验</span>
                    <span className="font-mono text-sm">{data.performance.avg_validate_ms}ms</span>
                  </div>
                  <div className="flex items-center justify-between">
                    <span className="text-sm text-gray-600">写入</span>
                    <span className="font-mono text-sm">{data.performance.avg_insert_ms}ms</span>
                  </div>
                  <div className="flex items-center justify-between pt-2 border-t">
                    <span className="font-semibold text-sm">总计</span>
                    <span className="font-mono font-bold text-sm">{data.performance.avg_total_ms}ms</span>
                  </div>
                </div>
              </div>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-6 mb-6">
              <div className="bg-white rounded-xl shadow-lg p-6">
                <h2 className="text-lg font-semibold text-gray-800 mb-4">错误类型分布</h2>
                {data.errors.distribution.length === 0 ? (
                  <p className="text-gray-500 text-center py-8">近期无错误记录</p>
                ) : (
                  <div className="space-y-3">
                    {data.errors.distribution.map((err) => (
                      <div key={err.error_code}>
                        <div className="flex justify-between text-sm mb-1">
                          <span className="text-gray-600">
                            {errorCodeMap[err.error_code] || err.error_code}
                          </span>
                          <span className="font-mono">{err.count}</span>
                        </div>
                        <div className="w-full bg-gray-200 rounded-full h-2">
                          <div
                            className="bg-red-500 h-2 rounded-full transition-all duration-500"
                            style={{ width: `${(err.count / maxErrorCount) * 100}%` }}
                          />
                        </div>
                      </div>
                    ))}
                  </div>
                )}
                {data.errors.total_last_hour > 0 && (
                  <div className="mt-4 pt-4 border-t text-sm text-gray-500">
                    最近一小时错误总数: {data.errors.total_last_hour}
                  </div>
                )}
              </div>

              <div className="bg-white rounded-xl shadow-lg p-6">
                <h2 className="text-lg font-semibold text-gray-800 mb-4">近期任务</h2>
                {data.recent_tasks.length === 0 ? (
                  <p className="text-gray-500 text-center py-8">暂无任务记录</p>
                ) : (
                  <div className="space-y-2 max-h-80 overflow-y-auto">
                    {data.recent_tasks.map((task) => (
                      <div key={task.id} className="flex items-center justify-between p-3 bg-gray-50 rounded-lg">
                        <div className="flex-1 min-w-0">
                          <p className="font-medium text-sm truncate">{task.id}</p>
                          <p className="text-xs text-gray-500">
                            {task.processed_rows.toLocaleString()} / {task.total_rows.toLocaleString()} 行
                          </p>
                        </div>
                        <span className={`px-2 py-1 rounded text-xs ${statusColors[task.status] || 'bg-gray-100'}`}>
                          {task.status}
                        </span>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>

            <div className="bg-white rounded-xl shadow-lg p-6">
              <div className="flex items-center justify-between">
                <span className="text-sm text-gray-500">最后更新: {new Date(data.timestamp).toLocaleString()}</span>
              </div>
            </div>
          </>
        )}
      </div>
    </div>
  )
}
