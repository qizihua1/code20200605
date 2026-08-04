# V2 异步导入 API 接口文档

## 基础信息

- **Base URL**: `https://code20200605.vercel.app`
- **本地开发**: `http://localhost:3000`
- **Content-Type**: `multipart/form-data` (上传), `application/json` (其他)

---

## 1. 上传接口

### POST /api/import-tasks

创建异步导入任务，接收文件后立即返回 task_id。

**请求参数**

| 参数 | 类型 | 必填 | 说明 |
|------|------|------|------|
| file | File | 是 | 待导入的 Excel 文件 |
| ruleId | string | 否 | 解析规则 ID，不传则使用智能解析 |

**响应示例**

```json
{
  "task_id": "task_20260804001",
  "trace_id": "trace_20260804001",
  "status": "PENDING",
  "total_rows": 10000,
  "total_batches": 10
}
```

**响应字段说明**

| 字段 | 类型 | 说明 |
|------|------|------|
| task_id | string | 唯一任务标识 |
| trace_id | string | 链路追踪 ID |
| status | string | 初始状态，固定为 `PENDING` |
| total_rows | number | 识别出的总行数 |
| total_batches | number | 拆分的处理单元数 |

**错误响应**

```json
{
  "error": "创建导入任务失败",
  "details": "解析规则不存在"
}
```

| HTTP 状态码 | 说明 |
|-------------|------|
| 400 | 缺少文件参数 |
| 500 | 服务器内部错误 |

---

## 2. 查询任务进度

### GET /api/import-tasks/:taskId

查询指定任务的实时进度和状态。

**路径参数**

| 参数 | 类型 | 说明 |
|------|------|------|
| taskId | string | 任务 ID |

**响应示例**

```json
{
  "task_id": "task_20260804001",
  "trace_id": "trace_20260804001",
  "status": "PROCESSING",
  "total_rows": 10000,
  "processed_rows": 6000,
  "success_rows": 5988,
  "failed_rows": 12,
  "total_batches": 10,
  "completed_batches": 6,
  "degraded": false,
  "elapsed_seconds": 15,
  "rows_per_second": 400.0,
  "estimated_seconds_remaining": 10,
  "batches": [
    {
      "id": "batch_001",
      "unitId": "unit_0",
      "batchIndex": 0,
      "status": "COMPLETED",
      "startRow": 1,
      "endRow": 1000,
      "retryCount": 0
    }
  ],
  "created_at": "2026-08-04T10:00:00.000Z",
  "completed_at": null
}
```

**状态说明**

| 状态 | 说明 |
|------|------|
| PENDING | 等待队列处理 |
| PROCESSING | 处理中 |
| COMPLETED | 全部成功 |
| PARTIAL_SUCCESS | 部分成功，有失败行 |
| FAILED | 任务失败 |

**错误响应**

| HTTP 状态码 | 说明 |
|-------------|------|
| 404 | 任务不存在 |

---

## 3. 查询错误明细

### GET /api/import-tasks/:taskId/errors

分页查询任务的行级错误明细。

**路径参数**

| 参数 | 类型 | 说明 |
|------|------|------|
| taskId | string | 任务 ID |

**查询参数**

| 参数 | 类型 | 必填 | 说明 |
|------|------|------|------|
| batch | number | 否 | 按批次号筛选 |
| error_code | string | 否 | 按错误码筛选 |
| page | number | 否 | 页码，默认 1 |
| page_size | number | 否 | 每页数量，默认 50 |

**响应示例**

```json
{
  "total": 150,
  "page": 1,
  "page_size": 50,
  "errors": [
    {
      "row_number": 15,
      "batch_index": 0,
      "field_name": "skuCode",
      "error_code": "E001",
      "error_reason": "SKU编码 SKU_99999 不存在于主数据中",
      "raw_value": "SKU_9***99",
      "trace_id": "trace_20260804001",
      "created_at": "2026-08-04T10:00:05.000Z"
    }
  ]
}
```

**错误码说明**

| 错误码 | 含义 |
|--------|------|
| E001 | SKU 不存在 |
| E002 | 必填字段缺失 |
| E003 | 电话格式错误 |
| E004 | 数量不是正数 |
| E005 | 外部编码重复 |
| E006 | 规则映射失败 |
| E007 | 数据库写入失败 |
| E008 | 文件格式不支持 |

---

## 4. 查询批次详情

### GET /api/import-tasks/:taskId/batches

查询任务的所有批次详情和性能指标。

**路径参数**

| 参数 | 类型 | 说明 |
|------|------|------|
| taskId | string | 任务 ID |

**响应示例**

```json
{
  "task_id": "task_20260804001",
  "summary": {
    "total": 10,
    "pending": 0,
    "processing": 0,
    "completed": 10,
    "failed": 0,
    "avgDurationMs": 3200
  },
  "batches": [
    {
      "unit_id": "unit_0",
      "batch_index": 0,
      "start_row": 1,
      "end_row": 1000,
      "status": "COMPLETED",
      "retry_count": 0,
      "performance": {
        "parse_ms": 500,
        "rule_ms": 10,
        "validate_ms": 1500,
        "insert_ms": 800,
        "total_ms": 3200
      }
    }
  ]
}
```

---

## 5. Trace 搜索

### GET /api/traces/:traceId

按 trace_id 查询完整链路事件时间线。

**路径参数**

| 参数 | 类型 | 说明 |
|------|------|------|
| traceId | string | 链路追踪 ID |

**响应示例**

```json
{
  "trace_id": "trace_20260804001",
  "events": [
    {
      "event_name": "ImportTaskCreated",
      "event_status": "SUCCESS",
      "message": "任务创建成功，共 10 个批次",
      "task_id": "task_20260804001",
      "unit_id": null,
      "occurred_at": "2026-08-04T10:00:00.000Z"
    },
    {
      "event_name": "ImportBatchStarted",
      "event_status": "SUCCESS",
      "message": "批次 unit_0 开始处理",
      "task_id": "task_20260804001",
      "unit_id": "unit_0",
      "occurred_at": "2026-08-04T10:00:02.000Z"
    }
  ]
}
```

---

## 6. 监控聚合

### GET /api/import-monitor/summary

获取系统实时监控数据。

**响应示例**

```json
{
  "timestamp": "2026-08-04T10:05:00.000Z",
  "throughput": {
    "current_rates": [100, 200, 300, 250, 180],
    "unit": "rows/minute"
  },
  "queue_depth": {
    "pending_batches": 0,
    "pending_rows": 0,
    "status": "NORMAL"
  },
  "stage_latency": {
    "parse_p50": 500,
    "parse_p95": 1200,
    "rule_p50": 10,
    "rule_p95": 50,
    "validate_p50": 1500,
    "validate_p95": 3000,
    "insert_p50": 800,
    "insert_p95": 2000
  },
  "error_distribution": [
    { "error_code": "E001", "count": 45 },
    { "error_code": "E002", "count": 30 },
    { "error_code": "E003", "count": 20 },
    { "error_code": "E004", "count": 10 }
  ],
  "active_tasks": 1,
  "completed_tasks_today": 25,
  "failed_tasks_today": 2
}
```

**队列状态说明**

| 状态 | 说明 |
|------|------|
| NORMAL | 积压正常 |
| WARNING | 积压超过 5000 行 |
| CRITICAL | 队列不可用 |

---

## 7. Outbox 分发

### POST /api/outbox/dispatch

手动触发 Outbox 事件分发（通常由 Vercel Cron 自动调用）。

**请求体**: 无

**响应示例**

```json
{
  "dispatched_count": 5,
  "failed_count": 0,
  "timestamp": "2026-08-04T10:05:00.000Z"
}
```

---

## 8. Worker 批处理

### POST /api/worker/batch

Worker 消费单个批次任务的入口（由 QStash 调用）。

**请求体**

```json
{
  "task_id": "task_20260804001",
  "unit_id": "unit_0",
  "batch_index": 0,
  "storage_key": "imports/task_20260804001/test.xlsx",
  "rule_id": "rule_001",
  "start_row": 1,
  "end_row": 1000
}
```

**响应示例**

```json
{
  "success": true,
  "processed": 1000,
  "errors": 12,
  "duration_ms": 3200
}
```

---

## 9. 接口调用示例

### 9.1 上传文件 (cURL)

```bash
curl -X POST https://code20200605.vercel.app/api/import-tasks \
  -F "file=@orders.xlsx" \
  -F "ruleId=rule_001"
```

### 9.2 查询进度 (cURL)

```bash
curl https://code20200605.vercel.app/api/import-tasks/task_20260804001
```

### 9.3 查询错误 (cURL)

```bash
curl "https://code20200605.vercel.app/api/import-tasks/task_20260804001/errors?error_code=E001&page=1&page_size=20"
```

### 9.4 前端轮询示例

```javascript
async function pollTaskProgress(taskId) {
  while (true) {
    const response = await fetch(`/api/import-tasks/${taskId}`);
    const data = await response.json();
    
    updateProgressUI(data);
    
    if (['COMPLETED', 'PARTIAL_SUCCESS', 'FAILED'].includes(data.status)) {
      return data;
    }
    
    await new Promise(resolve => setTimeout(resolve, 1500));
  }
}
```
