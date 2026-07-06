# V2 对外 API V1 文档（供 V3 跨系统调用）

## 0. 概述

本文档描述 V2 系统暴露给 V3 系统的 **External API v1**。  
Base Path: `/api/external/v1`

> 老系统二开意识：
> - **版本策略**：所有接口路径以 `/v1/` 开头，后续不兼容升级使用 `/v2/`，旧版本保留至灰度结束。
> - **向后兼容**：响应体只会新增 optional 字段，不删除/重命名/修改既有字段类型。
> - **灰度发布**：`V3_EXTERNAL_API_KEY` 先只配置给 V3 测试环境，观察 3-7 天后再给生产。

---

## 1. 鉴权

所有请求必须在 HTTP Header 中携带：

```
x-api-key: <V3_EXTERNAL_API_KEY>
```

### 1.1 生成 API Key

在 V2 服务器执行：

```bash
openssl rand -hex 32
```

将输出写入 V2 环境变量（`.env.local` 或部署平台 env）：

```
V3_EXTERNAL_API_KEY=xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx
```

### 1.2 鉴权错误码

| HTTP 状态 | code               | 说明                           |
| --------- | ------------------ | ------------------------------ |
| 401       | `API_KEY_MISSING`  | 请求头缺少 `x-api-key`         |
| 401       | `API_KEY_INVALID`  | API Key 不匹配                 |

响应示例（401）：

```json
{
  "error": "Unauthorized",
  "code": "API_KEY_INVALID",
  "requestId": "550e8400-e29b-41d4-a716-446655440000"
}
```

---

## 2. 通用响应与链路追踪

### 2.1 Request ID

- 每个响应的 Header 中携带 `x-request-id: <uuid>`
- 响应 JSON Body 中始终包含 `requestId` 字段
- 出现问题时把 requestId 发给 V2 侧排查

### 2.2 通用错误结构

```json
{
  "error": "<可读错误描述>",
  "code": "<错误码>",
  "message": "<可选，详细信息>",
  "requestId": "<uuid>"
}
```

| HTTP 状态 | 场景                                  |
| --------- | ------------------------------------- |
| 200       | 成功；**资源不存在也是 200**（带 `exists:false`） |
| 400       | 参数校验失败（query/path 格式错）     |
| 401       | 鉴权失败                              |
| 422       | 业务校验失败（运单不存在、body 语义错）|
| 500       | 数据库 / 未知内部错误                 |
| 504       | 接口超时（10s）                       |

### 2.3 超时与重试建议

| 项          | 建议值                        |
| ----------- | ----------------------------- |
| 超时        | 客户端设置 **10 秒**          |
| 重试次数    | 最多 **2 次**                 |
| 退避策略    | 指数退避：1s → 2s             |
| 幂等性      | GET 天然幂等；PATCH 使用 `ticketId` 做业务去重（传相同 ticketId 不重复执行，由调用方保证） |

---

## 3. 接口列表

---

### 3.1 GET `/api/external/v1/shipments` — 运单列表（分页）

**Query 参数**

| 字段         | 类型   | 必填 | 默认 | 范围     | 说明                                   |
| ------------ | ------ | ---- | ---- | -------- | -------------------------------------- |
| `page`       | int    | 否   | 1    | ≥1       | 页码                                   |
| `pageSize`   | int    | 否   | 50   | 1~200    | 每页数量                               |
| `keyword`    | string | 否   | -    | -        | 模糊搜索（运单号/店铺/收件人/手机/地址）|
| `externalCode` | string | 否 | -    | -        | 精确匹配外部运单号                     |

**成功响应 200**

```json
{
  "data": [
    {
      "id": "clx...",
      "externalCode": "V3-2026-0001",
      "storeName": "店铺A",
      "recipientName": "张三",
      "recipientPhone": "13800138000",
      "recipientAddress": "北京市...",
      "status": "pending",
      "submittedAt": "2026-07-06T00:00:00.000Z",
      "createdAt": "2026-07-06T00:00:00.000Z",
      "updatedAt": "2026-07-06T00:00:00.000Z",
      "items": [
        {
          "id": "clx...",
          "skuCode": "SKU001",
          "skuName": "商品1",
          "quantity": 2,
          "specification": "XL/红",
          "remarks": "小心轻放",
          "isValid": true,
          "errors": null
        }
      ]
    }
  ],
  "total": 1234,
  "page": 1,
  "pageSize": 50,
  "syncedAt": "2026-07-06T01:00:00.000Z",
  "requestId": "550e8400-e29b-41d4-a716-446655440000"
}
```

**错误响应**

| code              | HTTP | 说明                  |
| ----------------- | ---- | --------------------- |
| `INVALID_PARAMS`  | 400  | query 参数校验失败    |
| `DB_ERROR`        | 500  | 数据库异常            |
| `TIMEOUT`         | 504  | 超过 10s 未返回       |

**curl 示例**

```bash
curl "https://v2.example.com/api/external/v1/shipments?page=1&pageSize=50&keyword=北京" \
  -H "x-api-key: $V3_EXTERNAL_API_KEY"
```

---

### 3.2 GET `/api/external/v1/shipments/:id` — 运单详情 + 真实性校验

**Path / Query**

| 方式                        | 说明                                              |
| --------------------------- | ------------------------------------------------- |
| `/shipments/clx123`         | 按 V2 内部运单 ID（cuid）查                       |
| `/shipments/any?byExternalCode=V3-2026-0001` | 按外部运单号查（此时 `:id` 可任意，实际用 query）  |

> **重要**：运单不存在返回 **200** + `exists:false`，而不是 404。  
> 这样 V3 可以区分「网络错误/鉴权错误（非200）」与「运单确实不存在（200但exists=false）」。

**成功响应 200（存在）**

```json
{
  "data": { "id": "clx...", "...": "..." },
  "exists": true,
  "source": "v2-realtime",
  "fetchedAt": "2026-07-06T01:00:00.000Z",
  "requestId": "550e8400-e29b-41d4-a716-446655440000"
}
```

**成功响应 200（不存在）**

```json
{
  "data": null,
  "exists": false,
  "source": "v2-realtime",
  "fetchedAt": "2026-07-06T01:00:00.000Z",
  "requestId": "550e8400-e29b-41d4-a716-446655440000"
}
```

**错误响应**

| code        | HTTP | 说明       |
| ----------- | ---- | ---------- |
| `DB_ERROR`  | 500  | 数据库异常 |

---

### 3.3 GET `/api/external/v1/shipments/:id/sku/:skuCode` — 校验 SKU 归属

校验某个 SKU 是否属于该运单（用于 V3 二次确认，防止串单）。

**Path / Query**

- 同样支持 `?byExternalCode=xxx` 替代 path 中的 `:id`
- `skuCode` 比较：大小写不敏感

**成功响应 200（匹配）**

```json
{
  "belongs": true,
  "shipment": { "id": "clx...", "...": "..." },
  "item": {
    "id": "clx...",
    "skuCode": "SKU001",
    "skuName": "商品1",
    "quantity": 2,
    "...": "..."
  },
  "requestId": "550e8400-e29b-41d4-a716-446655440000"
}
```

**成功响应 200（不匹配 / 运单不存在）**

```json
{
  "belongs": false,
  "shipment": null,
  "item": null,
  "requestId": "550e8400-e29b-41d4-a716-446655440000"
}
```

**错误响应**

| code        | HTTP | 说明       |
| ----------- | ---- | ---------- |
| `DB_ERROR`  | 500  | 数据库异常 |

---

### 3.4 PATCH `/api/external/v1/shipments/:id/exception-marker` — 异常标记回写（加分项）

V3 在审单/物流环节发现异常时，将异常状态回写到 V2，方便 V2 侧运营看到。

> 由于 Shipment 表没有独立异常字段，约定通过 `status` 做多值映射：
> - 标记异常：`status = "exception_{qc|logistics|unknown}"`
> - 解除异常：`status = submittedAt ? "submitted" : "pending"`

**同样支持 `?byExternalCode=xxx`**

**Body (JSON)**

| 字段            | 类型    | 必填 | 枚举                       | 说明                                   |
| --------------- | ------- | ---- | -------------------------- | -------------------------------------- |
| `hasException`  | boolean | 是   | true / false               | 是否标记异常                           |
| `exceptionType` | string  | 否   | `qc` \| `logistics`        | 异常类型；缺省视为 `unknown`           |
| `ticketId`      | string  | 否   | -                          | V3 侧工单 ID，用于幂等去重 / 关联排查 |
| `severity`      | string  | 否   | `low` \| `medium` \| `high`| 严重等级（本次只记录，不影响状态）    |
| `remark`        | string  | 否   | -                          | 异常描述（本次只记录，不影响状态）    |

**成功响应 200**

```json
{
  "ok": true,
  "previousStatus": "submitted",
  "currentStatus": "exception_qc",
  "ticketId": "T-20260706-001",
  "severity": "high",
  "remark": "收件人电话为空",
  "requestId": "550e8400-e29b-41d4-a716-446655440000"
}
```

**错误响应**

| code                | HTTP | 说明                           |
| ------------------- | ---- | ------------------------------ |
| `INVALID_JSON`      | 400  | 请求体不是合法 JSON            |
| `INVALID_BODY`      | 422  | body 字段类型/枚举校验失败     |
| `SHIPMENT_NOT_FOUND`| 422  | 运单不存在                     |
| `DB_ERROR`          | 500  | 数据库异常                     |

**curl 示例**

```bash
curl -X PATCH "https://v2.example.com/api/external/v1/shipments/clx123/exception-marker" \
  -H "x-api-key: $V3_EXTERNAL_API_KEY" \
  -H "Content-Type: application/json" \
  -d '{
    "hasException": true,
    "exceptionType": "qc",
    "ticketId": "T-20260706-001",
    "severity": "high",
    "remark": "收件人电话为空"
  }'
```

---

## 4. 环境变量

在 V2 部署环境新增：

| 变量名                  | 必填 | 示例                                                 |
| ----------------------- | ---- | ---------------------------------------------------- |
| `V3_EXTERNAL_API_KEY`   | 是   | `openssl rand -hex 32` 的输出（64 位 hex 字符串）    |
| `DEBUG`                 | 否   | 设为 `1` 时，额外把日志落到 `./logs/external-api.log` |

---

## 5. V2 侧日志（自查）

V2 侧每个 External API 调用都会 `console.info` 输出一行：

```
[EXTERNAL_API] 2026-07-06T01:00:00.000Z | GET /api/external/v1/shipments | status=200 | duration=123ms | requestId=550e... | keyPrefix=abcd12...
```

字段：method / path / HTTP 状态 / 耗时 / requestId / API Key 前缀（仅前6位，脱敏） / error（如有）/ body sha256（如有）

DEBUG 模式下同步写 JSON Lines 到 `./logs/external-api.log`，便于离线分析。

---

## 6. 变更记录

| 日期       | 版本 | 说明                                        |
| ---------- | ---- | ------------------------------------------- |
| 2026-07-06 | v1.0 | 初始版本：列表、详情、SKU校验、异常回写接口 |
