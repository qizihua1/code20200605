# 万能导入 V2 - 智能多格式批量下单系统

## 提交物清单

| 序号 | 提交物 | 位置 |
|------|--------|------|
| 1 | 在线地址 | https://code20200605.vercel.app |
| 2 | 源码仓库 | https://github.com/qizihua1/code20200605 |
| 3 | 压测数据脚本 | `scripts/seed-sku-master.js` + `scripts/generate-stress-test.js` |
| 4 | 10,000 行压测 Excel | `stress-test-10000rows.xlsx` (通过脚本生成) |
| 5 | 压测报告 | [STRESS_TEST_REPORT.md](./STRESS_TEST_REPORT.md) |
| 6 | 架构设计文档 | [ARCHITECTURE.md](./ARCHITECTURE.md) |
| 7 | 重构假设说明 | [REFACTOR_ASSUMPTIONS.md](./REFACTOR_ASSUMPTIONS.md) |
| 8 | 接口文档 | [API_DOCUMENTATION.md](./API_DOCUMENTATION.md) |
| 9 | README | 当前文件 |
| 10 | 演示账号 | 无需登录，公开访问 |

## 在线访问

- **主页**: https://code20200605.vercel.app
- **导入页**: https://code20200605.vercel.app/import
- **监控页**: https://code20200605.vercel.app/monitor
- **API 文档**: https://code20200605.vercel.app/api/import-monitor/summary

## 快速开始

### 环境变量

```env
# 数据库 (Neon PostgreSQL)
DATABASE_URL=postgresql://user:password@host:port/dbname

# Upstash QStash (生产环境消息队列)
QSTASH_TOKEN=eyJ...

# Vercel Blob (生产环境文件存储)
BLOB_READ_WRITE_TOKEN=vercel_blob_rw_...

# Vercel 环境标识
VERCEL=true
```

### 本地开发

```bash
# 1. 安装依赖
npm install

# 2. 生成 Prisma Client
npx prisma generate

# 3. 数据库迁移 (创建表结构)
npx prisma db push

# 4. 种子数据 (20,000 条 SKU 主数据)
DATABASE_URL=postgresql://... node scripts/seed-sku-master.js

# 5. 生成 10,000 行压测文件
node scripts/generate-stress-test.js

# 6. 启动开发服务器
DATABASE_URL=postgresql://... npm run dev
```

### 测试

```bash
# 单元测试
npm test

# 手动测试 API
# 上传文件 (返回 task_id)
curl -X POST http://localhost:3000/api/import-tasks -F "file=@test-import.xlsx"

# 查询任务状态
curl http://localhost:3000/api/import-tasks/{task_id}

# 查询监控汇总
curl http://localhost:3000/api/import-monitor/summary

# 查询错误明细
curl http://localhost:3000/api/import-tasks/{task_id}/errors
```

## 项目架构

### 核心技术栈

- **框架**: Next.js 14 App Router + TypeScript
- **ORM**: Prisma
- **数据库**: Neon PostgreSQL (Serverless)
- **部署**: Vercel
- **消息队列**: Upstash QStash (生产) / 本地内存队列 (开发)
- **文件存储**: Vercel Blob (生产) / 本地文件系统 (开发)

### 异步事件驱动架构

```
用户上传 → 解析文件 → 创建任务+批次+Outbox事件
  ↓
立即返回 task_id (响应时间 < 1s)
  ↓
Outbox 分发 → Worker 消费批次
  ↓
批量解析 → SKU校验 → 批量写入 → 更新进度
  ↓
所有批次完成 → 任务状态 COMPLETED
```

### 关键特性

- ✅ **上传即返回**: API 响应时间 < 1s，立即返回 task_id
- ✅ **批量处理**: 1000 行/批，支持 10,000+ 行大文件
- ✅ **精细化错误追踪**: 行级错误记录，按批次筛选查看
- ✅ **全链路可观测性**: Trace ID 贯穿上传→处理→完成
- ✅ **容灾降级**: SKU 校验失败自动降级，不影响主流程
- ✅ **幂等设计**: 批次重试不重复计数
- ✅ **Vercel Cron**: Outbox 事件自动补发
- ✅ **监控看板**: 实时吞吐量、错误分布、性能指标

### 数据库表结构

| 表名 | 说明 |
|------|------|
| `parsing_rules` | 解析规则配置 |
| `shipments` | 运单主表 |
| `shipment_items` | 运单明细 |
| `sku_master` | SKU 主数据 |
| `import_tasks` | 导入任务 |
| `import_task_batches` | 任务批次 |
| `import_task_errors` | 错误明细 |
| `event_outbox` | 事件 Outbox |
| `batch_performance_logs` | 批次性能日志 |
| `trace_events` | 全链路追踪事件 |

## API 接口

### 上传接口

```
POST /api/import-tasks
Content-Type: multipart/form-data

参数:
- file: Excel/Word/PDF 文件
- ruleId: (可选) 解析规则 ID

响应:
{
  "task_id": "task_xxx",
  "trace_id": "trace_xxx",
  "status": "PENDING",
  "total_rows": 10000,
  "total_batches": 10
}
```

### 任务查询

```
GET /api/import-tasks?status=PROCESSING&page=1

响应:
{
  "tasks": [...],
  "pagination": { "page": 1, "page_size": 20, "total": 5 }
}
```

### 监控聚合

```
GET /api/import-monitor/summary

响应:
{
  "throughput": { "rows_per_minute": 120 },
  "queue": { "pending_events": 0 },
  "errors": { "total_last_hour": 5 },
  ...
}
```

## 故障排查

### 常见问题

1. **任务卡在 PENDING 状态**
   - 检查 Outbox 事件是否已分发: `POST /api/outbox/dispatch`
   - 检查 QStash 是否可用 (生产环境)

2. **批次卡在 PROCESSING 状态**
   - 检查 Worker 是否正常运行
   - 可手动重试: Worker 会检查批次状态避免重复处理

3. **文件上传超时**
   - 检查文件大小 (建议 < 10MB)
   - 本地开发使用文件系统存储，Vercel 使用 Blob

4. **SKU 校验失败**
   - 系统自动降级，跳过 SKU 校验
   - 可在任务详情查看降级状态

## 文档

- [架构设计文档](./ARCHITECTURE.md) - 异步任务流程图、Outbox 模式、批量处理策略
- [接口文档](./API_DOCUMENTATION.md) - 上传、任务查询、错误查询、Trace 查询、监控聚合
- [重构假设说明](./REFACTOR_ASSUMPTIONS.md) - 技术选型、性能推导、容灾设计
- [压测报告](./STRESS_TEST_REPORT.md) - 10,000 行文件压测结果
