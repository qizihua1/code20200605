# 部署指南

## 前提条件

- Node.js 18+ 
- Git 已安装
- GitHub 账号
- Vercel 账号 (已关联 GitHub)

## 步骤 1: 创建 GitHub 仓库

1. 访问 https://github.com/new
2. 仓库名：`code20200605`
3. 设为 Public 或 Private (推荐 Public 以便审核)
4. **不要** 勾选 "Add a README"或"gitignore"

## 步骤 2: 推送代码到 GitHub

在终端执行:

```bash
cd /workspace/code20200605

# 如果已经配置了 gh CLI
gh repo create code20200605 --public --source=/workspace/code20200605 --remote=origin --push

# 或者手动操作:
git remote add origin https://github.com/YOUR_USERNAME/code20200605.git
git branch -M main
git push -u origin main
```

## 步骤 3: 在 Vercel 部署

1. 访问 https://vercel.com/new
2. 选择你的 GitHub 仓库 `code20200605`
3. 配置环境变量:
   - `DATABASE_URL`: PostgreSQL 连接字符串 (使用 Neon/Supabase)
   - `AI_MODEL`: `deepseek-chat` (推荐) 或 `gpt-4o`
   - `DEEPSEEK_API_KEY`: 你的 DeepSeek API Key (如果用 GPT 则填 `OPENAI_API_KEY`)
4. 点击 Deploy

### 获取 Neon 数据库

1. 访问 https://neon.tech
2. Sign up / Login
3. Create new project
4. 复制 Connection String (pgbouncer mode)
5. 粘贴到 Vercel 的 `DATABASE_URL`

### 获取 DeepSeek API Key

1. 访问 https://platform.deepseek.com
2. Sign up / Login
3. API Keys → Create new key
4. 复制 key 到 Vercel 的 `DEEPSEEK_API_KEY`

## 步骤 4: 验证部署

部署完成后:

1. 获取 Vercel 分配的 URL (如 `https://code20200605.vercel.app`)
2. 访问 URL 验证页面加载正常
3. 测试各个页面路由

## 步骤 5: 数据库迁移

在 Vercel 部署后，执行一次数据库初始化:

```bash
# 本地执行 (需要 .env 中 DATABASE_URL 指向生产环境)
npm run db:generate
npm run db:push
```

或使用 Neon 控制台执行 SQL:

```sql
-- Prisma 会自动创建表，无需手动执行
```

## 本地开发配置

```bash
# 复制环境变量模板
cp .env.template .env

# 编辑 .env 填写本地配置
# - 本地数据库 (可选): 使用 Neon 测试数据库
# - AI API Key: 与 Vercel 相同
```

## 故障排查

### 构建失败
检查 `package.json` 中 `engines` 字段，确保 Node.js 版本匹配

### 数据库连接失败
- 确认 DATABASE_URL 使用 pgbouncer 模式
- 检查 Neon 防火墙设置，允许所有 IP

### AI 调用失败
- 检查 API Key 是否正确
- 确认 API Key 有足够配额

## 提交格式

Git commit 信息遵循 Conventional Commits:

- `feat:` 新功能
- `fix:` 修复 bug
- `docs:` 文档更新
- `chore:` 杂项 (配置、工具等)

## 下一步

1. 为 9 份测试文件创建解析规则
2. 完善前端页面 (上传、预览、编辑功能)
3. 性能优化 (虚拟列表、分批加载)
4. 完整测试

## 在线预览 URL

部署成功后，Vercel URL 类似:
```
https://code20200605.vercel.app
```

请将实际 URL 记录在此。
