# 万能导入 V2 - 智能多格式批量下单系统

## 源码仓库
https://github.com/qizihua1/code20200605

## 部署地址
https://code20200605.vercel.app

## 大模型调用说明

### 模型选择
- **模拟 AI 模式**：本项目实现了模拟 AI 规则生成器，无需调用真实的大模型 API，即可体验完整功能

### Prompt 设计思路
模拟 AI 的 Prompt 设计包含以下几个部分：
1. **文件结构分析**：分析上传文件的表格结构、头部行数、数据起始位置等
2. **字段识别**：识别出常见的字段名如 `SKU编码`、`商品名称`、`数量`、`收件人`、`电话`、`地址` 等
3. **规则推荐**：根据文件结构推荐最适合的解析规则类型（标准表格、跳过头部、多Sheet等）
4. **字段映射**：自动匹配文件列与系统字段的对应关系

### API Key 配置方式
由于使用了模拟 AI 模式，本项目不需要配置真实的 API Key。如需接入真实大模型：

1. 创建 `.env` 文件
2. 配置环境变量：
   ```bash
   # OpenAI API Key
   OPENAI_API_KEY=sk-...
   
   # 或者其他大模型提供商
   # DEEPSEEK_API_KEY=...
   # CLAUDE_API_KEY=...
   ```
3. 修改 `lib/ai-rule-generator.ts`，接入真实的大模型 API

## 项目架构

### 核心技术栈
- Next.js 14 App Router + TypeScript
- Prisma + Neon PostgreSQL
- Vercel 部署
- 模拟 AI 规则生成（无需真实 AI API）

### 规则引擎设计

#### 规则引擎架构
1. **规则配置**：用户可通过 UI 创建/编辑解析规则
2. **AI 辅助生成**：上传文件后 AI 自动分析结构，生成推荐规则
3. **智能解析**：无需规则也能直接解析文件！
4. **规则引擎执行**：根据配置的规则解析不同类型的文件

#### 支持的规则类型
- `standardTable`: 标准表格（第 1 行表头，第 2 行起数据）
- `skipHeader`: 带头部干扰（跳过前 N 行）
- `multiSheet`: 多 Sheet 合并
- `matrixTranspose`: 矩阵转置（SKU×门店）
- `cardLayout`: 卡片式布局
- `textParagraph`: 纯文本段落（Word/PDF）

### 已实现功能
- ✅ 规则管理页面（支持 AI 生成）
- ✅ 文件导入页面（选择规则 + 解析）
- ✅ 模拟 AI 规则生成器
- ✅ 数据库 Schema 设计
- ✅ 规则引擎解析器
- ✅ **智能解析功能**（无需规则也能解析文件
- ✅ **数据预览与编辑功能
- ✅ **实时校验与导出 Excel 功能
- ✅ **支持多种 Excel 格式**（配送发货单、多门店出库单、欢乐牧场模板、门店调拨单等）

### 异步事件驱动架构（V4 升级）
- ✅ **上传即返回** - 接口响应时间 < 1s，立即返回 task_id
- ✅ **批量处理** - 1000 行/批并行处理，支持 10,000+ 行大文件
- ✅ **精细化错误追踪** - 行级错误记录，按批次查看
- ✅ **可观测性看板** - 实时监控吞吐量、错误分布、性能指标
- ✅ **Trace ID 全链路** - 从上传到处理完成的完整追踪
- ✅ **容灾降级** - SKU 校验失败自动降级，不影响主流程
- ✅ **幂等设计** - 批次重试不重复计数
- ✅ **Vercel Cron** - Outbox 事件自动补发

#### 异步架构 API
- `POST /api/import-tasks` - 上传文件，返回 task_id
- `GET /api/import-tasks/:taskId` - 查询任务进度
- `GET /api/import-tasks/:taskId/batches` - 查询批次详情
- `GET /api/import-tasks/:taskId/errors` - 查询错误明细
- `GET /api/import-monitor/summary` - 监控聚合数据
- `GET /api/traces/:traceId` - Trace 事件查询
- `POST /api/outbox/dispatch` - 手动触发 Outbox 分发
- `POST /api/worker/batch` - Worker 批处理入口

#### 监控看板
- `/monitor` - 实时监控页面
- `/task/:taskId` - 任务进度详情页

### 使用说明

**重要提示**：文件解析完成后，系统会显示数据预览。若存在错误数据（高亮显示），请按需修改或删除对应行，确认无误后方可点击"提交下单"按钮。

错误类型包括：
- SKU 编码或名称为空
- 数量为空或小于等于 0
- 缺少收货门店或收件人信息
- 收件人电话格式不正确
- 外部编码与 SKU 编码组合重复

### 待实现功能
- ⏳ 规则配置可视化编辑器
- ⏳ 完整的 9 种格式适配
- ⏳ 性能优化（虚拟列表等）

## 部署地址
https://code20200605.vercel.app

## 考试要求对照
- ✅ 规则引擎架构（非硬编码）
- ✅ AI 辅助生成规则（模拟）
- ✅ 数据库存储（Neon）
- ✅ 鲸天 UI 风格（#0fc6c2 主色）
- ✅ 智能解析功能（无需规则）
- ✅ 异步事件驱动架构（V4 升级）
- ✅ 可观测性与监控看板
- ⏳ 9 种格式兼容（规则待配置）

## 部署说明

### 环境变量配置
```env
# 数据库连接
DATABASE_URL=postgresql://user:password@host:port/dbname

# Upstash QStash 消息队列
QSTASH_TOKEN=eyJ...

# Vercel Blob 文件存储（可选，开发模式使用内存存储）
BLOB_READ_WRITE_TOKEN=vercel_blob_rw_...

# Vercel 环境标识
VERCEL=true
```

### 本地开发
```bash
# 安装依赖
npm install

# 生成 Prisma Client
npx prisma generate

# 数据库迁移
npx prisma migrate deploy

# 启动开发服务器
npm run dev
```

### 数据生成
```bash
# 生成 SKU 主数据和测试文件
npm run seed-data
```

### 测试
```bash
# 运行单元测试
npm test

# 运行压测脚本
npm run stress-test
```

## 技术架构详情

### 核心流程
1. 用户上传文件 → 存储到 Vercel Blob → 创建任务和批次 → 写入 Outbox 事件
2. API 立即返回 task_id → 同时触发即时 Outbox 分发
3. Worker 消费批次 → 解析文件 → 校验数据 → 批量写入 → 更新进度
4. 所有批次完成 → 任务状态更新为 COMPLETED/PARTIAL_SUCCESS

### 关键设计
- **事务性 Outbox**: 任务创建和事件写入在同一事务中
- **即时+定时双分发**: 上传时立即分发，Vercel Cron 每分钟补发
- **幂等处理**: 批次状态检查避免重复处理
- **批量优化**: 1000 行/批，SKU 批量校验，数据批量写入
- **全链路追踪**: traceId 贯穿所有操作

## 文档索引

- [架构设计文档](./ARCHITECTURE.md) - 异步任务流程图、Outbox 模式、批量处理策略
- [接口文档](./API_DOCUMENTATION.md) - 上传、任务查询、错误查询、Trace 查询、监控聚合
- [重构假设说明](./REFACTOR_ASSUMPTIONS.md) - 技术选型、性能推导、容灾设计

详细设计假设请参阅 [REFACTOR_ASSUMPTIONS.md](./REFACTOR_ASSUMPTIONS.md)