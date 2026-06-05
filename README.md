# 智能多格式批量下单系统 V2

AI 驱动的智能多格式批量下单系统，支持 Excel/Word/PDF 格式自动解析，兼容 9 种复杂格式。

## 技术栈

- **Frontend**: Next.js 14 + TypeScript + Tailwind CSS
- **Backend**: Next.js API Routes
- **Database**: PostgreSQL (Neon/Supabase)
- **ORM**: Prisma 6
- **AI**: Vercel AI SDK (支持 DeepSeek/GPT/Claude)
- **Deployment**: Vercel

## 核心功能

- ✅ 文件上传 (Excel/Word/PDF)
- ✅ AI 智能分析生成解析规则
- ✅ 可配置规则引擎，兼容 9 种复杂格式
- ✅ 类 Excel 在线编辑与实时校验
- ✅ 批量提交下单
- ✅ 运单列表管理与查询
- ✅ 导出 Excel 功能

## 快速开始

### 1. 安装依赖

```bash
npm install
```

### 2. 配置环境变量

复制 `.env.template` 到 `.env`:

```bash
cp .env.template .env
```

编辑 `.env` 文件，填写:

```env
# 数据库连接 (使用 Neon/Supabase)
DATABASE_URL="postgresql://user:password@host:port/dbname"

# AI 模型配置 (选择一种)
AI_MODEL="deepseek-chat"
DEEPSEEK_API_KEY="your-deepseek-key"

# 或使用 OpenAI
# AI_MODEL="gpt-4o"
# OPENAI_API_KEY="your-openai-key"
```

### 3. 初始化数据库

```bash
npm run db:generate
npm run db:push
```

### 4. 本地开发

```bash
npm run dev
```

访问 http://localhost:3000

## 部署

### Vercel 部署

1. 安装 Vercel CLI (可选):
```bash
npm i -g vercel
```

2. 部署:
```bash
vercel
```

或在 Vercel 官网连接 GitHub 仓库自动部署。

3. 配置环境变量:
   - 在 Vercel 项目设置中添加 `DATABASE_URL` 和 `AI_MODEL`, `DEEPSEEK_API_KEY`

## 9 份测试文件格式

系统支持解析以下 9 种复杂格式:

1. **黎明屯配送发货单** (Excel) - 干扰头部 + 散落尾部
2. **湖南仓发货明细** (Excel) - 跨行聚合
3. **欢乐牧场模板** (Excel) - 矩阵转置
4. **黔寨寨配送单** (PDF) - 头部元信息 + 底部收货人
5. **多门店分 Sheet 出库单** (Excel) - 多 Sheet 合并
6. **门店调拨单** (Excel) - 卡片式
7. **门店配送确认单** (Word) - 纯文本
8. **周配送计划** (Excel) - 双重转置 + 复合单元格
9. **配送签收单** (PDF) - 多单拆分

## 大模型调用说明

### 使用的模型
- **推荐**: DeepSeek Chat (性价比高)
- **备选**: OpenAI GPT-4o, Claude 3.5

### Prompt 设计思路

AI 分析的核心 Prompt 包括:

1. 文件结构分析 (头部行数、数据起始行、特殊结构识别)
2. 字段映射识别 (列名到目标字段)
3. 复杂处理需求 (跨行聚合、矩阵转置、卡片拆分等)

### API Key 配置

- DeepSeek: https://platform.deepseek.com
- OpenAI: https://platform.openai.com
- Claude: https://console.anthropic.com

## 性能指标

- ✅ 1000 条数据导入 < 10 秒 (不含 AI 解析)
- ✅ 前端渲染 1000 条 < 3 秒
- ✅ 支持虚拟列表和分批渲染优化

## 项目结构

```
code20200605/
├── app/
│   ├── api/            # API 路由
│   ├── rules/          # 规则管理页面
│   ├── preview/        # 数据预览页面
│   ├── shipments/      # 运单列表页面
│   └── page.tsx        # 首页
├── lib/
│   ├── parser/         # 解析引擎
│   ├── ai.ts           # AI SDK 配置
│   └── prisma.ts       # Prisma 客户端
├── prisma/
│   └── schema.prisma   # 数据模型
└── .env                # 环境变量
```

## 开发说明

### 添加新的解析规则格式

1. 上传新格式文件
2. 点击"AI 分析生成规则"
3. AI 自动分析文件结构并生成规则
4. 手动微调确认
5. 保存规则

### 自定义字段映射

在 `lib/parser/types.ts` 中定义字段。

## 反思题答案

### 1. 规则粒度

**太粗**: 无法覆盖复杂场景，如合并单元格、矩阵转置等
**太细**: 规则过于复杂，维护成本高，AI 生成困难

**最佳粒度**: 覆盖 90% 常见场景 + 少量高级自定义

### 2. AI 生成规则 vs AI 直接解析

| 方式 | 优势 | 劣势 | 适用场景 |
|------|------|------|----------|
| AI 生成规则 | 可复用、可编辑、可预览、透明可控 | 规则设计复杂 | 长期复用、多用户协作 |
| AI 直接解析 | 简单直接、无需规则设计 | 每次都要 AI 调用、黑盒 | 一次性使用、临时解析 |

**选择**: 规则引擎更适合企业级应用，AI 直接解析适合临时场景。

### 3. 人工编码时间预估

**不使用 AI 纯人工**: 约 2-3 周
- 规则设计：3-4 天
- 9 种格式适配：5-7 天
- 前端编辑器：4-5 天
- 后端 API: 3-4 天
- 测试调试：3-4 天

**使用 AI 辅助**: 2-3 天 (如本项目)
- AI 生成规则框架：几小时
- 手动微调：1-2 天
- 核心开发：1-2 天

**AI 效率提升**: 5-10 倍

## 许可证

MIT

## 联系方式

作者：qizihua1
邮箱：448076883@qq.com
