'use client'

import { useState, useEffect } from 'react'
import Link from 'next/link'
import { useRouter, useSearchParams } from 'next/navigation'

interface TaskProgress {
  task_id: string
  trace_id: string
  status: string
  total_rows: number
  processed_rows: number
  success_rows: number
  failed_rows: number
  total_batches: number
  completed_batches: number
  degraded: boolean
  elapsed_seconds: number
  rows_per_second: number
  estimated_seconds_remaining: number
  batches: Array<{
    id: string
    unitId: string
    batchIndex: number
    status: string
    startRow: number
    endRow: number
    retryCount: number
  }>
  created_at: string
  completed_at: string | null
}

const statusColors: Record<string, string> = {
  PENDING: 'bg-yellow-100 text-yellow-800',
  PROCESSING: 'bg-blue-100 text-blue-800',
  COMPLETED: 'bg-green-100 text-green-800',
  PARTIAL_SUCCESS: 'bg-orange-100 text-orange-800',
  FAILED: 'bg-red-100 text-red-800',
}

export default function TaskProgressPage() {
  const router = useRouter()
  const searchParams = useSearchParams()
  const taskId = searchParams.get('task_id') || ''
  
  const [task, setTask] = useState<TaskProgress | null>(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [activeTab, setActiveTab] = useState<'progress' | 'errors' | 'trace'>('progress')
  const [errors, setErrors] = useState<any[]>([])
  const [errorPage, setErrorPage] = useState(1)
  const [errorTotalPages, setErrorTotalPages] = useState(1)
  const [traceEvents, setTraceEvents] = useState<any[]>([])

  useEffect(() => {
    if (taskId) {
      fetchTaskStatus()
      const interval = setInterval(() => {
        if (task?.status !== 'COMPLETED' && task?.status !== 'PARTIAL_SUCCESS' && task?.status !== 'FAILED') {
          fetchTaskStatus()
        }
      }, 2000)
      
      return () => clearInterval(interval)
    }
  }, [taskId])

  const fetchTaskStatus = async () => {
    if (!taskId) return
    
    try {
      setLoading(true)
      const res = await fetch(`/api/import-tasks/${taskId}`)
      const data = await res.json()
      
      if (res.ok) {
        setTask(data)
        
        if (data.status === 'COMPLETED' || data.status === 'PARTIAL_SUCCESS' || data.status === 'FAILED') {
          clearInterval(window.setInterval(() => {}, 0))
        }
      } else {
        setError(data.error || '获取任务状态失败')
      }
    } catch (err: any) {
      setError(err.message || '网络错误')
    } finally {
      setLoading(false)
    }
  }

  const fetchErrors = async (page = 1) => {
    if (!taskId) return
    
    try {
      const res = await fetch(`/api/import-tasks/${taskId}/errors?page=${page}&page_size=50`)
      const data = await res.json()
      
      if (res.ok) {
        setErrors(data.errors)
        setErrorTotalPages(data.pagination.total_pages)
      }
    } catch (err) {
      console.error('Fetch errors failed:', err)
    }
  }

  const fetchTrace = async () => {
    if (!task?.trace_id) return
    
    try {
      const res = await fetch(`/api/traces/${task.trace_id}`)
      const data = await res.json()
      
      if (res.ok) {
        setTraceEvents(data.events)
      }
    } catch (err) {
      console.error('Fetch trace failed:', err)
    }
  }

  const handleTabChange = (tab: 'progress' | 'errors' | 'trace') => {
    setActiveTab(tab)
    if (tab === 'errors') {
      fetchErrors(1)
      setErrorPage(1)
    } else if (tab === 'trace') {
      fetchTrace()
    }
  }

  const progress = task ? Math.round((task.processed_rows / task.total_rows) * 100) : 0

  if (!taskId) {
    return (
      <div className="min-h-screen p-6">
        <div className="max-w-2xl mx-auto">
          <Link href="/import" className="text-teal-600 hover:underline mb-4 inline-block">
            ← 返回导入页
          </Link>
          <div className="bg-white rounded-xl shadow p-8 text-center">
            <h1 className="text-2xl font-bold text-gray-800 mb-4">任务进度</h1>
            <p className="text-gray-600">缺少任务ID，请从导入页面开始</p>
            <Link href="/import" className="mt-4 inline-block bg-teal-600 text-white px-6 py-2 rounded-lg hover:bg-teal-700">
              前往导入
            </Link>
          </div>
        </div>
      </div>
    )
  }

  return (
    <div className="min-h-screen p-6">
      <div className="max-w-6xl mx-auto">
        <div className="flex items-center justify-between mb-6">
          <Link href="/import" className="text-teal-600 hover:underline">
            ← 返回导入页
          </Link>
          {(task?.status === 'COMPLETED' || task?.status === 'PARTIAL_SUCCESS') && (
            <button
              onClick={() => router.push('/import')}
              className="bg-teal-600 text-white px-4 py-2 rounded-lg hover:bg-teal-700"
            >
              创建新任务
            </button>
          )}
        </div>

        {error && (
          <div className="bg-red-50 border border-red-200 rounded-lg p-4 mb-6">
            <p className="text-red-800">{error}</p>
          </div>
        )}

        {task && (
          <>
            <div className="bg-white rounded-xl shadow-lg p-6 mb-6">
              <div className="flex items-center justify-between mb-6">
                <h1 className="text-2xl font-bold text-gray-800">任务进度</h1>
                <span className={`px-3 py-1 rounded-full text-sm font-semibold ${statusColors[task.status] || 'bg-gray-100'}`}>
                  {task.status}
                </span>
              </div>

              {task.degraded && (
                <div className="bg-amber-50 border border-amber-200 rounded-lg p-4 mb-4">
                  <p className="text-amber-800 font-semibold">
                    ⚠️ SKU校验已降级：本次导入未经过商品主数据完整校验，数据可能需要后续复核。
                  </p>
                </div>
              )}

              <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-6">
                <div className="bg-gray-50 rounded-lg p-4">
                  <p className="text-sm text-gray-500">总行数</p>
                  <p className="text-2xl font-bold text-gray-800">{task.total_rows.toLocaleString()}</p>
                </div>
                <div className="bg-blue-50 rounded-lg p-4">
                  <p className="text-sm text-blue-600">已处理</p>
                  <p className="text-2xl font-bold text-blue-800">{task.processed_rows.toLocaleString()}</p>
                </div>
                <div className="bg-green-50 rounded-lg p-4">
                  <p className="text-sm text-green-600">成功</p>
                  <p className="text-2xl font-bold text-green-800">{task.success_rows.toLocaleString()}</p>
                </div>
                <div className="bg-red-50 rounded-lg p-4">
                  <p className="text-sm text-red-600">失败</p>
                  <p className="text-2xl font-bold text-red-800">{task.failed_rows.toLocaleString()}</p>
                </div>
              </div>

              <div className="mb-6">
                <div className="flex justify-between text-sm text-gray-600 mb-2">
                  <span>处理进度</span>
                  <span>{progress}%</span>
                </div>
                <div className="w-full bg-gray-200 rounded-full h-4">
                  <div
                    className={`h-4 rounded-full transition-all duration-300 ${
                      task.status === 'FAILED' ? 'bg-red-500' :
                      task.status === 'PARTIAL_SUCCESS' ? 'bg-orange-500' :
                      task.status === 'COMPLETED' ? 'bg-green-500' : 'bg-blue-500'
                    }`}
                    style={{ width: `${progress}%` }}
                  />
                </div>
              </div>

              <div className="grid grid-cols-2 md:grid-cols-4 gap-4 text-sm">
                <div>
                  <p className="text-gray-500">批次数</p>
                  <p className="font-semibold">{task.completed_batches} / {task.total_batches}</p>
                </div>
                <div>
                  <p className="text-gray-500">耗时</p>
                  <p className="font-semibold">{task.elapsed_seconds}秒</p>
                </div>
                <div>
                  <p className="text-gray-500">吞吐量</p>
                  <p className="font-semibold">{task.rows_per_second.toFixed(0)} 行/秒</p>
                </div>
                <div>
                  <p className="text-gray-500">预计剩余</p>
                  <p className="font-semibold">{task.estimated_seconds_remaining}秒</p>
                </div>
              </div>
            </div>

            <div className="bg-white rounded-xl shadow-lg p-6">
              <div className="flex gap-4 mb-6 border-b">
                {(['progress', 'errors', 'trace'] as const).map(tab => (
                  <button
                    key={tab}
                    onClick={() => handleTabChange(tab)}
                    className={`px-4 py-2 font-semibold border-b-2 transition-colors ${
                      activeTab === tab
                        ? 'border-teal-500 text-teal-600'
                        : 'border-transparent text-gray-500 hover:text-gray-700'
                    }`}
                  >
                    {tab === 'progress' ? '批次进度' : tab === 'errors' ? `错误明细 (${task.failed_rows})` : 'Trace追踪'}
                  </button>
                ))}
              </div>

              {activeTab === 'progress' && (
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="bg-gray-50">
                        <th className="px-4 py-2 text-left">批次</th>
                        <th className="px-4 py-2 text-left">行范围</th>
                        <th className="px-4 py-2 text-left">状态</th>
                        <th className="px-4 py-2 text-left">重试次数</th>
                      </tr>
                    </thead>
                    <tbody>
                      {task.batches.map((batch) => (
                        <tr key={batch.id} className="border-b">
                          <td className="px-4 py-2">{batch.unitId}</td>
                          <td className="px-4 py-2">{batch.startRow} - {batch.endRow}</td>
                          <td className="px-4 py-2">
                            <span className={`px-2 py-1 rounded text-xs ${statusColors[batch.status] || 'bg-gray-100'}`}>
                              {batch.status}
                            </span>
                          </td>
                          <td className="px-4 py-2">{batch.retryCount}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}

              {activeTab === 'errors' && (
                <div>
                  {errors.length === 0 ? (
                    <p className="text-gray-500 text-center py-8">暂无错误记录</p>
                  ) : (
                    <>
                      <div className="overflow-x-auto">
                        <table className="w-full text-sm">
                          <thead>
                            <tr className="bg-gray-50">
                              <th className="px-4 py-2 text-left">行号</th>
                              <th className="px-4 py-2 text-left">字段</th>
                              <th className="px-4 py-2 text-left">错误码</th>
                              <th className="px-4 py-2 text-left">错误原因</th>
                              <th className="px-4 py-2 text-left">原始值</th>
                            </tr>
                          </thead>
                          <tbody>
                            {errors.map((err, idx) => (
                              <tr key={idx} className="border-b">
                                <td className="px-4 py-2">{err.row_number}</td>
                                <td className="px-4 py-2">{err.field_name}</td>
                                <td className="px-4 py-2">
                                  <span className="bg-red-100 text-red-800 px-2 py-1 rounded text-xs">
                                    {err.error_code}
                                  </span>
                                </td>
                                <td className="px-4 py-2">{err.error_reason}</td>
                                <td className="px-4 py-2 text-gray-500">{err.raw_value || '-'}</td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>
                      {errorTotalPages > 1 && (
                        <div className="flex justify-center gap-2 mt-4">
                          <button
                            onClick={() => {
                              const newPage = Math.max(1, errorPage - 1)
                              setErrorPage(newPage)
                              fetchErrors(newPage)
                            }}
                            disabled={errorPage === 1}
                            className="px-3 py-1 border rounded disabled:opacity-50"
                          >
                            上一页
                          </button>
                          <span className="px-3 py-1">
                            {errorPage} / {errorTotalPages}
                          </span>
                          <button
                            onClick={() => {
                              const newPage = Math.min(errorTotalPages, errorPage + 1)
                              setErrorPage(newPage)
                              fetchErrors(newPage)
                            }}
                            disabled={errorPage === errorTotalPages}
                            className="px-3 py-1 border rounded disabled:opacity-50"
                          >
                            下一页
                          </button>
                        </div>
                      )}
                    </>
                  )}
                </div>
              )}

              {activeTab === 'trace' && (
                <div>
                  {traceEvents.length === 0 ? (
                    <p className="text-gray-500 text-center py-8">暂无Trace事件</p>
                  ) : (
                    <div className="space-y-2">
                      {traceEvents.map((event, idx) => (
                        <div key={idx} className="flex gap-4 p-3 bg-gray-50 rounded-lg">
                          <div className="flex-shrink-0 w-32 text-xs text-gray-500">
                            {new Date(event.occurred_at).toLocaleTimeString()}
                          </div>
                          <div className="flex-shrink-0 w-32">
                            <span className={`text-xs px-2 py-1 rounded ${
                              event.event_status === 'SUCCESS' ? 'bg-green-100 text-green-800' :
                              event.event_status === 'FAILED' ? 'bg-red-100 text-red-800' :
                              'bg-yellow-100 text-yellow-800'
                            }`}>
                              {event.event_status}
                            </span>
                          </div>
                          <div className="flex-1">
                            <p className="font-medium text-sm">{event.event_name}</p>
                            {event.message && <p className="text-sm text-gray-600">{event.message}</p>}
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              )}
            </div>
          </>
        )}
      </div>
    </div>
  )
}
