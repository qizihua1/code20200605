# V2 异步事件驱动重构 - 假设与约束

## 1. 技术栈选择

### 1.1 消息队列
- **选择**: Upstash QStash
- **理由**: Vercel 原生集成，无需额外运维，基于 Redis 的 Serverless 友好特性
- **约束**: 单条消息大小限制 ~256KB，需要文件存储分离

### 1.2 文件存储
- **选择**: Vercel Blob（生产）/ 内存 Base64（开发降级）
- **理由**: 与 Vercel 平台无缝集成，支持版本管理和 CDN 分发
- **约束**: 需要 `BLOB_READ_WRITE_TOKEN` 环境变量

### 1.3 数据库
- **选择**: PostgreSQL + Prisma ORM
- **理由**: 原有技术栈延续，支持事务和复杂查询
- **约束**: Serverless 连接池限制，需要使用 Prisma Accelerate 或连接复用

## 2. 架构假设

### 2.1 任务状态机
```
PENDING → PROCESSING → COMPLETED
                    → PARTIAL_SUCCESS
                    → FAILED
```

### 2.2 批次处理流程
1. 创建任务时，按 1000 行/批切分
2. 每个批次独立入队，互不阻塞
3. 批次状态: PENDING → PROCESSING → COMPLETED/FAILED
4. 失败批次支持重试，最多 3 次

### 2.3 幂等性设计
- 批次处理检查当前状态，COMPLETED 则跳过
- 进度更新基于批次状态，避免重复计数
- Outbox 事件使用 `status` 字段控制重复分发

## 3. 性能假设

### 3.1 预期性能指标
- 文件上传响应时间: < 1s
- 单批次处理时间: < 5s (1000 行)
- 10,000 行文件完成时间: < 30s
- 系统吞吐量: > 1000 rows/s

### 3.2 批量优化策略
- SKU 批量校验: `Promise.all` 并发查询
- 数据库批量写入: 按 externalCode 分组事务
- 错误批量写入: `createMany` + `skipDuplicates`

## 4. 容灾与降级

### 4.1 SKU 校验降级
- 触发条件: SKU 主数据查询超时或异常
- 降级行为: 跳过 SKU 校验，标记 `degraded=true`
- 恢复机制: 下一个批次正常校验

### 4.2 文件获取降级
- 触发条件: Blob 存储访问失败
- 降级行为: 跳过文件解析，记录错误事件
- 恢复机制: 重试时重新获取

### 4.3 批次失败重试
- 触发条件: 批次处理异常
- 重试策略: 指数退避 (1s, 5s, 30s)
- 最大重试: 3 次后标记为 FAILED

## 5. 可观测性

### 5.1 Trace ID 全链路
- 生成时机: 任务创建时
- 传递范围: API → Outbox → Worker → 数据库
- 关联字段: traceId 在所有事件和日志中贯穿

### 5.2 性能指标
- 批次处理各阶段耗时 (解析/规则/校验/写入)
- 任务整体完成时间
- 错误率分布

### 5.3 监控看板
- 实时任务状态统计
- 队列积压监控
- 错误类型分布
- 平均处理耗时趋势

## 6. 安全与合规

### 6.1 敏感数据处理
- 电话号码: 脱敏存储 (`maskSensitiveValue`)
- 身份证号: 脱敏存储
- 日志输出: 不记录完整敏感数据

### 6.2 数据隔离
- 任务隔离: 每个任务独立的 traceId
- 批次隔离: 每个批次独立的 unitId
- 错误隔离: 批次失败不影响其他批次

## 7. 部署假设

### 7.1 Vercel 部署
- Serverless Functions: API 路由 + Worker
- Cron Jobs: Outbox 事件补发 (每分钟)
- Environment Variables: DATABASE_URL, QSTASH_TOKEN, BLOB_READ_WRITE_TOKEN

### 7.2 环境变量
```env
DATABASE_URL=postgresql://...
QSTASH_TOKEN=eyJ...
BLOB_READ_WRITE_TOKEN=vercel_blob_rw_...
```

## 8. 已知限制

### 8.1 文件大小
- 单文件最大: 10MB (受 Serverless 请求限制)
- 建议文件: < 10,000 行

### 8.2 并发处理
- 最大并发批次: 10 (受 QStash 并发限制)
- 建议任务间隔: > 5s

### 8.3 数据一致性
- 最终一致性: 批次处理是最终一致性的
- 进度显示: 实时但可能略有延迟
- 事务边界: 批次内部事务，批次间独立
