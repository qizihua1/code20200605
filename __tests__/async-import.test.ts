import { describe, it, expect, beforeEach, vi } from 'vitest'
import { createImportTask, getImportTask, updateTaskProgress } from '../lib/task-service'
import { prisma } from '../lib/prisma'

vi.mock('../lib/prisma', () => ({
  prisma: {
    importTask: {
      create: vi.fn(),
      findUnique: vi.fn(),
      update: vi.fn(),
    },
    importTaskBatch: {
      create: vi.fn(),
      findUnique: vi.fn(),
      update: vi.fn(),
    },
    eventOutbox: {
      create: vi.fn(),
    },
    parsingRule: {
      findUnique: vi.fn().mockResolvedValue({ id: 'test-rule', name: '测试规则' }),
    },
    $transaction: vi.fn(),
    skuMaster: {
      findUnique: vi.fn(),
    },
  },
}))

vi.mock('../lib/trace', () => ({
  generateTaskId: () => 'test-task-id-001',
  generateTraceId: () => 'test-trace-id-001',
  generateUnitId: (index: number) => `unit-${index}`,
  logTraceEvent: vi.fn(),
}))

vi.mock('../lib/file-storage', () => ({
  storeFile: vi.fn().mockResolvedValue({ storageKey: 'test-storage-key' }),
  retrieveFile: vi.fn().mockResolvedValue(Buffer.from('test')),
}))

vi.mock('../lib/parser', () => ({
  parseWithRule: vi.fn().mockReturnValue({
    success: true,
    data: Array(10000).fill({
      skuCode: 'SKU_00001',
      skuName: '测试商品',
      quantity: 1,
    }),
  }),
}))

describe('任务创建', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })
  
  it('应该返回有效的 task_id 和 trace_id', async () => {
    const mockTask = {
      taskId: 'test-task-id-001',
      traceId: 'test-trace-id-001',
      fileName: 'test.xlsx',
      fileSize: 100000,
      storageKey: 'test-storage-key',
      status: 'PENDING',
      totalRows: 10000,
      totalBatches: 10,
      ruleId: null,
      createdAt: new Date(),
      completedAt: null,
    }
    
    const mockTx = {
      importTask: { create: vi.fn().mockResolvedValue(mockTask) },
      importTaskBatch: { create: vi.fn().mockResolvedValue({}) },
      eventOutbox: { create: vi.fn().mockResolvedValue({}) },
    }
    
    prisma.$transaction.mockImplementation(async (callback: any) => {
      return callback(mockTx)
    })
    
    const startTime = Date.now()
    
    const result = await createImportTask({
      file: new ArrayBuffer(100000),
      fileName: 'test.xlsx',
      ruleId: 'test-rule',
    })
    
    const duration = Date.now() - startTime
    
    expect(result.task_id).toBe('test-task-id-001')
    expect(result.trace_id).toBe('test-trace-id-001')
    expect(result.status).toBe('PENDING')
    expect(result.total_batches).toBe(10)
    expect(duration).toBeLessThan(1000)
  })
  
  it('应该在同一事务中创建任务、批次和 Outbox 事件', async () => {
    const mockTask = {
      taskId: 'test-task-id-001',
      traceId: 'test-trace-id-001',
      fileName: 'test.xlsx',
      fileSize: 100000,
      storageKey: 'test-storage-key',
      status: 'PENDING',
      totalRows: 10000,
      totalBatches: 10,
      ruleId: null,
      createdAt: new Date(),
      completedAt: null,
    }
    
    const mockTx = {
      importTask: { create: vi.fn().mockResolvedValue(mockTask) },
      importTaskBatch: { create: vi.fn().mockResolvedValue({}) },
      eventOutbox: { create: vi.fn().mockResolvedValue({}) },
    }
    
    prisma.$transaction.mockImplementation(async (callback: any) => {
      return callback(mockTx)
    })
    
    await createImportTask({
      file: new ArrayBuffer(100000),
      fileName: 'test.xlsx',
      ruleId: 'test-rule',
    })
    
    expect(prisma.$transaction).toHaveBeenCalledTimes(1)
    expect(mockTx.importTask.create).toHaveBeenCalledTimes(1)
    expect(mockTx.importTaskBatch.create).toHaveBeenCalledTimes(10)
    expect(mockTx.eventOutbox.create).toHaveBeenCalledTimes(10)
  })
  
  it('应该使用 storageKey 而不是 base64 存储在 Outbox 中', async () => {
    const mockTask = {
      taskId: 'test-task-id-001',
      traceId: 'test-trace-id-001',
      fileName: 'test.xlsx',
      fileSize: 100000,
      storageKey: 'test-storage-key',
      status: 'PENDING',
      totalRows: 10000,
      totalBatches: 10,
      ruleId: null,
      createdAt: new Date(),
      completedAt: null,
    }
    
    const mockTx = {
      importTask: { create: vi.fn().mockResolvedValue(mockTask) },
      importTaskBatch: { create: vi.fn().mockResolvedValue({}) },
      eventOutbox: { create: vi.fn().mockResolvedValue({}) },
    }
    
    prisma.$transaction.mockImplementation(async (callback: any) => {
      return callback(mockTx)
    })
    
    await createImportTask({
      file: new ArrayBuffer(100000),
      fileName: 'test.xlsx',
      ruleId: 'test-rule',
    })
    
    const outboxCall = mockTx.eventOutbox.create.mock.calls[0][0]
    expect(outboxCall.data.payload.storage_key).toBe('test-storage-key')
    expect(outboxCall.data.payload.file_base64).toBeUndefined()
  })
  
  it('没有 ruleId 时应该跳过解析', async () => {
    const mockTask = {
      taskId: 'test-task-id-001',
      traceId: 'test-trace-id-001',
      fileName: 'test.xlsx',
      fileSize: 100000,
      storageKey: 'test-storage-key',
      status: 'PENDING',
      totalRows: 1000,
      totalBatches: 1,
      ruleId: null,
      createdAt: new Date(),
      completedAt: null,
    }
    
    const mockTx = {
      importTask: { create: vi.fn().mockResolvedValue(mockTask) },
      importTaskBatch: { create: vi.fn().mockResolvedValue({}) },
      eventOutbox: { create: vi.fn().mockResolvedValue({}) },
    }
    
    prisma.$transaction.mockImplementation(async (callback: any) => {
      return callback(mockTx)
    })
    
    const result = await createImportTask({
      file: new ArrayBuffer(100000),
      fileName: 'test.xlsx',
    })
    
    expect(result.total_rows).toBeGreaterThan(0)
  })
})

describe('任务进度查询', () => {
  it('应该返回任务完整进度信息', async () => {
    const mockTask = {
      taskId: 'test-task-id-001',
      traceId: 'test-trace-id-001',
      status: 'PROCESSING',
      totalRows: 1000,
      processedRows: 500,
      successRows: 480,
      failedRows: 20,
      totalBatches: 1,
      completedBatches: 0,
      degraded: false,
      createdAt: new Date(),
      completedAt: null,
      batches: [],
    }
    
    prisma.importTask.findUnique.mockResolvedValue(mockTask)
    
    const result = await getImportTask('test-task-id-001')
    
    expect(result).toBeTruthy()
    expect(result!.taskId).toBe('test-task-id-001')
    expect(result!.status).toBe('PROCESSING')
  })
})

describe('批次处理幂等性', () => {
  it('已完成的批次不应重复处理', async () => {
    const mockBatch = {
      taskId: 'test-task-id-001',
      unitId: 'unit-0',
      batchIndex: 0,
      status: 'COMPLETED',
      startRow: 1,
      endRow: 1000,
      retryCount: 0,
    }
    
    prisma.importTaskBatch.findUnique.mockResolvedValue(mockBatch)
    
    const result = await updateTaskProgress('test-task-id-001', 'unit-0', 1000, 990, 10)
    
    expect(result).toBeNull()
  })
  
  it('正在处理的批次不应重复处理', async () => {
    const mockBatch = {
      taskId: 'test-task-id-001',
      unitId: 'unit-0',
      batchIndex: 0,
      status: 'PROCESSING',
      startRow: 1,
      endRow: 1000,
      retryCount: 0,
    }
    
    prisma.importTaskBatch.findUnique.mockResolvedValue(mockBatch)
    
    const result = await updateTaskProgress('test-task-id-001', 'unit-0', 1000, 990, 10)
    
    expect(result).toBeNull()
  })
  
  it('不存在的批次应返回 null', async () => {
    prisma.importTaskBatch.findUnique.mockResolvedValue(null)
    
    const result = await updateTaskProgress('non-existent', 'unit-0', 1000, 990, 10)
    
    expect(result).toBeNull()
  })
})

describe('错误处理', () => {
  it('规则不存在时应抛出错误', async () => {
    prisma.parsingRule.findUnique.mockResolvedValue(null)
    
    await expect(
      createImportTask({
        file: new ArrayBuffer(1000),
        fileName: 'test.xlsx',
        ruleId: 'non-existent-rule',
      })
    ).rejects.toThrow('解析规则不存在')
  })
})
