import * as fs from 'fs'
import * as path from 'path'
import { execSync } from 'child_process'

const API_BASE = process.env.API_BASE || 'http://localhost:3000'
const TEST_DATA_DIR = path.join(process.cwd(), 'test-data')
const RESULTS_DIR = path.join(process.cwd(), 'stress-test-results')

interface TestResult {
  test: string
  startTime: number
  endTime: number
  durationMs: number
  success: boolean
  details?: any
}

async function sleep(ms: number) {
  return new Promise(resolve => setTimeout(resolve, ms))
}

async function uploadFile(filePath: string, ruleId?: string): Promise<{ taskId: string; traceId: string; uploadTimeMs: number }> {
  const startTime = Date.now()
  
  const formData = new FormData()
  const fileBuffer = fs.readFileSync(filePath)
  const fileBlob = new Blob([fileBuffer])
  formData.append('file', fileBlob, path.basename(filePath))
  if (ruleId) {
    formData.append('ruleId', ruleId)
  }
  
  const response = await fetch(`${API_BASE}/api/import-tasks`, {
    method: 'POST',
    body: formData,
  })
  
  const data = await response.json()
  const uploadTimeMs = Date.now() - startTime
  
  if (!response.ok) {
    throw new Error(`上传失败: ${JSON.stringify(data)}`)
  }
  
  return {
    taskId: data.task_id,
    traceId: data.trace_id,
    uploadTimeMs,
  }
}

async function pollTaskProgress(taskId: string, maxWaitMs: number): Promise<any> {
  const startTime = Date.now()
  const pollInterval = 2000
  
  while (Date.now() - startTime < maxWaitMs) {
    const response = await fetch(`${API_BASE}/api/import-tasks/${taskId}`)
    const data = await response.json()
    
    if (data.status === 'COMPLETED' || data.status === 'PARTIAL_SUCCESS' || data.status === 'FAILED') {
      return data
    }
    
    await sleep(pollInterval)
  }
  
  throw new Error(`任务超时: ${maxWaitMs}ms`)
}

async function runStressTest() {
  console.log('=== V2 异步导入压测报告 ===\n')
  console.log(`测试时间: ${new Date().toISOString()}`)
  console.log(`API 地址: ${API_BASE}`)
  console.log('')
  
  if (!fs.existsSync(TEST_DATA_DIR)) {
    console.error('错误: 请先运行 npm run seed-data 生成测试数据')
    process.exit(1)
  }
  
  if (!fs.existsSync(RESULTS_DIR)) {
    fs.mkdirSync(RESULTS_DIR, { recursive: true })
  }
  
  const results: TestResult[] = []
  
  const testFiles = [
    { file: 'orders_1k.xlsx', rows: 1000 },
    { file: 'orders_5k.xlsx', rows: 5000 },
    { file: 'orders_10k.xlsx', rows: 10000 },
  ]
  
  console.log('--- 测试 1: 文件上传响应时间 ---')
  
  for (const testFile of testFiles) {
    const filePath = path.join(TEST_DATA_DIR, testFile.file)
    if (!fs.existsSync(filePath)) {
      console.log(`  跳过 ${testFile.file} (文件不存在)`)
      continue
    }
    
    console.log(`\n  测试文件: ${testFile.file} (${testFile.rows} 行)`)
    
    try {
      const { taskId, traceId, uploadTimeMs } = await uploadFile(filePath)
      console.log(`    上传响应时间: ${uploadTimeMs}ms`)
      console.log(`    任务ID: ${taskId}`)
      console.log(`    TraceID: ${traceId}`)
      
      if (uploadTimeMs > 1000) {
        console.log(`    ⚠️  警告: 上传时间超过 1s`)
      }
      
      results.push({
        test: `upload_${testFile.rows}rows`,
        startTime: Date.now(),
        endTime: Date.now(),
        durationMs: uploadTimeMs,
        success: true,
        details: { taskId, traceId },
      })
      
    } catch (error: any) {
      console.log(`    ❌ 失败: ${error.message}`)
      results.push({
        test: `upload_${testFile.rows}rows`,
        startTime: Date.now(),
        endTime: Date.now(),
        durationMs: 0,
        success: false,
        details: { error: error.message },
      })
    }
  }
  
  console.log('\n--- 测试 2: 任务处理完成时间 ---')
  
  const largeFile = path.join(TEST_DATA_DIR, 'orders_10k.xlsx')
  if (fs.existsSync(largeFile)) {
    console.log('\n  测试 10,000 行文件完整处理流程...')
    
    try {
      const { taskId, uploadTimeMs } = await uploadFile(largeFile)
      console.log(`    上传响应: ${uploadTimeMs}ms`)
      
      const completionStart = Date.now()
      const taskResult = await pollTaskProgress(taskId, 120000)
      const completionTimeMs = Date.now() - completionStart
      
      console.log(`    任务完成时间: ${completionTimeMs}ms`)
      console.log(`    最终状态: ${taskResult.status}`)
      console.log(`    处理行数: ${taskResult.processed_rows}/${taskResult.total_rows}`)
      console.log(`    成功/失败: ${taskResult.success_rows}/${taskResult.failed_rows}`)
      console.log(`    平均速率: ${taskResult.rows_per_second} rows/s`)
      
      results.push({
        test: `complete_10k_rows`,
        startTime: completionStart,
        endTime: Date.now(),
        durationMs: completionTimeMs,
        success: taskResult.status !== 'FAILED',
        details: taskResult,
      })
      
    } catch (error: any) {
      console.log(`    ❌ 失败: ${error.message}`)
      results.push({
        test: 'complete_10k_rows',
        startTime: Date.now(),
        endTime: Date.now(),
        durationMs: 0,
        success: false,
        details: { error: error.message },
      })
    }
  }
  
  console.log('\n--- 测试 3: 监控 API 可用性 ---')
  
  try {
    const monitorResponse = await fetch(`${API_BASE}/api/import-monitor/summary`)
    const monitorData = await monitorResponse.json()
    
    console.log(`    监控 API 响应: ${monitorResponse.status}`)
    console.log(`    当前任务数: ${monitorData.activeTasks || 0}`)
    console.log(`    系统状态: 正常`)
    
    results.push({
      test: 'monitor_api',
      startTime: Date.now(),
      endTime: Date.now(),
      durationMs: 0,
      success: true,
      details: monitorData,
    })
    
  } catch (error: any) {
    console.log(`    ❌ 失败: ${error.message}`)
    results.push({
      test: 'monitor_api',
      startTime: Date.now(),
      endTime: Date.now(),
      durationMs: 0,
      success: false,
    })
  }
  
  console.log('\n--- 测试结果汇总 ---')
  console.log('')
  
  const passed = results.filter(r => r.success).length
  const failed = results.filter(r => !r.success).length
  
  results.forEach(r => {
    const status = r.success ? '✅' : '❌'
    const duration = r.durationMs > 0 ? `${r.durationMs}ms` : 'N/A'
    console.log(`  ${status} ${r.test}: ${duration}`)
  })
  
  console.log('')
  console.log(`通过: ${passed}/${results.length}`)
  console.log(`失败: ${failed}/${results.length}`)
  
  if (failed > 0) {
    console.log('\n⚠️  部分测试失败，请检查日志')
  } else {
    console.log('\n✅ 所有测试通过!')
  }
  
  const report = {
    timestamp: new Date().toISOString(),
    apiBase: API_BASE,
    summary: { passed, failed, total: results.length },
    results,
  }
  
  const reportFile = path.join(RESULTS_DIR, `stress-report-${Date.now()}.json`)
  fs.writeFileSync(reportFile, JSON.stringify(report, null, 2))
  console.log(`\n详细报告已保存: ${reportFile}`)
}

runStressTest().catch(console.error)
