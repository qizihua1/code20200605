# GitHub 推送说明

仓库已创建: https://github.com/qizihua1/code20200605

## 问题

当前使用的 Fine-grained Personal Access Token 不支持 HTTPS git 推送。

## 解决方案 (选择其一)

### 方案 1: 使用 Classic Personal Access Token (推荐)

1. 访问 https://github.com/settings/tokens
2. 点击 "Generate new token (classic)"
3. 选择权限: `repo` (全选)
4. 复制生成的 token (以 `ghp_` 开头)
5. 执行:

```bash
cd /workspace/code20200605
git remote set-url origin https://YOUR_USERNAME:ghp_xxxxxxxxxxxx@github.com/qizihua1/code20200605.git
git push -u origin main
```

### 方案 2: 使用命令行 gh CLI

```bash
gh auth login
# 选择 GitHub.com → HTTPS → 粘贴浏览器验证码
cd /workspace/code20200605
git push -u origin main
```

### 方案 3: 手动推送 (如果已安装 GitHub Desktop)

1. 使用 GitHub Desktop 打开此目录
2. Push to origin

### 方案 4: 使用 SSH

```bash
# 生成 SSH key
ssh-keygen -t ed25519 -C "github@example.com"
cat ~/.ssh/id_ed25519.pub
# 添加到 https://github.com/settings/ssh/new

# 修改 remote
cd /workspace/code20200605
git remote set-url origin git@github.com:qizihua1/code20200605.git
git push -u origin main
```

## 仓库地址

- HTTPS: https://github.com/qizihua1/code20200605.git
- SSH: git@github.com:qizihua1/code20200605.git
- 网页：https://github.com/qizihua1/code20200605

## 下一步: Vercel 部署

推送成功后:

1. 访问 https://vercel.com/new
2. 选择 Import Git Repository
3. 选择 `qizihua1/code20200605`
4. 配置环境变量:
   - DATABASE_URL
   - AI_MODEL
   - DEEPSEEK_API_KEY (或 OPENAI_API_KEY)
5. Deploy
