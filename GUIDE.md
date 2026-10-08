# 新手部署指南：从 localhost 到公开网站

> 目标：把你电脑上的网站放到网上，免费、非商业。
> 各网站的按钮名称偶尔会改版，找不到时认准"意思"（例如 *API Keys*、*Environment Variables*）。

## 0. 先建立整体概念（5 分钟）

```
你的电脑 (ORANGE/1)  ──git push──►  GitHub 仓库  ──自动部署──►  Vercel（网站在这里运行）
                                                                    │ 读写
                                                                    ▼
                                    Supabase（数据库，存新闻/行情/日历）
                                                                    ▲
                            Supabase 的定时器(pg_cron) 每 5～10 分钟 ──┘ 调用 Vercel 上的 /api/cron/*
                                                                    │
                                          Vercel 函数去访问：Yahoo / RSS / CNN / Groq / ForexFactory
```

| 东西 | 它是什么 | 放在哪 |
|---|---|---|
| **代码** | 网站本身 | 你电脑 `ORANGE/1` → GitHub |
| **Vercel** | 运行网站的"服务器"，不是放文件的网盘。它读取 GitHub 里的代码并构建 | 云端 |
| **Supabase** | 数据库。网站页面只读它，不直接访问第三方（所以快） | 云端 |
| **API key（密钥）** | 你在 Groq/Eulerpool/Supabase 申请到的"密码" | **只放两个地方**：本机 `.env.local`、Vercel 的环境变量 |

**黄金规则：密钥永远不写进代码、不提交到 GitHub、不加 `NEXT_PUBLIC_` 前缀。**
`.env.local` 已经被 `.gitignore` 排除，不会被上传。

---

## 1. localhost 本地运行（已完成）

```bash
cd /Users/chongminjoo/ORANGE/1
npm install          # 只需第一次
npm run dev          # 打开 http://localhost:3000
```

页面刚打开时新闻/日历/情绪是空的（因为数据库是空的）。另开一个终端，运行一次：

```bash
npm run seed
```

它会依次调用 4 个定时任务路由（行情、情绪、日历、新闻）。刷新页面就有数据了。

> 此时**不需要任何账号**。没配置 Supabase 时，数据暂存在本地文件 `.data/store.json`（已被 git 忽略）。

停止服务器：在终端按 `Ctrl + C`。

---

## 2. 上传到 GitHub（已完成，之后每次改动用这个流程）

仓库：`https://github.com/jinggrace90-bit/Market-IntelligenceV2`（私有）

```bash
git add -A
git commit -m "说明你改了什么"
git push
```

> 提交前看一眼 `git status`，确认没有 `.env.local` 出现在列表里。

---

## 3. Supabase（数据库）

### 3.1 创建项目
1. 打开 https://supabase.com → 用 GitHub 登录 → **New project**。
2. 名字随意；**Database Password** 设一个强密码并存进密码管理器（我们的网站用不到它，但以后会用）。
3. **Region** 选离你近的（比如 Singapore）。Plan 选 **Free**。
4. 等 1～2 分钟创建完成。

### 3.2 建表
1. 左侧 **SQL Editor** → **New query**。
2. 打开本项目的 [supabase/schema.sql](supabase/schema.sql)，全部复制进去 → **Run**。
3. 看到 "Success" 即可。左侧 **Table Editor** 里应能看到 `news`、`quotes_latest` 等 6 张表。

> 这个脚本里有一段 `enable row level security`，它让"公开密钥"什么都读不了。**不要删。**

### 3.3 拿到两个值
进入 **Project Settings → API**（或 *API Keys*）：

| 环境变量 | 在哪找 | 注意 |
|---|---|---|
| `SUPABASE_URL` | **Project URL**，形如 `https://xxxx.supabase.co` | 可公开，但仍不加 `NEXT_PUBLIC_` |
| `SUPABASE_SERVICE_ROLE_KEY` | `service_role` 密钥（新版界面可能叫 **secret key**） | **最高权限，绝不能泄露** |

> 不要用 `anon` / `publishable` 密钥。我们的网站只在服务器端访问数据库。

### 3.4 本机连接 Supabase（可选，先在 localhost 试）
把两个值写进 `/Users/chongminjoo/ORANGE/1/.env.local`：

```
SUPABASE_URL=https://xxxx.supabase.co
SUPABASE_SERVICE_ROLE_KEY=你的密钥
```

重启 `npm run dev`，再 `npm run seed`。到 Supabase 的 **Table Editor** 看 `news` 表是否有数据。有，就说明连通了。

---

## 4. Groq（AI 新闻分析）

1. 打开 https://console.groq.com → 注册/登录。
2. 左侧 **API Keys** → **Create API Key** → 复制（只显示一次）。
3. 写进 `.env.local`：`GROQ_API_KEY=gsk_...`
4. 模型名在 https://console.groq.com/docs/models 查看。默认用 `llama-3.3-70b-versatile`，如果它被下线了，把 `GROQ_MODEL=` 改成列表里的新模型名。
5. 重启后运行 `npm run seed`，输出里应显示 `"groq":true,"analyzed":数字`。网站新闻面板里会出现 Bullish/Bearish 标签。

规则：每条新闻**只分析一次**，结果存数据库，页面打开时不调用 Groq。免费额度有每分钟/每天限制，超了会自动跳过（新闻照常显示，只是没有 AI 标签）。

---

## 5. Eulerpool（基本面 / 业绩日历 / 收益率历史）

目前**只做了探测脚本**，还没有接进页面。原因：文档里公开写明的只有 `/v1/earnings/calendar`，经济日历和国债收益率的路径没写，按项目规则（CLAUDE.md："不要猜"）要先看真实返回。

1. 注册：https://www.eulerpool.com/developers/register（免费、不需要信用卡）。
2. 拿到 key，写进 `.env.local`：`EULERPOOL_API_KEY=...`
3. 运行：

```bash
npm run probe:eulerpool
# 也可以指定路径：
npm run probe:eulerpool -- /earnings/calendar
```

4. 把输出（**不要包含 key**）发给我，我据此写 `lib/sources/eulerpool.ts`。

> 免费版只有日收盘数据（ARCHITECTURE §2），只做历史/退路，不用于盘中。

---

## 6. Vercel（把网站放上网）

### 6.1 导入项目
1. 打开 https://vercel.com → 用 **GitHub** 登录。选 **Hobby**（免费，**仅限个人非商业**）。
2. **Add New… → Project** → 授权访问 GitHub → 选 `Market-IntelligenceV2` → **Import**。
3. Framework 会自动识别为 **Next.js**，其他都用默认。

### 6.2 在点 Deploy 之前，先填环境变量
展开 **Environment Variables**，逐个添加（名称必须完全一致）：

| Name | Value |
|---|---|
| `SUPABASE_URL` | 第 3.3 步的 URL |
| `SUPABASE_SERVICE_ROLE_KEY` | 第 3.3 步的密钥 |
| `GROQ_API_KEY` | 第 4 步的 key |
| `GROQ_MODEL` | `llama-3.3-70b-versatile`（或你选的） |
| `EULERPOOL_API_KEY` | 第 5 步的 key（暂时可以不填） |
| `CRON_SECRET` | **新生成一个**：终端运行 `openssl rand -hex 32`，复制结果 |

> `CRON_SECRET` 不要沿用本机的 `dev-secret-change-me`。请把它另存一份，第 7 步要用。

### 6.3 部署
点 **Deploy**，等 1～2 分钟。成功后得到网址 `https://market-intelligence-v2-xxxx.vercel.app`。

此时打开会看到页面但没有新闻（数据库还是空的）。继续第 7 步。

> 之后只要 `git push`，Vercel 会自动重新部署。改了环境变量需要 **Redeploy** 才生效。

---

## 7. 让数据库定时更新（Supabase pg_cron）

Vercel Hobby 的内置 cron 一天只能跑一次，所以我们让 **Supabase 来定时敲 Vercel 的门**。

1. 打开 [supabase/cron.sql](supabase/cron.sql)，把里面的 `YOUR_SITE` 换成你的域名（不带 `https://`，如 `market-intelligence-v2-xxxx.vercel.app`），`YOUR_CRON_SECRET` 换成 6.2 里设置的 `CRON_SECRET`。
2. 复制到 Supabase **SQL Editor** → **Run**。
3. 先手动跑一次，不必等定时：

```bash
CRON_SECRET=你的线上密钥 npm run seed -- https://你的域名
```

输出里每一行应是 `200`。
4. 在 Supabase SQL Editor 检查定时任务有没有在跑（几分钟后）：

```sql
select jobname, status, return_message, start_time
from cron.job_run_details order by start_time desc limit 10;
```

> 这个定时任务同时能让 Supabase 免费库保持活跃，不会因"一周无活动"被暂停。

---

## 8. 验收清单

- [ ] 打开线上网址，有价格、图表、情绪。
- [ ] 新闻面板有标题；配了 Groq 的话有 Bullish/Bearish 标签。
- [ ] 日历面板有事件。
- [ ] 手机浏览器打开布局正常。
- [ ] `curl -s https://你的域名/api/quote?symbols=US10Y,VIX` 返回 JSON。
- [ ] 无请求时用无痕窗口隔 30 分钟再开，首页响应时间（ARCHITECTURE §7 第 5 步目标：TTFB < 800ms）。
- [ ] `git status` 里没有任何 `.env*` 文件。
- [ ] 旧的 Render / Neon 服务：确认新站稳定后再停用。

---

## 9. 常见问题

| 现象 | 原因 / 解决 |
|---|---|
| 页面一直骨架屏 | 看终端日志；多半是 Yahoo 暂时不通，等几秒或点 Retry |
| 顶部出现琥珀色 "Stale" | Yahoo 限流，显示的是数据库里最后一次的值，属正常降级 |
| `npm run seed` 返回 401 | `CRON_SECRET` 与服务器上的不一致 |
| 新闻有但没有 AI 标签 | `GROQ_API_KEY` 没配，或额度用完 |
| 日历没有 "Actual" 实际值 | 当前日历源（ForexFactory 镜像）只提供预测和前值，页面底部已标注 |
| Vercel 部署失败 | 打开该次部署的 **Build Logs**，把报错发给我 |
| 密钥不小心提交了 | 立刻去对应网站**作废并重新生成**密钥，再清理 git 历史 |
