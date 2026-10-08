# Market Intelligence — 架构说明

> 本文是重构的唯一依据。与旧代码冲突时，以本文为准。
> 最后更新：2026-10-05

## 0. 约束（不可违反）

- **全免费**：不引入任何付费服务或付费计划。
- **个人、非商业**用途（Vercel Hobby、Eulerpool Free 都要求非商业）。
- **用户请求路径上不调用任何第三方 API**：页面只读数据库或已缓存的 API 响应。冷启动慢的根源就是"函数冷启动 → 数据库唤醒 → 第三方 API"三段延迟叠在一起。
- 每个展示出来的数值都必须带 `source` 和 `as_of`（数据时间），并在 UI 上可见。

## 1. 平台

| 层 | 选择 | 说明 |
|---|---|---|
| 前端 + API 路由 | **Vercel Hobby**（Next.js App Router） | 所有 API key 放在 Vercel 环境变量，只在服务端读取 |
| 数据库 | **Supabase Postgres（Free）** | 计算常驻、不会像 Neon Free 那样 5 分钟后暂停。定时任务持续写入，所以不会触发"一周无活动则暂停" |
| 定时任务 | **Supabase `pg_cron` + `pg_net`** | 按计划调用 Vercel 上的 `/api/cron/*` 路由。Vercel Hobby 的 cron 每天只能跑一次，所以不能用它来跑高频任务 |
| ~~Render~~ | **移除** | Render 免费服务 15 分钟无流量就休眠，唤醒约 1 分钟。如果它只是用来存放 key 或代理请求，那它很可能就是冷启动的主要来源。key 全部迁到 Vercel 环境变量 |
| ~~Neon~~ | **迁到 Supabase** | Neon Free 闲置 5 分钟就暂停计算，而且免费版不能关闭 |
| ~~AllTick~~ | **暂不使用** | 免费版 HTTP 接口每 10 秒 1 次、每天 1000 次、每次最多 5 个品种，撑不起仪表盘。以后如果付费，再加常驻 WebSocket 服务 |

## 2. 数据源

| 数据 | 主来源 | 刷新 | 失败时的退路 |
|---|---|---|---|
| 15 个品种报价 | **Yahoo Finance**（`yahoo-finance2`，一次批量请求） | 请求触发，CDN 缓存 15 秒 | `quotes_latest` 表中最后一次的值，标注"stale" |
| 图表 K 线 | Yahoo `chart` | 按周期缓存（见 §5） | `candles` 表 |
| US10Y / VIX 日线历史 | Yahoo `^TNX` / `^VIX` | 同上 | **Eulerpool**：`government_treasury_yields`（字段 `y10`）、`market_cboe_indices`（VIX） |
| 个股基本面、业绩日历 | Eulerpool Free | 每天 1 次 | 无 |
| 经济日历 | Eulerpool（如果有）→ 否则 ForexFactory 镜像 → Tradays | 每 6 小时 | 上次成功的数据 |
| 股市情绪 | CNN Fear & Greed（非官方 JSON，需要浏览器 UA 请求头） | 每小时 | 上次成功的值 + 时间 |
| 加密情绪 | alternative.me（**这是 Crypto F&G**，只在查看 BTC/ETH 时显示，并标注 "Crypto"） | 每小时 | 上次成功的值 |
| 新闻 | **RSS**（CNBC、Investing.com、MarketWatch、FT 等）。NewsAPI 免费版禁止用于生产环境，**不用** | 每 10 分钟 | 无 |
| AI 新闻 / 宏观分析 | Groq | 只对**新入库**的新闻跑一次，结果存库 | 不显示 AI 标签 |

已实测（2026-10-05）：Eulerpool Free 返回 US10Y 5.28%（日期 2026-10-02）、VIX 收盘 16.39（日期 2026-10-01）。这说明 Eulerpool 免费版只有**日收盘**数据，而且 VIX 可能比 10Y 晚一天。所以它只能当历史或退路数据源，不能用于盘中。

### Yahoo 代码映射

| 显示 | Yahoo 代码 | 备注 |
|---|---|---|
| S&P 500 | `^GSPC` | |
| NASDAQ Composite | `^IXIC` | |
| Dow Jones | `^DJI` | |
| Russell 2000 | `^RUT` | |
| VIX | `^VIX` | |
| US 10Y Yield | `^TNX` | 首次运行时与 Eulerpool `y10` 对比；如果相差约 10 倍，就除以 10 |
| US 5Y Yield | `^FVX` | 同上 |
| US 13W Yield | `^IRX` | 同上 |
| US Dollar Index | `DX-Y.NYB` | |
| Gold | `GC=F` | 期货，UI 标注 "Futures"，约 10 分钟延迟 |
| Silver | `SI=F` | 同上 |
| Crude Oil WTI | `CL=F` | 同上 |
| Brent | `BZ=F` | 同上 |
| Bitcoin | `BTC-USD` | |
| Ethereum | `ETH-USD` | |

### 板块表现（Sector performance）

不接新的 API。用 11 只 SPDR 行业 ETF 作为美股 GICS 板块的代理，这是业内通用做法：
`XLK` 科技、`XLC` 通信服务、`XLY` 可选消费、`XLP` 必需消费、`XLE` 能源、`XLF` 金融、`XLV` 医疗保健、`XLI` 工业、`XLB` 原材料、`XLRE` 房地产、`XLU` 公用事业。

- **1D 涨跌**：把这 11 个代码加进现有的 Yahoo 批量报价请求里，一次请求共 26 个代码。
- **其他周期（5D、1M、6M、YTD、1Y、5Y、All）**：每日定时任务拉取这些 ETF 的日线，写入 `candles` 表，再在服务端计算区间涨跌幅。
- **显示规则**：
  - 查看美股指数（SPX、NDX、DJI、RUT）或 VIX 时显示。
  - 查看美股个股时同样显示，并高亮该股票所属的板块，映射关系存在 `symbol_sector` 表或常量里。
  - 查看利率、外汇、商品、加密货币时不显示。
  - 港股 v1 只显示"暂不支持"的提示。
- **呈现方式**：放在主图下方。用排序后的**横向**发散条形图，零轴在中间，并画一条虚线标出参考指数的涨跌幅。周期跟随主图的周期切换。点击某个板块，主图就切换到对应的 ETF。

### 市场内部结构（Market internals）

这张卡片和板块卡片并排显示：主列宽度 ≥ 980px 时左右排列，比例 1.45 : 1；更窄时上下排列。显示条件和板块卡片相同。

需要再加 3 个代码到 Yahoo 批量请求中，加上之后一次请求共 29 个代码：`SPY`、`RSP`、`IWM`。

| 指标 | 计算方式 | 正值的含义 / 负值的含义 |
|---|---|---|
| 等权 vs 市值加权 | RSP 区间涨跌% − SPY 区间涨跌% | 普涨 / 由少数巨头带动 |
| 小盘 vs 大盘 | IWM − SPY | 风险偏好上升 / 资金偏好大型股和优质股 |
| 周期 vs 防御 | XLY − XLP | 资金转向进攻 / 资金转向防御 |
| 跑赢大盘的板块数 | 11 个板块中涨幅大于参考指数的数量 | ≥7 个算"普遍走强"；≤4 个算"领涨面窄" |

- 价差单位是百分点（pts）。价差的绝对值小于 0.1 时显示"In line"（与大盘一致）。
- 完整的市场宽度数据（涨跌家数、站上均线的比例）需要每天拉取 500 只成分股，在免费方案下 Yahoo 很可能会限流，所以 **v1 不做**。

## 3. 数据流

```
浏览器
 ├─ 页面（RSC / ISR，revalidate 60s）──读──► Supabase
 ├─ 每 15s 轮询 /api/quote?symbols=…  ──► Vercel 函数 ──► Yahoo
 │      响应头：Cache-Control: s-maxage=15, stale-while-revalidate=60
 │      用 waitUntil() 异步 upsert quotes_latest（不阻塞响应）
 └─ /api/chart?symbol&range ──► 先读 candles，没有或过期再调 Yahoo 并回写

Supabase pg_cron ──pg_net POST（带 CRON_SECRET）──► Vercel /api/cron/*
 ├─ news         */10 * * * *   RSS → news 表 → 新条目送 Groq → 写 ai_*
 ├─ sentiment    5 * * * *      CNN F&G + alternative.me → sentiment 表
 ├─ quotes       */5 * * * *    Yahoo 批量 → quotes_latest（给页面首屏用）
 ├─ calendar     15 */6 * * *   经济日历 → econ_events
 └─ daily        30 22 * * *    UTC：Eulerpool 基本面/业绩日历、日线历史 → 各表
```

浏览器标签页在后台时（`document.visibilityState !== 'visible'`）停止轮询。

## 4. 数据库表（Supabase）

```sql
create table quotes_latest (
  symbol text primary key,          -- 内部代码，如 'US10Y'
  yahoo_symbol text not null,
  price numeric not null,
  change numeric, change_pct numeric, prev_close numeric,
  day_low numeric, day_high numeric,
  source text not null, as_of timestamptz not null, fetched_at timestamptz not null default now()
);

create table candles (
  symbol text, interval text,       -- '5m','1h','1d','1wk'
  ts timestamptz,
  o numeric, h numeric, l numeric, c numeric, v numeric,
  source text not null,
  primary key (symbol, interval, ts)
);

create table news (
  id bigserial primary key,
  url text unique not null,
  title text not null, summary text, source text not null,
  published_at timestamptz not null,
  tickers text[], region text,
  ai_tone text, ai_impact text, ai_summary text, analyzed_at timestamptz
);

create table sentiment (
  kind text primary key,            -- 'cnn_fg' | 'crypto_fg'
  value int not null, label text not null,
  source text not null, as_of timestamptz not null, fetched_at timestamptz not null default now()
);

create table econ_events (
  id text primary key,              -- 来源 id 或 hash(date+country+name)
  ts timestamptz not null, country text not null, name text not null,
  impact smallint not null,         -- 1 低 2 中 3 高
  actual text, forecast text, prior text, source text not null
);

create table earnings_events (
  symbol text, report_date date, eps_est numeric, eps_actual numeric,
  rev_est numeric, rev_actual numeric, source text not null,
  primary key (symbol, report_date)
);
```

Watchlist 的"搜索后添加"：v1 存在浏览器的 `localStorage` 里，因为是单用户、不需要登录。默认 15 个品种写死在代码常量中。

## 5. API 路由

| 路由 | 用途 | 缓存 |
|---|---|---|
| `GET /api/quote?symbols=` | 批量最新价 | `s-maxage=15, swr=60` |
| `GET /api/chart?symbol=&range=` | K 线 | 1D: 60s；5D/1M: 10 分钟；6M 及以上: 6 小时 |
| `GET /api/search?q=` | Yahoo 搜索，给 Watchlist 添加品种用 | 1 天 |
| `POST /api/cron/*` | 只接受 `Authorization: Bearer ${CRON_SECRET}` | 不缓存 |

所有第三方调用都封装在 `lib/sources/<provider>.ts` 里，统一要求：5 秒超时、失败时返回 `null` 不抛异常、返回值带 `source` 和 `as_of`。

## 6. 页面布局（对应设计稿 "Market Intelligence Dashboard"）

整体是一行三列：`[主列] [面板 400px，可收起] [工具栏 52px]`。

1. **顶部导航**：Overview · News ｜ 搜索 ｜ 情绪胶囊（VIX + CNN F&G 五段刻度条）
2. **资产摘要**：品种名称、大字号价格（小数部分调暗）、涨跌、前收盘价、当日区间、52 周区间、数据时间和来源
3. **右侧工具栏**：Watchlist · 经济日历 · 价格提醒（提醒 v1 只放占位）
4. **主图**：占视觉面积最大；顶部是周期切换（1D … All），线的颜色跟随所选周期的涨跌

面板行为：
- 面板**不是覆盖层**。打开时它占 400px 宽度，主列宽度变为 `100vw − 52 − 400`；关闭后恢复。宽度变化用约 200ms 的 ease-out 动画。
- 图表用 `ResizeObserver` 重新测量宽度，不能写死像素。
- 面板打开时导航变紧凑：搜索框缩成图标按钮，"Live" 标签隐藏，导航整行 `nowrap` + `overflow:hidden`。
- 再次点击当前图标，或按 Esc，都可以关闭面板。
- **分割条**：面板左边缘有一条可拖动的分割条，中间是 4×44px 的把手，鼠标悬停或拖动时变亮变长。拖动可调整面板宽度。
  - 宽度范围：最小 320px，最大取 `min(760, 视口宽 − 56 − 480)`，保证主列至少留 480px。
  - 每个面板记住自己的宽度，存在 `localStorage` 的 `mi.panelW.v1` 中。
  - 双击分割条恢复成 400px。
  - 键盘操作：聚焦分割条后，← / → 每次调整 24px（按住 Shift 为 80px），Home / End 直接跳到最小 / 最大宽度。分割条使用 `role="separator"` 并带 `aria-valuenow`，读屏软件能读出当前宽度。
  - 拖动时用 `requestAnimationFrame` 节流，并暂时禁止页面文字被选中。
  - 视口窄于 1024px 时，面板变为覆盖层，分割条隐藏。
- **经济日历的自适应行布局**：面板宽度 ≥ 560px 时，每个事件显示为一行（时间 · 国家和重要性 · 事件名 · 实际 / 预测 / 前值）；更窄时改为两行。即将发布的事件在 Actual 栏显示琥珀色倒计时，比如 "28m"。

设计基调：背景 `#0c0d0f`，正文 `#eceef1`，次要文字 `#9aa1ab`，上涨 `#3fcf8e`，下跌 `#f2606b`。字体用 Geist / Geist Mono，数字用 `tabular-nums`。不用紫色，不用装饰性光晕。

## 7. 迁移步骤（按顺序执行，每步验证后再进行下一步）

1. 盘点 Render 上运行的所有东西，把 key 和逻辑迁到 Vercel（环境变量加 `lib/sources`）。**先不删除 Render**。
2. 新建 Supabase 项目，执行 §4 的建表语句；如果 Neon 里有需要保留的数据，导出后导入。
3. 实现 `/api/cron/*`；在 Supabase 中启用 `pg_cron` 和 `pg_net`，按 §3 建立调度。
4. 页面改为只读 Supabase；报价改为调用 `/api/quote`。
5. **测量**：空闲 30 分钟后首次打开首页，记录 TTFB 和 LCP。目标是 TTFB < 800ms。
6. 达标后停用 Render 和 Neon。

## 8. 以后再做（现在不做）

- AllTick 付费版 + 常驻 WebSocket（需要付费主机）
- 用户登录，以及跨设备同步 Watchlist
- 价格提醒的实际推送

## 9. 实现与本文的差异（2026-10-08，首版实现时记录）

- **界面**以设计稿 "Dashboard — v2 (post-critique)" 为准：背景 `#0b0c0e`、字体 IBM Plex Sans / Mono + Instrument Serif。§6 里的 `#0c0d0f` 和 Geist 已被它取代；涨跌色 `#3fcf8e` / `#f2606b` 不变。设计稿里的 "Overview · News" 导航被右侧工具栏的 Watchlist / Calendar / News / Alerts 面板取代。
- **`quotes_latest` 多了三列**：`wk52_low`、`wk52_high`、`market_state`（资产摘要要显示 52 周区间和开/收盘状态）。见 `supabase/schema.sql`。
- **经济日历**首版用 ForexFactory 镜像（`nfs.faireconomy.media`，无需 key，已实测）。它只有预测值和前值，**没有实际值**，页面底部已标注。Eulerpool 日历路径文档未公开，待用 `npm run probe:eulerpool` 实测后再接入。
- **`^TNX` 已实测**：Yahoo 返回 5.277，与 Eulerpool `y10` 的 5.28 一致，**不需要除以 10**。
- **板块 / 内部结构**不依赖 `candles` 表：`/api/sectors` 按周期直接取 Yahoo 日线并在服务端算涨跌幅，CDN 缓存（1D 30 秒，5D/1M 10 分钟，其余 6 小时）。
- **图表 K 线**成功后异步写入 `candles`，Yahoo 失败时从 `candles` 读取并标注 "saved copy"。
- **本地开发**未配置 Supabase 时，数据写入 `.data/store.json`（已 gitignore），行为与线上一致。
- **Eulerpool 已实测并接入**（`lib/sources/eulerpool.ts`，`/api/cron/daily`）：base 是 `https://api.eulerpool.com/api/1`（不是 `/v1`），Bearer 头可用。业绩日历 `/calendar/earnings/{date}` → `earnings_events`；`/government/treasury/yields`（`y10` 为字符串）和 `/market/cboe/indices?symbol=VIX` → `candles`（interval 标记为 `eulerpool-1d`，避免与 Yahoo 日线混在一起），仅在 Yahoo 图表失败时作退路。`/calendar/economic-calendar` 只有 FRED 发布名+日期，不含时间/预测，**不用于经济日历**。
- **Groq 默认模型**改为 `openai/gpt-oss-20b`（`llama-3.3-70b-versatile` 已下线）。每轮最多分析 12 条尚无 AI 结果的最新新闻；`reasoning_effort: low` 以适应免费档 8000 TPM。
- **数据库错误不再被吞掉**：`lib/store.ts` 对每个 Supabase 调用检查 `error`，cron 路由返回 `{ok:false,error}`。`SUPABASE_URL` 会被规范化为只保留 origin。
- **业绩日历面板**已实现（右侧工具栏第 3 个图标，快捷键 `E`）：读取 `earnings_events`（未来 14 天），按日期条切换，筛选「营收预期 ≥ $1B / 有预期值 / 我的品种」，可按代码跨日搜索，点击代码即可看图（临时品种不写入自选股）。来源只给报告日，没有盘前/盘后时间，面板底部已标注。
- **Yahoo 的 0 值区间**：日内/52 周低点在换日时段可能返回 0，现按缺失处理，界面显示 `—`。
- 尚未实现：基本面（个股）。
