# V2 异步事件驱动架构设计文档

## 1. 架构概览

### 1.1 整体架构图

```
┌─────────────────────────────────────────────────────────────────┐
│                        客户端 / 前端                              │
│  ┌─────────┐  ┌─────────┐  ┌─────────┐  ┌─────────┐            │
│  │ 上传页面 │  │ 任务页面 │  │ 监控看板 │  │ Trace检索 │            │
│  └─────────┘  └─────────┘  └─────────┘  └─────────┘            │
└─────────────────────────────────────────────────────────────────┘
                              │
                              ▼
┌─────────────────────────────────────────────────────────────────┐
│                      API 路由层 (Serverless)                     │
│  ┌─────────────────────────────────────────────────────────┐     │
│  │  POST /api/import-tasks                                 │     │
│  │  GET  /api/import-tasks/:taskId                         │     │
│  │  GET  /api/import-tasks/:taskId/errors                  │     │
│  │  GET  /api/import-tasks/:taskId/batches                 │     │
│  │  GET  /api/import-monitor/summary                       │     │
│  │  GET  /api/traces/:traceId                              │     │
│  │  POST /api/outbox/dispatch                              │     │
│  │  POST /api/worker/batch                                 │     │
│  └─────────────────────────────────────────────────────────┘     │
└─────────────────────────────────────────────────────────────────┘
                              │
                              ▼
┌─────────────────────────────────────────────────────────────────┐
│                      业务逻辑层 (Services)                       │
│  ┌─────────────┐ ┌─────────────┐ ┌─────────────┐               │
│  │ TaskService │ │ BatchProcessor│ │ OutboxDispatcher│            │
│  └─────────────┘ └─────────────┘ └─────────────┘               │
│  ┌─────────────┐ ┌─────────────┐ ┌─────────────┐               │
│  │ FileStorage │ │ TraceService │ │ ErrorHandler │               │
│  └─────────────┘ └─────────────┘ └─────────────┘               │
└─────────────────────────────────────────────────────────────────┘
                              │
                              ▼
┌─────────────────────────────────────────────────────────────────┐
│                      数据持久层 (Prisma ORM)                     │
│  ┌─────────────────────────────────────────────────────────┐     │
│  │                    PostgreSQL (Neon)                     │     │
│  └─────────────────────────────────────────────────────────┘     │
└─────────────────────────────────────────────────────────────────┘
                              │
                              ▼
┌─────────────────────────────────────────────────────────────────┐
│                      消息队列层 (Upstash QStash)                  │
│  ┌─────────────────────────────────────────────────────────┐     │
│  │  Vercel Cron (每分钟) → Outbox Dispatcher → QStash Queue  │     │
│  └─────────────────────────────────────────────────────────┘     │
└─────────────────────────────────────────────────────────────────┘
```

## 2. 核心流程

### 2.1 上传即返回流程

```
用户上传文件
    │
    ▼
POST /api/import-tasks
    │
    ├─ 1. 接收文件和规则ID
    │
    ├─ 2. 生成 task_id 和 trace_id
    │
    ├─ 3. 存储文件到 Vercel Blob (storageKey)
    │
    ├─ 4. 预扫描文件获取总行数
    │
    ├─ 5. 按 BATCH_SIZE(1000) 计算批次数量
    │
    ├─ 6. 开启数据库事务:
    │     ├─ 创建 import_tasks 记录
    │     ├─ 创建 import_task_batches 记录 (N个)
    │     └─ 创建 event_outbox 记录 (N个)
    │
    ├─ 7. 事务提交成功
    │
    ├─ 8. 立即触发 dispatchPendingEvents()
    │
    └─ 9. 返回 task_id, trace_id (响应时间 < 1s)
```

### 2.2 Outbox 可靠投递流程

```
数据库事务提交
    │
    ▼
即时分发 (dispatchPendingEvents)
    │
    ├─ 查询 event_outbox 中 status='PENDING' 的记录
    │
    ├─ 对每条记录:
    │     ├─ 调用 QStash API 投递消息
    │     ├─ 成功: 更新 status='SENT', sent_at=now
    │     └─ 失败: 记录 retry_count++, status='FAILED', next_retry_at
    │
    └─ Vercel Cron 每分钟补发:
          ├─ 查询 status='FAILED' AND next_retry_at <= now
          └─ 重试投递
```

### 2.3 Worker 批处理流程

```
QStash 投递消息到 /api/worker/batch
    │
    ▼
Worker 接收任务
    │
    ├─ 1. 解析 payload 获取 task_id, unit_id, storage_key
    │
    ├─ 2. 查询 import_task_batches 状态
    │     └─ 若 COMPLETED: 直接返回 (幂等)
    │
    ├─ 3. 更新批次状态为 PROCESSING
    │
    ├─ 4. 从 Vercel Blob 下载文件
    │
    ├─ 5. 复用 V2 规则引擎解析文件
    │
    ├─ 6. 按批次范围提取数据 (start_row ~ end_row)
    │
    ├─ 7. 批量校验:
    │     ├─ 必填字段校验
    │     ├─ 电话号码格式校验
    │     ├─ 数量正数校验
    │     └─ SKU 主数据批量查询
    │
    ├─ 8. 批量写入运单:
    │     ├─ 按 externalCode 分组
    │     ├─ 批量创建 Shipment + Items
    │     └─ 失败行写入 import_task_errors
    │
    ├─ 9. 写入 batch_performance_log
    │
    ├─ 10. 更新任务进度 (processed_rows, success_rows, failed_rows)
    │
    ├─ 11. 检查是否所有批次完成
    │     ├─ 是: 更新任务状态为 COMPLETED/PARTIAL_SUCCESS
    │     └─ 否: 等待其他批次
    │
    └─ 12. 记录 Trace 事件
```

## 3. 数据模型

### 3.1 实体关系图

```
┌─────────────────────┐       1:N       ┌─────────────────────────┐
│     ImportTask      │─────────────────▶│   ImportTaskBatch       │
│  (导入任务主表)       │                 │   (批次状态表)           │
├─────────────────────┤                 ├─────────────────────────┤
│ task_id (PK, UK)    │                 │ task_id + unit_id (UK) │
│ trace_id            │                 │ batch_index             │
│ file_name           │                 │ start_row, end_row      │
│ file_size           │                 │ status                  │
│ storage_key         │                 │ retry_count             │
│ status              │                 │ locked_at               │
│ total_rows          │                 │ completed_at            │
│ processed_rows      │                 └─────────────────────────┘
│ success_rows        │                           │
│ failed_rows         │                           │ 1:N
│ total_batches       │                           ▼
│ completed_batches   │                 ┌─────────────────────────┐
│ degraded            │                 │   ImportTaskError       │
│ rule_id             │                 │   (错误明细表)           │
└─────────────────────┘                 ├─────────────────────────┤
                                        │ task_id + unit_id      │
                                        │ row_number             │
                                        │ field_name             │
                                        │ error_code             │
                                        │ error_reason           │
                                        │ raw_value              │
                                        └─────────────────────────┘

┌─────────────────────┐       1:N       ┌─────────────────────────┐
│     EventOutbox     │─────────────────▶│   ImportTaskBatch       │
│  (可靠事件表)         │                 │   (批次状态表)           │
├─────────────────────┤                 └─────────────────────────┘
│ id (PK)             │
│ aggregate_id        │                          │
│ event_type          │                          │ 1:1
│ payload (JSON)      │                          ▼
│ status              │                 ┌─────────────────────────┐
│ retry_count         │                 │  BatchPerformanceLog    │
│ next_retry_at       │                 │  (性能日志表)            │
│ sent_at             │                 ├─────────────────────────┤
│ created_at          │                 │ task_id + unit_id (UK) │
└─────────────────────┘                 │ parse_duration_ms      │
                                        │ rule_duration_ms       │
                                        │ validate_duration_ms   │
                                        │ insert_duration_ms     │
                                        │ total_duration_ms      │
                                        │ status                 │
                                        └─────────────────────────┘

┌─────────────────────┐
│    TraceEvent       │
│  (链路事件表)         │
├─────────────────────┤
│ trace_id            │
│ task_id             │
│ unit_id             │
│ event_name          │
│ event_status        │
│ message             │
│ occurred_at         │
└─────────────────────┘
```

### 3.2 状态流转

#### 任务状态
```
PENDING ──▶ PROCESSING ──▶ COMPLETED
                          └──▶ PARTIAL_SUCCESS
                          └──▶ FAILED
```

#### 批次状态
```
PENDING ──▶ PROCESSING ──▶ COMPLETED
                       └──▶ FAILED (可重试)
```

#### Outbox 状态
```
PENDING ──▶ SENT
         └──▶ FAILED ──▶ (重试后) ──▶ SENT
```

## 4. 批量处理策略

### 4.1 处理单元设计

- **批次大小**: 1000 行/批
- **设计理由**:
  - 太小 (<500): 事务开销增加，数据库连接次数增多
  - 太大 (>2000): 单批次处理时间过长，超出 Serverless 函数限制
  - 1000 行/批: 平衡处理速度和资源占用

### 4.2 批量优化点

| 优化点 | 方式 | 预期收益 |
|--------|------|----------|
| SKU 校验 | `Promise.all` 并发查询 | 减少 80% 查询时间 |
| 数据写入 | 按 externalCode 分组批量写入 | 减少 90% 写入次数 |
| 错误记录 | `createMany` + `skipDuplicates` | 批量插入，去重 |
| 文件解析 | 缓存解析结果，批次切片 | 避免重复解析 |

## 5. 容灾设计

### 5.1 SKU 校验降级

```
SKU 批量校验开始
    │
    ▼
发起 Promise.all 查询 (N 个 SKU)
    │
    ├─ 成功: 正常处理
    │
    └─ 超时/异常:
         ├─ 标记 task.degraded = true
         ├─ 跳过 SKU 校验
         ├─ 写入 Trace 事件 (WARNING)
         └─ 前端显示降级提示
```

### 5.2 Outbox 恢复

```
Vercel Cron (每分钟)
    │
    ▼
查询 status='FAILED' AND next_retry_at <= now
    │
    ├─ 有记录: 重新投递
    │     ├─ 成功: status='SENT'
    │     └─ 失败: retry_count++
    │
    └─ 无记录: 跳过
```

### 5.3 批次幂等

```
Worker 收到批次处理请求
    │
    ▼
查询 import_task_batches
    │
    ├─ status='COMPLETED': 直接返回成功 (已处理)
    │
    ├─ status='PROCESSING': 返回跳过 (正在处理)
    │
    └─ status='PENDING' / 'FAILED': 开始处理
```

## 6. 可观测性设计

### 6.1 监控看板指标

| 指标 | 数据来源 | 展示方式 |
|------|----------|----------|
| 实时吞吐量 | import_tasks + batch_performance_log | 折线图 (按分钟) |
| 队列积压深度 | event_outbox (PENDING 状态) | 数值 + 预警 |
| 阶段耗时 P50/P95 | batch_performance_log | 柱状图 |
| 错误类型分布 | import_task_errors | 饼图 |

### 6.2 Trace 搜索

支持按以下条件搜索:
- task_id
- trace_id
- 文件名
- 批次号
- 错误码

时间线事件示例:
```
10:00:00  用户上传文件，生成 task_id=task_001
10:00:00  创建 10 个批次 Outbox 事件
10:00:01  批次 unit_000 入队
10:00:02  Worker 开始处理 unit_000
10:00:04  unit_000 校验完成，发现 5 行错误
10:00:05  unit_000 完成批量写入，耗时 3000ms
10:00:06  批次进度更新: 1000/10000 行
...
10:00:30  所有批次完成，任务状态: COMPLETED
```

## 7. 部署架构

### 7.1 Vercel 配置

```
Vercel Project: code20200605
    │
    ├─ Serverless Functions (API Routes)
    │     ├─ /api/import-tasks
    │     ├─ /api/worker/batch
    │     ├─ /api/outbox/dispatch
    │     └─ ...
    │
    ├─ Cron Jobs
    │     └─ /api/outbox/dispatch (Every 1 minute)
    │
    └─ Environment Variables
          ├─ DATABASE_URL (Neon PostgreSQL)
          ├─ QSTASH_TOKEN (Upstash QStash)
          ├─ BLOB_READ_WRITE_TOKEN (Vercel Blob)
          └─ VERCEL=true
```

### 7.2 外部服务

| 服务 | 用途 | 限制 |
|------|------|------|
| Neon PostgreSQL | 主数据库 | Serverless 连接池 |
| Upstash QStash | 消息队列 | 单消息 256KB |
| Vercel Blob | 文件存储 | CDN 加速 |

## 8. 性能推导

### 8.1 单任务耗时估算

| 阶段 | 耗时 | 说明 |
|------|------|------|
| 文件上传 | < 1s | API 响应时间 |
| Outbox 分发 | < 1s | 即时 + 定时双分发 |
| 文件下载 (Worker) | < 2s | Vercel Blob CDN |
| 规则解析 | < 3s | 复用 V2 引擎 |
| SKU 批量校验 | < 5s | Promise.all 并发 |
| 批量写入 | < 2s | 分组批量事务 |
| 单批次合计 | < 12s | 1000 行/批 |
| 10 批次并行 | < 12s | 并发处理 |

**总耗时**: < 15s (远低于 60s 目标)

### 8.2 并发能力

- QStash 并发: 10 个 Worker 同时消费
- 数据库连接池: 50 个连接
- 理论吞吐: ~10,000 行/12s ≈ 833 行/秒
