'use client'

import { useState, useEffect } from 'react'
import Link from 'next/link'
import { Toaster, toast } from 'sonner'
import * as XLSX from 'xlsx'

interface Rule {
  id: string
  name: string
  description?: string
  fileFormat: string
}

interface ShipmentData {
  id?: string
  externalCode?: string
  storeName?: string
  recipientName?: string
  recipientPhone?: string
  recipientAddress?: string
  skuCode: string
  skuName: string
  quantity: number
  specification?: string
  remarks?: string
  errors?: string[]
}

export default function ImportPage() {
  const [file, setFile] = useState<File | null>(null)
  const [rules, setRules] = useState<Rule[]>([])
  const [selectedRule, setSelectedRule] = useState<string>('')
  const [parsing, setParsing] = useState(false)
  const [parsedData, setParsedData] = useState<ShipmentData[]>([])
  const [showPreview, setShowPreview] = useState(false)
  const [errors, setErrors] = useState<any[]>([])
  const [duplicateWarnings, setDuplicateWarnings] = useState<any[]>([])
  const [submitting, setSubmitting] = useState(false)
  const [progress, setProgress] = useState(0)

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
      toast.success('已选择：' + selected.name)
    }
  }

  const validateData = (data: ShipmentData[]) => {
    const validData: ShipmentData[] = []
    const errorList: any[] = []
    // 记录外部编码和SKU编码的组合，用于检测真正的重复
    const externalAndSkuSet = new Set<string>()

    data.forEach((row, index) => {
      const rowErrors: string[] = []
      const rowIndex = index + 1

      if (!row.skuCode) rowErrors.push('SKU 编码不能为空')
      if (!row.skuName) rowErrors.push('SKU 名称不能为空')
      if (!row.quantity || row.quantity <= 0) rowErrors.push('数量必须为正数')

      const hasStore = !!row.storeName
      const hasRecipient = !!(row.recipientName && row.recipientPhone)
      if (!hasStore && !hasRecipient) {
        rowErrors.push('收货门店或收件人信息（姓名+电话）至少填写一项')
      }

      if (row.recipientPhone) {
        const phoneRegex = /^1[3-9]\d{9}$/
        if (!phoneRegex.test(row.recipientPhone)) {
          rowErrors.push('收件人电话格式不正确')
        }
      }

      // 检测真正的重复：同一个外部编码 + 同一个SKU编码 重复出现
      if (row.externalCode && row.skuCode) {
        const compositeKey = `${row.externalCode}|${row.skuCode}`
        if (externalAndSkuSet.has(compositeKey)) {
          rowErrors.push('外部编码+SKU编码组合重复')
        } else {
          externalAndSkuSet.add(compositeKey)
        }
      }

      if (rowErrors.length > 0) {
        errorList.push({
          rowIndex,
          field: '多个字段',
          message: rowErrors.join('、')
        })
      }

      validData.push({
        ...row,
        errors: rowErrors
      })
    })

    return { valid: validData, errors: errorList }
  }

  const handleUpload = async (useSmartParsing = false) => {
    if (!file) {
      toast.error('请先选择文件')
      return
    }

    if (!useSmartParsing && !selectedRule) {
      toast.error('请选择解析规则，或使用智能解析')
      return
    }

    setParsing(true)
    setProgress(10)
    toast.info('正在解析文件...')

    try {
      const formData = new FormData()
      formData.append('file', file)
      if (useSmartParsing) {
        formData.append('useSmartParsing', 'true')
      } else if (selectedRule) {
        formData.append('ruleId', selectedRule)
      }

      setProgress(30)
      
      const res = await fetch('/api/parse', {
        method: 'POST',
        body: formData,
      })

      setProgress(60)
      
      const result = await res.json()

      if (result.error) {
        toast.error(result.error)
        return
      }

      const { valid, errors: validationErrors } = validateData(result.data || [])
      setParsedData(valid)
      setErrors(validationErrors)
      
      // 设置重复警告
      if (result.duplicateWarnings && result.duplicateWarnings.length > 0) {
        setDuplicateWarnings(result.duplicateWarnings)
      } else {
        setDuplicateWarnings([])
      }
      
      setShowPreview(true)
      setProgress(100)
      
      const successMsg = `解析完成！共 ${(result.data || []).length} 条数据${
        validationErrors.length > 0 ? `，发现 ${validationErrors.length} 个错误` : ''
      }${
        result.duplicateWarnings?.length > 0 ? `，${result.duplicateWarnings.length} 条重复提醒` : ''
      }`
      toast.success(successMsg)
    } catch (error) {
      toast.error('解析失败')
    } finally {
      setParsing(false)
      setProgress(0)
    }
  }

  const handleCellChange = (index: number, field: keyof ShipmentData, value: any) => {
    const newData = [...parsedData]
    newData[index] = { ...newData[index], [field]: value }
    const { valid } = validateData(newData)
    setParsedData(valid)
  }

  const handleDeleteRow = (index: number) => {
    const newData = parsedData.filter((_, i) => i !== index)
    const { valid, errors: validationErrors } = validateData(newData)
    setParsedData(valid)
    setErrors(validationErrors)
  }

  const handleAddRow = () => {
    const newRow: ShipmentData = {
      skuCode: '',
      skuName: '',
      quantity: 1
    }
    const newData = [...parsedData, newRow]
    setParsedData(newData)
  }

  const handleExportExcel = () => {
    const exportData = parsedData.map(row => ({
      '外部编码': row.externalCode || '',
      '收货门店': row.storeName || '',
      '收件人姓名': row.recipientName || '',
      '收件人电话': row.recipientPhone || '',
      '收件人地址': row.recipientAddress || '',
      'SKU编码': row.skuCode,
      'SKU名称': row.skuName,
      '数量': row.quantity,
      '规格型号': row.specification || '',
      '备注': row.remarks || ''
    }))

    const worksheet = XLSX.utils.json_to_sheet(exportData)
    const workbook = XLSX.utils.book_new()
    XLSX.utils.book_append_sheet(workbook, worksheet, 'Sheet1')
    XLSX.writeFile(workbook, '导出数据.xlsx')
    toast.success('导出成功！')
  }

  const handleSubmit = async () => {
    const hasErrors = parsedData.some(row => row.errors && row.errors.length > 0)
    if (hasErrors) {
      toast.error('存在错误数据，请先修正后再提交')
      return
    }

    setSubmitting(true)
    setProgress(0)
    
    try {
      for (let i = 0; i < parsedData.length; i++) {
        await new Promise(resolve => setTimeout(resolve, 50))
        setProgress(Math.round(((i + 1) / parsedData.length) * 100))
      }
      
      const res = await fetch('/api/submit', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ data: parsedData }),
      })

      const result = await res.json()

      if (result.success) {
        toast.success(result.message || '提交成功！')
        setShowPreview(false)
        setFile(null)
        setParsedData([])
        setErrors([])
      } else {
        toast.error(result.error || '提交失败')
      }
    } catch (error) {
      toast.error('提交失败')
    } finally {
      setSubmitting(false)
      setProgress(0)
    }
  }

  const isButtonDisabled = !file || (!selectedRule && rules.length > 0) || parsing
  const buttonClass = isButtonDisabled ? 'bg-gray-400 cursor-not-allowed' : 'bg-teal-600 hover:bg-teal-700'
  
  const smartButtonDisabled = !file || parsing
  const smartButtonClass = smartButtonDisabled ? 'bg-gray-400 cursor-not-allowed' : 'bg-blue-600 hover:bg-blue-700'
  
  const submitDisabled = submitting || parsedData.some(row => row.errors && row.errors.length > 0)
  const submitClass = submitDisabled ? 'bg-gray-400 cursor-not-allowed' : 'bg-teal-600 hover:bg-teal-700'

  return (
    <div className="min-h-screen">
      <Toaster position="top-center" richColors />
      
      <div className="max-w-7xl mx-auto px-6 py-8">
        <header className="mb-8">
          <Link href="/" className="text-teal-600 hover:underline text-sm">
            返回首页
          </Link>
          <h1 className="text-3xl font-bold text-teal-600 mt-2">文件导入</h1>
          <p className="text-gray-600 mt-1">上传 Excel/Word/PDF 文件，使用已配置的规则进行智能解析</p>
        </header>

        <div className="bg-white rounded-xl shadow-lg p-8 mb-6 border border-gray-200">
          <h2 className="text-xl font-semibold text-gray-800 mb-4">1. 上传文件</h2>
          
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
            <div className="mt-6 bg-teal-50 rounded-lg p-4 border border-teal-200">
              <div className="flex items-center justify-between">
                <div>
                  <p className="font-semibold text-gray-800">
                    {file.name}
                  </p>
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

          {(parsing || submitting) && (
            <div className="mt-4">
              <div className="flex justify-between text-sm text-gray-600 mb-2">
                <span>{submitting ? '正在提交' : '正在解析'}</span>
                <span>{progress}%</span>
              </div>
              <div className="w-full bg-gray-200 rounded-full h-2.5">
                <div
                  className="bg-teal-600 h-2.5 rounded-full transition-all duration-300"
                  style={{ width: progress + '%' }}
                />
              </div>
            </div>
          )}
        </div>

        <div className="bg-white rounded-xl shadow-lg p-6 mb-6 border border-gray-200">
          <h2 className="text-xl font-semibold text-gray-800 mb-4">2. 选择解析规则</h2>
          
          {rules.length === 0 ? (
            <div className="bg-yellow-50 border border-yellow-200 rounded-lg p-6">
              <p className="text-yellow-800 mb-4">
                还没有可用的解析规则
              </p>
              <div className="flex gap-4">
                <Link
                  href="/rules"
                  className="inline-block bg-teal-600 text-white px-6 py-2 rounded-lg hover:bg-teal-700 transition-colors"
                >
                  前往创建规则
                </Link>
                <p className="text-gray-500 flex items-center">
                  或者直接使用智能解析
                </p>
              </div>
            </div>
          ) : (
            <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-4">
              {rules.map(rule => (
                <div
                  key={rule.id}
                  onClick={() => setSelectedRule(rule.id)}
                  className={selectedRule === rule.id ? 'border-teal-500 bg-teal-50 ring-2 ring-teal-200' : 'border-gray-200 hover:border-teal-300 border rounded-lg p-4 cursor-pointer transition-all'}
                >
                  <div className="flex items-center mb-2">
                    <div className={selectedRule === rule.id ? 'border-teal-600 bg-teal-600' : 'border-gray-300 w-4 h-4 rounded-full border-2 mr-2'} />
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

        <div className="bg-white rounded-xl shadow-lg p-6 mb-6 border border-gray-200">
          <div className="flex gap-4">
            <button
              onClick={() => handleUpload(false)}
              disabled={isButtonDisabled}
              className={'flex-1 py-4 rounded-lg text-white font-semibold text-lg transition-all ' + buttonClass}
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
                '使用规则解析'
              )}
            </button>
            
            <button
              onClick={() => handleUpload(true)}
              disabled={smartButtonDisabled}
              className={'flex-1 py-4 rounded-lg text-white font-semibold text-lg transition-all ' + smartButtonClass}
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
                '智能解析'
              )}
            </button>
          </div>
        </div>

        {showPreview && parsedData.length > 0 && (
          <div className="bg-white rounded-xl shadow-lg p-6 border border-gray-200">
            <div className="flex items-center justify-between mb-6">
              <h2 className="text-xl font-semibold text-gray-800">
                3. 数据预览与编辑
              </h2>
              <div className="flex gap-3">
                <button
                  onClick={handleAddRow}
                  className="px-4 py-2 border border-teal-600 text-teal-600 rounded-lg hover:bg-teal-50 transition-colors"
                >
                  新增空行
                </button>
                <button
                  onClick={handleExportExcel}
                  className="px-4 py-2 border border-gray-300 text-gray-700 rounded-lg hover:bg-gray-50 transition-colors"
                >
                  导出Excel
                </button>
              </div>
            </div>
            
            {errors.length > 0 && (
              <div className="bg-red-50 border border-red-200 rounded-lg p-4 mb-4">
                <h3 className="font-semibold text-red-800 mb-3 flex items-center">
                  发现 {errors.length} 个问题（需修正后才能提交）
                </h3>
                <div className="space-y-2 max-h-40 overflow-y-auto">
                  {errors.map((err, idx) => (
                    <div key={idx} className="text-sm text-red-700 bg-red-100 rounded px-3 py-2">
                      第 {err.rowIndex} 行：{err.message}
                    </div>
                  ))}
                </div>
              </div>
            )}
            
            {duplicateWarnings.length > 0 && (
              <div className="bg-amber-50 border border-amber-200 rounded-lg p-4 mb-6">
                <h3 className="font-semibold text-amber-800 mb-3 flex items-center">
                  ⚠️ 重复提醒（共 {duplicateWarnings.length} 条，不影响提交）
                </h3>
                <div className="space-y-2 max-h-40 overflow-y-auto">
                  {duplicateWarnings.map((warn, idx) => (
                    <div key={idx} className="text-sm text-amber-700 bg-amber-100 rounded px-3 py-2">
                      第 {warn.rowIndex} 行：{warn.type === 'database' 
                        ? `外部编码 "${warn.externalCode}" 在数据库中已存在`
                        : `外部编码+SKU组合 "${warn.externalCode}+${warn.skuCode}" 在本批次内重复`
                      }
                    </div>
                  ))}
                </div>
              </div>
            )}

            <div className="overflow-x-auto border rounded-lg">
              <table className="w-full text-sm">
                <thead className="bg-teal-600 text-white sticky top-0">
                  <tr>
                    <th className="p-3 text-left font-semibold w-16">序号</th>
                    <th className="p-3 text-left font-semibold">外部编码</th>
                    <th className="p-3 text-left font-semibold">收货门店</th>
                    <th className="p-3 text-left font-semibold">收件人姓名</th>
                    <th className="p-3 text-left font-semibold">收件人电话</th>
                    <th className="p-3 text-left font-semibold">收件人地址</th>
                    <th className="p-3 text-left font-semibold">SKU编码</th>
                    <th className="p-3 text-left font-semibold">SKU名称</th>
                    <th className="p-3 text-left font-semibold">数量</th>
                    <th className="p-3 text-left font-semibold">规格型号</th>
                    <th className="p-3 text-left font-semibold">备注</th>
                    <th className="p-3 text-center font-semibold w-20">操作</th>
                  </tr>
                </thead>
                <tbody className="divide-y">
                  {parsedData.map((row, idx) => {
                    const hasError = row.errors && row.errors.length > 0
                    const skuCodeClass = hasError && !row.skuCode ? 'border-red-500 bg-red-100' : ''
                    const skuNameClass = hasError && !row.skuName ? 'border-red-500 bg-red-100' : ''
                    const quantityClass = hasError && (!row.quantity || row.quantity <= 0) ? 'border-red-500 bg-red-100' : ''
                    
                    // 检查是否是重复行
                    const isDuplicate = duplicateWarnings.some(w => w.rowIndex === idx + 1)
                    const rowClass = hasError 
                      ? 'bg-red-50' 
                      : isDuplicate 
                        ? 'bg-amber-50 hover:bg-amber-100' 
                        : 'hover:bg-gray-50'
                    
                    return (
                      <tr key={idx} className={rowClass}>
                        <td className="p-2 text-center text-gray-500">
                          {idx + 1}
                          {isDuplicate && <span className="ml-1 text-amber-600 text-xs">⚠️</span>}
                        </td>
                        <td className="p-2">
                          <input
                            type="text"
                            value={row.externalCode || ''}
                            onChange={(e) => handleCellChange(idx, 'externalCode', e.target.value)}
                            className="w-full px-2 py-1 border rounded focus:ring-1 focus:ring-teal-500"
                            placeholder="外部编码"
                          />
                        </td>
                        <td className="p-2">
                          <input
                            type="text"
                            value={row.storeName || ''}
                            onChange={(e) => handleCellChange(idx, 'storeName', e.target.value)}
                            className="w-full px-2 py-1 border rounded focus:ring-1 focus:ring-teal-500"
                            placeholder="收货门店"
                          />
                        </td>
                        <td className="p-2">
                          <input
                            type="text"
                            value={row.recipientName || ''}
                            onChange={(e) => handleCellChange(idx, 'recipientName', e.target.value)}
                            className="w-full px-2 py-1 border rounded focus:ring-1 focus:ring-teal-500"
                            placeholder="姓名"
                          />
                        </td>
                        <td className="p-2">
                          <input
                            type="text"
                            value={row.recipientPhone || ''}
                            onChange={(e) => handleCellChange(idx, 'recipientPhone', e.target.value)}
                            className="w-full px-2 py-1 border rounded focus:ring-1 focus:ring-teal-500"
                            placeholder="电话"
                          />
                        </td>
                        <td className="p-2">
                          <input
                            type="text"
                            value={row.recipientAddress || ''}
                            onChange={(e) => handleCellChange(idx, 'recipientAddress', e.target.value)}
                            className="w-full px-2 py-1 border rounded focus:ring-1 focus:ring-teal-500"
                            placeholder="地址"
                          />
                        </td>
                        <td className="p-2">
                          <input
                            type="text"
                            value={row.skuCode}
                            onChange={(e) => handleCellChange(idx, 'skuCode', e.target.value)}
                            className={'w-full px-2 py-1 border rounded focus:ring-1 focus:ring-teal-500 ' + skuCodeClass}
                            placeholder="SKU编码"
                          />
                        </td>
                        <td className="p-2">
                          <input
                            type="text"
                            value={row.skuName}
                            onChange={(e) => handleCellChange(idx, 'skuName', e.target.value)}
                            className={'w-full px-2 py-1 border rounded focus:ring-1 focus:ring-teal-500 ' + skuNameClass}
                            placeholder="SKU名称"
                          />
                        </td>
                        <td className="p-2">
                          <input
                            type="number"
                            value={row.quantity}
                            onChange={(e) => handleCellChange(idx, 'quantity', parseInt(e.target.value))}
                            className={'w-24 px-2 py-1 border rounded focus:ring-1 focus:ring-teal-500 ' + quantityClass}
                          />
                        </td>
                        <td className="p-2">
                          <input
                            type="text"
                            value={row.specification || ''}
                            onChange={(e) => handleCellChange(idx, 'specification', e.target.value)}
                            className="w-full px-2 py-1 border rounded focus:ring-1 focus:ring-teal-500"
                            placeholder="规格"
                          />
                        </td>
                        <td className="p-2">
                          <input
                            type="text"
                            value={row.remarks || ''}
                            onChange={(e) => handleCellChange(idx, 'remarks', e.target.value)}
                            className="w-full px-2 py-1 border rounded focus:ring-1 focus:ring-teal-500"
                            placeholder="备注"
                          />
                        </td>
                        <td className="p-2 text-center">
                          <button
                            onClick={() => handleDeleteRow(idx)}
                            className="text-red-600 hover:text-red-700 px-2 py-1 rounded hover:bg-red-100"
                            title="删除行"
                          >
                            删除
                          </button>
                        </td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            </div>

            <div className="mt-6 flex justify-between items-center">
              <div className="text-sm text-gray-600">
                共 {parsedData.length} 条数据
                {errors.length > 0 && (
                  <span className="ml-4 text-red-600">
                    {errors.length} 条有错误
                  </span>
                )}
              </div>
              
              <div className="flex gap-3">
                <button
                  onClick={() => { setShowPreview(false); setParsedData([]); setErrors([]); }}
                  className="px-6 py-2 border border-gray-300 rounded-lg hover:bg-gray-50 transition-colors"
                >
                  返回
                </button>
                <button
                  onClick={handleSubmit}
                  disabled={submitDisabled}
                  className={'px-8 py-2 rounded-lg text-white font-semibold transition-all ' + submitClass}
                >
                  {submitting ? (
                    <span className="flex items-center gap-2">
                      <svg className="animate-spin h-4 w-4" fill="none" viewBox="0 0 24 24">
                        <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" fill="none" />
                        <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
                      </svg>
                      提交中...
                    </span>
                  ) : (
                    '提交下单'
                  )}
                </button>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
