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
| `SUPABASE_URL` | **Project URL**，形如 `https://xxxx.supabase.co` | **只写到 `.supabase.co` 为止**，不要带 `/rest/v1/`（复制 API 页面里的 REST 地址会多出这段，导致 `PGRST125` 错误；代码已自动容错，但请写对） |
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

## 4. Groq（AI 新闻分析，用户点击才运行）

1. 打开 https://console.groq.com → 注册/登录。
2. 左侧 **API Keys** → **Create API Key** → 复制（只显示一次）。
3. 写进 `.env.local`：`GROQ_API_KEY=gsk_...`
4. 默认模型是 `openai/gpt-oss-20b`（已实测可用；原先的 `llama-3.3-70b-versatile` 已下线）。模型会不定期换，如果点击分析后提示"The AI service could not analyse this right now"，到 https://console.groq.com/docs/models 找一个现有的聊天模型，写进 `GROQ_MODEL=`（Vercel 里改完要 Redeploy）。

**它怎么工作**：网站**不会**自动调用 AI。访客在新闻面板展开一条标题，点 **Analyze with AI**，才会把这一条标题发给 Groq，结果存进数据库，之后所有人看到的都是存好的结果（不会重复调用）。界面会标明"由 AI 生成，可能有误，不构成建议"。

**限流**：这个接口是公开的，为防止有人刷光你的免费额度，全站合计每分钟最多 8 次、每天最多 300 次，超过会提示稍后再试。

> 排错：线上点击后报错，先打开 `https://你的域名/api/health` 确认 `GROQ_API_KEY` 为 `true`。

---

## 5. Eulerpool（业绩日历 / 收益率与 VIX 历史）

**已接入**（2026-10-08 用真实 key 实测过路径和字段）。

1. 注册：https://www.eulerpool.com/developers/register（免费、不需要信用卡）。
2. 写进 `.env.local`：`EULERPOOL_API_KEY=...`
3. 验证：`npm run probe:eulerpool`，应该看到四行 `200`。
4. 跑 `npm run seed`，最后一行 `daily` 会显示抓到多少条业绩日历、US10Y 和 VIX 的历史天数。

它做什么（`/api/cron/daily`，每天一次）：

| 数据 | 接口 | 去向 |
|---|---|---|
| 未来 14 天业绩日历（预期 EPS / 营收） | `/api/1/calendar/earnings/{日期}` | `earnings_events` 表 |
| US10Y 日收盘历史 | `/api/1/government/treasury/yields`（字段 `y10`，字符串，单位 %） | `candles` 表，作为 Yahoo 不可用时的图表退路 |
| VIX 日收盘历史 | `/api/1/market/cboe/indices?symbol=VIX` | 同上 |

> **排错记录（避免重蹈）**：Eulerpool 的正确地址是 `https://api.eulerpool.com/api/1/...`，**不是** `/v1/...`。路径写错会返回 404，此时响应里的 `x-ratelimit-remaining` 只说明服务器收到了请求，**不代表路径正确**。完整接口清单（约 375 个）：`curl -H "Authorization: Bearer 你的KEY" https://api.eulerpool.com/api/1/documentation/yaml`。
>
> 它的 `economic-calendar` 只返回 FRED 的"发布名称+日期"，没有时间、重要性、预测值，所以**不能**替代日历面板，日历面板继续用 ForexFactory 镜像。
>
> 免费版只有日收盘数据，只做历史与退路，不用于盘中。业绩日历数据已入库，页面上暂时还没有展示入口。

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
| `GROQ_MODEL` | `openai/gpt-oss-20b`（或你选的） |
| `EULERPOOL_API_KEY` | 第 5 步的 key |
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
- [ ] 新闻面板有标题；展开一条点 “Analyze with AI”，几秒后出现 Bullish/Bearish 标签和解读。
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
