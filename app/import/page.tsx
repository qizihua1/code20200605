
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
  const [file, setFile] = useState&lt;File | null&gt;(null)
  const [rules, setRules] = useState&lt;Rule[]&gt;([])
  const [selectedRule, setSelectedRule] = useState&lt;string&gt;('')
  const [parsing, setParsing] = useState(false)
  const [parsedData, setParsedData] = useState&lt;ShipmentData[]&gt;([])
  const [showPreview, setShowPreview] = useState(false)
  const [errors, setErrors] = useState&lt;any[]&gt;([])
  const [submitting, setSubmitting] = useState(false)
  const [progress, setProgress] = useState(0)

  useEffect(() =&gt; {
    loadRules()
  }, [])

  const loadRules = async () =&gt; {
    try {
      const res = await fetch('/api/rules')
      const data = await res.json()
      setRules(data.rules || [])
    } catch (error) {
      toast.error('加载规则失败')
    }
  }

  const handleFileChange = (e: React.ChangeEvent&lt;HTMLInputElement&gt;) =&gt; {
    const selected = e.target.files?.[0]
    if (selected) {
      setFile(selected)
      toast.success(`已选择：${selected.name}`)
    }
  }

  const validateData = (data: ShipmentData[]) =&gt; {
    const validData: ShipmentData[] = []
    const errorList: any[] = []
    const externalCodeSet = new Set&lt;string&gt;()

    data.forEach((row, index) =&gt; {
      const rowErrors: string[] = []
      const rowIndex = index + 1

      if (!row.skuCode) rowErrors.push('SKU 编码不能为空')
      if (!row.skuName) rowErrors.push('SKU 名称不能为空')
      if (!row.quantity || row.quantity &lt;= 0) rowErrors.push('数量必须为正数')

      const hasStore = !!row.storeName
      const hasRecipient = !!(row.recipientName &amp;&amp; row.recipientPhone)
      if (!hasStore &amp;&amp; !hasRecipient) {
        rowErrors.push('收货门店或收件人信息（姓名+电话）至少填写一项')
      }

      if (row.recipientPhone) {
        const phoneRegex = /^1[3-9]\d{9}$/
        if (!phoneRegex.test(row.recipientPhone)) {
          rowErrors.push('收件人电话格式不正确')
        }
      }

      if (row.externalCode) {
        if (externalCodeSet.has(row.externalCode)) {
          rowErrors.push(`外部编码与第 ${Array.from(externalCodeSet).indexOf(row.externalCode) + 1} 行重复`)
        } else {
          externalCodeSet.add(row.externalCode)
        }
      }

      if (rowErrors.length &gt; 0) {
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

  const handleUpload = async (useSmartParsing = false) =&gt; {
    if (!file) {
      toast.error('请先选择文件')
      return
    }

    if (!useSmartParsing &amp;&amp; !selectedRule) {
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
      setShowPreview(true)
      setProgress(100)
      
      toast.success(`解析完成！共 ${result.data?.length || 0} 条数据${validationErrors.length &gt; 0 ? `，发现 ${validationErrors.length} 个问题` : ''}`)
    } catch (error) {
      toast.error('解析失败')
    } finally {
      setParsing(false)
      setProgress(0)
    }
  }

  const handleCellChange = (index: number, field: keyof ShipmentData, value: any) =&gt; {
    const newData = [...parsedData]
    newData[index] = { ...newData[index], [field]: value }
    const { valid } = validateData(newData)
    setParsedData(valid)
  }

  const handleDeleteRow = (index: number) =&gt; {
    const newData = parsedData.filter((_, i) =&gt; i !== index)
    const { valid, errors: validationErrors } = validateData(newData)
    setParsedData(valid)
    setErrors(validationErrors)
  }

  const handleAddRow = () =&gt; {
    const newRow: ShipmentData = {
      skuCode: '',
      skuName: '',
      quantity: 1
    }
    const newData = [...parsedData, newRow]
    setParsedData(newData)
  }

  const handleExportExcel = () =&gt; {
    const exportData = parsedData.map(row =&gt; ({
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

  const handleSubmit = async () =&gt; {
    const hasErrors = parsedData.some(row =&gt; row.errors &amp;&amp; row.errors.length &gt; 0)
    if (hasErrors) {
      toast.error('存在错误数据，请先修正后再提交')
      return
    }

    setSubmitting(true)
    setProgress(0)
    
    try {
      for (let i = 0; i &lt; parsedData.length; i++) {
        await new Promise(resolve =&gt; setTimeout(resolve, 50))
        setProgress(Math.round(((i + 1) / parsedData.length) * 100))
      }
      
      const formData = new FormData()
      if (file) formData.append('file', file)
      if (selectedRule) formData.append('ruleId', selectedRule)
      
      const res = await fetch('/api/parse', {
        method: 'POST',
        body: formData,
      })

      const result = await res.json()

      if (result.success) {
        toast.success(`提交成功！共 ${parsedData.length} 条数据`)
        setShowPreview(false)
        setFile(null)
        setParsedData([])
        setErrors([])
      } else {
        toast.error('提交失败')
      }
    } catch (error) {
      toast.error('提交失败')
    } finally {
      setSubmitting(false)
      setProgress(0)
    }
  }

  return (
    &lt;div className="min-h-screen bg-gradient-to-br from-cyan-50 to-teal-50"&gt;
      &lt;Toaster position="top-center" richColors /&gt;
      
      &lt;div className="max-w-7xl mx-auto px-6 py-8"&gt;
        &lt;header className="mb-8"&gt;
          &lt;Link href="/" className="text-teal-600 hover:underline text-sm"&gt;← 返回首页&lt;/Link&gt;
          &lt;h1 className="text-3xl font-bold text-teal-600 mt-2"&gt;文件导入&lt;/h1&gt;
          &lt;p className="text-gray-600 mt-1"&gt;上传 Excel/Word/PDF 文件，使用已配置的规则进行智能解析&lt;/p&gt;
        &lt;/header&gt;

        &lt;div className="bg-white rounded-xl shadow-lg p-8 mb-6 border border-cyan-100"&gt;
          &lt;h2 className="text-xl font-semibold text-gray-800 mb-4"&gt;1. 上传文件&lt;/h2&gt;
          
          &lt;div className="border-2 border-dashed border-teal-300 rounded-xl p-12 text-center hover:border-teal-500 transition-colors bg-teal-50"&gt;
            &lt;input
              type="file"
              accept=".xlsx,.xls,.docx,.pdf"
              onChange={handleFileChange}
              className="hidden"
              id="file-upload"
            /&gt;
            &lt;label htmlFor="file-upload" className="cursor-pointer"&gt;
              &lt;svg className="mx-auto h-12 w-12 text-teal-400" stroke="currentColor" fill="none" viewBox="0 0 48 48"&gt;
                &lt;path d="M28 8H12a4 4 0 00-4 4v20m32-12v8m0 0v8a4 4 0 01-4 4H12a4 4 0 01-4-4v-4m32-4l-3.172-3.172a4 4 0 00-5.656 0L28 28M8 32l9.172-9.172a4 4 0 015.656 0L28 28m0 0l4 4m4-24h8m-4-4v8m-12 4h.02" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" /&gt;
              &lt;/svg&gt;
              &lt;p className="mt-4 text-lg text-gray-600"&gt;
                {file ? file.name : '点击或拖拽文件到此处'}
              &lt;/p&gt;
              &lt;p className="mt-2 text-sm text-gray-500"&gt;
                支持 Excel(.xlsx/.xls)、Word(.docx)、PDF(.pdf)
              &lt;/p&gt;
            &lt;/label&gt;
          &lt;/div&gt;

          {file &amp;&amp; (
            &lt;div className="mt-6 bg-gradient-to-r from-teal-50 to-cyan-50 rounded-lg p-4 border border-teal-200"&gt;
              &lt;div className="flex items-center justify-between"&gt;
                &lt;div&gt;
                  &lt;p className="font-semibold text-gray-800"&gt;📄 {file.name}&lt;/p&gt;
                  &lt;p className="text-sm text-gray-600"&gt;
                    大小：{(file.size / 1024).toFixed(2)} KB
                  &lt;/p&gt;
                &lt;/div&gt;
                &lt;button
                  onClick={() =&gt; setFile(null)}
                  className="text-red-600 hover:text-red-700 text-sm"
                &gt;
                  移除
                &lt;/button&gt;
              &lt;/div&gt;
            &lt;/div&gt;
          )}

          {(parsing || submitting) &amp;&amp; (
            &lt;div className="mt-4"&gt;
              &lt;div className="flex justify-between text-sm text-gray-600 mb-2"&gt;
                &lt;span&gt;{submitting ? '正在提交' : '正在解析'}&lt;/span&gt;
                &lt;span&gt;{progress}%&lt;/span&gt;
              &lt;/div&gt;
              &lt;div className="w-full bg-gray-200 rounded-full h-2.5"&gt;
                &lt;div
                  className="bg-teal-600 h-2.5 rounded-full transition-all duration-300"
                  style={{ width: `${progress}%` }}
                /&gt;
              &lt;/div&gt;
            &lt;/div&gt;
          )}
        &lt;/div&gt;

        &lt;div className="bg-white rounded-xl shadow-lg p-6 mb-6 border border-cyan-100"&gt;
          &lt;h2 className="text-xl font-semibold text-gray-800 mb-4"&gt;2. 选择解析规则&lt;/h2&gt;
          
          {rules.length === 0 ? (
            &lt;div className="bg-yellow-50 border border-yellow-200 rounded-lg p-6"&gt;
              &lt;p className="text-yellow-800 mb-4"&gt;
                ⚠️ 还没有可用的解析规则
              &lt;/p&gt;
              &lt;div className="flex gap-4"&gt;
                &lt;Link
                  href="/rules"
                  className="inline-block bg-teal-600 text-white px-6 py-2 rounded-lg hover:bg-teal-700 transition-colors"
                &gt;
                  前往创建规则
                &lt;/Link&gt;
                &lt;p className="text-gray-500 flex items-center"&gt;
                  或者直接使用智能解析
                &lt;/p&gt;
              &lt;/div&gt;
            &lt;/div&gt;
          ) : (
            &lt;div className="grid md:grid-cols-2 lg:grid-cols-3 gap-4"&gt;
              {rules.map(rule =&gt; (
                &lt;div
                  key={rule.id}
                  onClick={() =&gt; setSelectedRule(rule.id)}
                  className={`
                    border rounded-lg p-4 cursor-pointer transition-all
                    ${selectedRule === rule.id 
                      ? 'border-teal-500 bg-teal-50 ring-2 ring-teal-200' 
                      : 'border-gray-200 hover:border-teal-300'
                    }
                  `}
                &gt;
                  &lt;div className="flex items-center mb-2"&gt;
                    &lt;div className={`w-4 h-4 rounded-full border-2 mr-2
                      ${selectedRule === rule.id ? 'border-teal-600 bg-teal-600' : 'border-gray-300'}
                    `} /&gt;
                    &lt;span className="font-semibold text-gray-800"&gt;{rule.name}&lt;/span&gt;
                  &lt;/div&gt;
                  &lt;p className="text-sm text-gray-600 truncate"&gt;
                    {rule.description || '暂无描述'}
                  &lt;/p&gt;
                  &lt;div className="mt-2 flex items-center text-xs text-gray-500"&gt;
                    &lt;span className="px-2 py-1 bg-gray-100 rounded"&gt;
                      {rule.fileFormat.toUpperCase()}
                    &lt;/span&gt;
                  &lt;/div&gt;
                &lt;/div&gt;
              ))}
            &lt;/div&gt;
          )}
        &lt;/div&gt;

        &lt;div className="bg-white rounded-xl shadow-lg p-6 mb-6 border border-cyan-100"&gt;
          &lt;div className="flex gap-4"&gt;
            &lt;button
              onClick={() =&gt; handleUpload(false)}
              disabled={!file || (!selectedRule &amp;&amp; rules.length &gt; 0) || parsing}
              className={`
                flex-1 py-4 rounded-lg text-white font-semibold text-lg transition-all
                ${!file || (!selectedRule &amp;&amp; rules.length &gt; 0) || parsing
                  ? 'bg-gray-400 cursor-not-allowed' 
                  : 'bg-teal-600 hover:bg-teal-700 hover:shadow-lg transform hover:-translate-y-0.5'
                }
              `}
            &gt;
              {parsing ? (
                &lt;span className="flex items-center justify-center"&gt;
                  &lt;svg className="animate-spin -ml-1 mr-3 h-5 w-5 text-white" fill="none" viewBox="0 0 24 24"&gt;
                    &lt;circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" fill="none" /&gt;
                    &lt;path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" /&gt;
                  &lt;/svg&gt;
                  解析中...
                &lt;/span&gt;
              ) : (
                '使用规则解析'
              )}
            &lt;/button&gt;
            
            &lt;button
              onClick={() =&gt; handleUpload(true)}
              disabled={!file || parsing}
              className={`
                flex-1 py-4 rounded-lg text-white font-semibold text-lg transition-all
                ${!file || parsing
                  ? 'bg-gray-400 cursor-not-allowed' 
                  : 'bg-blue-600 hover:bg-blue-700 hover:shadow-lg transform hover:-translate-y-0.5'
                }
              `}
            &gt;
              {parsing ? (
                &lt;span className="flex items-center justify-center"&gt;
                  &lt;svg className="animate-spin -ml-1 mr-3 h-5 w-5 text-white" fill="none" viewBox="0 0 24 24"&gt;
                    &lt;circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" fill="none" /&gt;
                    &lt;path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" /&gt;
                  &lt;/svg&gt;
                  解析中...
                &lt;/span&gt;
              ) : (
                '🤖 智能解析'
              )}
            &lt;/button&gt;
          &lt;/div&gt;
        &lt;/div&gt;

        {showPreview &amp;&amp; parsedData.length &gt; 0 &amp;&amp; (
          &lt;div className="bg-white rounded-xl shadow-lg p-6 border border-cyan-100"&gt;
            &lt;div className="flex items-center justify-between mb-6"&gt;
              &lt;h2 className="text-xl font-semibold text-gray-800"&gt;
                3. 数据预览与编辑
              &lt;/h2&gt;
              &lt;div className="flex gap-3"&gt;
                &lt;button
                  onClick={handleAddRow}
                  className="px-4 py-2 border border-teal-600 text-teal-600 rounded-lg hover:bg-teal-50 transition-colors"
                &gt;
                  + 新增空行
                &lt;/button&gt;
                &lt;button
                  onClick={handleExportExcel}
                  className="px-4 py-2 border border-gray-300 text-gray-700 rounded-lg hover:bg-gray-50 transition-colors"
                &gt;
                  📊 导出Excel
                &lt;/button&gt;
              &lt;/div&gt;
            &lt;/div&gt;
            
            {errors.length &gt; 0 &amp;&amp; (
              &lt;div className="bg-red-50 border border-red-200 rounded-lg p-4 mb-6"&gt;
                &lt;h3 className="font-semibold text-red-800 mb-3 flex items-center"&gt;
                  &lt;span className="mr-2"&gt;⚠️&lt;/span&gt;
                  发现 {errors.length} 个问题（需修正后才能提交）
                &lt;/h3&gt;
                &lt;div className="space-y-2 max-h-40 overflow-y-auto"&gt;
                  {errors.map((err, idx) =&gt; (
                    &lt;div key={idx} className="text-sm text-red-700 bg-red-100 rounded px-3 py-2"&gt;
                      第 {err.rowIndex} 行：{err.message}
                    &lt;/div&gt;
                  ))}
                &lt;/div&gt;
              &lt;/div&gt;
            )}

            &lt;div className="overflow-x-auto border rounded-lg"&gt;
              &lt;table className="w-full text-sm"&gt;
                &lt;thead className="bg-teal-600 text-white sticky top-0"&gt;
                  &lt;tr&gt;
                    &lt;th className="p-3 text-left font-semibold w-16"&gt;序号&lt;/th&gt;
                    &lt;th className="p-3 text-left font-semibold"&gt;外部编码&lt;/th&gt;
                    &lt;th className="p-3 text-left font-semibold"&gt;收货门店&lt;/th&gt;
                    &lt;th className="p-3 text-left font-semibold"&gt;收件人姓名&lt;/th&gt;
                    &lt;th className="p-3 text-left font-semibold"&gt;收件人电话&lt;/th&gt;
                    &lt;th className="p-3 text-left font-semibold"&gt;收件人地址&lt;/th&gt;
                    &lt;th className="p-3 text-left font-semibold"&gt;SKU编码&lt;/th&gt;
                    &lt;th className="p-3 text-left font-semibold"&gt;SKU名称&lt;/th&gt;
                    &lt;th className="p-3 text-left font-semibold"&gt;数量&lt;/th&gt;
                    &lt;th className="p-3 text-left font-semibold"&gt;规格型号&lt;/th&gt;
                    &lt;th className="p-3 text-left font-semibold"&gt;备注&lt;/th&gt;
                    &lt;th className="p-3 text-center font-semibold w-20"&gt;操作&lt;/th&gt;
                  &lt;/tr&gt;
                &lt;/thead&gt;
                &lt;tbody className="divide-y"&gt;
                  {parsedData.map((row, idx) =&gt; {
                    const hasError = row.errors &amp;&amp; row.errors.length &gt; 0
                    return (
                      &lt;tr key={idx} className={hasError ? 'bg-red-50' : 'hover:bg-gray-50'}&gt;
                        &lt;td className="p-2 text-center text-gray-500"&gt;{idx + 1}&lt;/td&gt;
                        &lt;td className="p-2"&gt;
                          &lt;input
                            type="text"
                            value={row.externalCode || ''}
                            onChange={(e) =&gt; handleCellChange(idx, 'externalCode', e.target.value)}
                            className="w-full px-2 py-1 border rounded focus:ring-1 focus:ring-teal-500"
                            placeholder="外部编码"
                          /&gt;
                        &lt;/td&gt;
                        &lt;td className="p-2"&gt;
                          &lt;input
                            type="text"
                            value={row.storeName || ''}
                            onChange={(e) =&gt; handleCellChange(idx, 'storeName', e.target.value)}
                            className="w-full px-2 py-1 border rounded focus:ring-1 focus:ring-teal-500"
                            placeholder="收货门店"
                          /&gt;
                        &lt;/td&gt;
                        &lt;td className="p-2"&gt;
                          &lt;input
                            type="text"
                            value={row.recipientName || ''}
                            onChange={(e) =&gt; handleCellChange(idx, 'recipientName', e.target.value)}
                            className="w-full px-2 py-1 border rounded focus:ring-1 focus:ring-teal-500"
                            placeholder="姓名"
                          /&gt;
                        &lt;/td&gt;
                        &lt;td className="p-2"&gt;
                          &lt;input
                            type="text"
                            value={row.recipientPhone || ''}
                            onChange={(e) =&gt; handleCellChange(idx, 'recipientPhone', e.target.value)}
                            className="w-full px-2 py-1 border rounded focus:ring-1 focus:ring-teal-500"
                            placeholder="电话"
                          /&gt;
                        &lt;/td&gt;
                        &lt;td className="p-2"&gt;
                          &lt;input
                            type="text"
                            value={row.recipientAddress || ''}
                            onChange={(e) =&gt; handleCellChange(idx, 'recipientAddress', e.target.value)}
                            className="w-full px-2 py-1 border rounded focus:ring-1 focus:ring-teal-500"
                            placeholder="地址"
                          /&gt;
                        &lt;/td&gt;
                        &lt;td className="p-2"&gt;
                          &lt;input
                            type="text"
                            value={row.skuCode}
                            onChange={(e) =&gt; handleCellChange(idx, 'skuCode', e.target.value)}
                            className={`w-full px-2 py-1 border rounded focus:ring-1 focus:ring-teal-500 ${hasError &amp;&amp; !row.skuCode ? 'border-red-500 bg-red-100' : ''}`}
                            placeholder="SKU编码"
                          /&gt;
                        &lt;/td&gt;
                        &lt;td className="p-2"&gt;
                          &lt;input
                            type="text"
                            value={row.skuName}
                            onChange={(e) =&gt; handleCellChange(idx, 'skuName', e.target.value)}
                            className={`w-full px-2 py-1 border rounded focus:ring-1 focus:ring-teal-500 ${hasError &amp;&amp; !row.skuName ? 'border-red-500 bg-red-100' : ''}`}
                            placeholder="SKU名称"
                          /&gt;
                        &lt;/td&gt;
                        &lt;td className="p-2"&gt;
                          &lt;input
                            type="number"
                            value={row.quantity}
                            onChange={(e) =&gt; handleCellChange(idx, 'quantity', parseInt(e.target.value))}
                            className={`w-24 px-2 py-1 border rounded focus:ring-1 focus:ring-teal-500 ${hasError &amp;&amp; (!row.quantity || row.quantity &lt;= 0) ? 'border-red-500 bg-red-100' : ''}`}
                          /&gt;
                        &lt;/td&gt;
                        &lt;td className="p-2"&gt;
                          &lt;input
                            type="text"
                            value={row.specification || ''}
                            onChange={(e) =&gt; handleCellChange(idx, 'specification', e.target.value)}
                            className="w-full px-2 py-1 border rounded focus:ring-1 focus:ring-teal-500"
                            placeholder="规格"
                          /&gt;
                        &lt;/td&gt;
                        &lt;td className="p-2"&gt;
                          &lt;input
                            type="text"
                            value={row.remarks || ''}
                            onChange={(e) =&gt; handleCellChange(idx, 'remarks', e.target.value)}
                            className="w-full px-2 py-1 border rounded focus:ring-1 focus:ring-teal-500"
                            placeholder="备注"
                          /&gt;
                        &lt;/td&gt;
                        &lt;td className="p-2 text-center"&gt;
                          &lt;button
                            onClick={() =&gt; handleDeleteRow(idx)}
                            className="text-red-600 hover:text-red-700 px-2 py-1 rounded hover:bg-red-100"
                            title="删除行"
                          &gt;
                            🗑️
                          &lt;/button&gt;
                        &lt;/td&gt;
                      &lt;/tr&gt;
                    )
                  })}
                &lt;/tbody&gt;
              &lt;/table&gt;
            &lt;/div&gt;

            &lt;div className="mt-6 flex justify-between items-center"&gt;
              &lt;div className="text-sm text-gray-600"&gt;
                共 {parsedData.length} 条数据
                {errors.length &gt; 0 &amp;&amp; (
                  &lt;span className="ml-4 text-red-600"&gt;
                    {errors.length} 条有错误
                  &lt;/span&gt;
                )}
              &lt;/div&gt;
              
              &lt;div className="flex gap-3"&gt;
                &lt;button
                  onClick={() =&gt; { setShowPreview(false); setParsedData([]); setErrors([]); }}
                  className="px-6 py-2 border border-gray-300 rounded-lg hover:bg-gray-50 transition-colors"
                &gt;
                  返回
                &lt;/button&gt;
                &lt;button
                  onClick={handleSubmit}
                  disabled={submitting || parsedData.some(row =&gt; row.errors &amp;&amp; row.errors.length &gt; 0)}
                  className={`px-8 py-2 rounded-lg text-white font-semibold transition-all
                    ${submitting || parsedData.some(row =&gt; row.errors &amp;&amp; row.errors.length &gt; 0)
                      ? 'bg-gray-400 cursor-not-allowed' 
                      : 'bg-teal-600 hover:bg-teal-700'
                    }
                  `}
                &gt;
                  {submitting ? (
                    &lt;span className="flex items-center gap-2"&gt;
                      &lt;svg className="animate-spin h-4 w-4" fill="none" viewBox="0 0 24 24"&gt;
                        &lt;circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" fill="none" /&gt;
                        &lt;path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" /&gt;
                      &lt;/svg&gt;
                      提交中...
                    &lt;/span&gt;
                  ) : (
                    '✅ 提交下单'
                  )}
                &lt;/button&gt;
              &lt;/div&gt;
            &lt;/div&gt;
          &lt;/div&gt;
        )}
      &lt;/div&gt;
    &lt;/div&gt;
  )
}
