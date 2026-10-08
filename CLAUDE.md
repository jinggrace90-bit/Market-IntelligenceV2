# CLAUDE.md — Market Intelligence

开始任何任务前先读 `ARCHITECTURE.md`。它是唯一的架构依据。

## 硬性规则

1. **不引入付费服务。** 任何需要付费计划的方案，先停下来问我。
2. **页面渲染和用户请求路径上不直接调用第三方 API。** 只能读 Supabase，或调用自带 CDN 缓存的 `/api/*` 路由。
3. **第三方调用只能写在 `lib/sources/*.ts` 里**：5 秒超时，失败返回 `null` 不抛异常，返回值必须带 `source` 和 `as_of`。
4. **API key 只能通过服务端的 `process.env` 读取。** 永远不要用 `NEXT_PUBLIC_` 前缀，也不要写进前端代码或提交到 git。
5. UI 上的每个数值都要显示数据时间。延迟或非官方来源（期货、CNN F&G、ForexFactory）要标注出来。
6. alternative.me 是**加密货币**情绪指数，不能标成股市情绪。
7. 不使用 NewsAPI，新闻只用 RSS。
8. Groq 每条新闻只分析一次，结果存库，不在页面请求时调用。
9. `/api/cron/*` 路由必须校验 `Authorization: Bearer ${CRON_SECRET}`。

## 工作方式

- 按 `ARCHITECTURE.md` §7 的迁移顺序做，一次只做一步。每步完成后给出验证命令和结果，比如 `curl` 的输出、SQL 查询结果。
- 声称"完成"之前必须实际运行过：`npm run build` 通过，相关路由用 `curl` 返回了正确数据。
- 设计 token 以 `ARCHITECTURE.md` §6 为准，不要自己发明新颜色。
- 不确定第三方接口的字段格式时，先写一个最小脚本请求一次，看实际返回的数据，不要猜。

## 常用命令

- `npm run dev` — 本地开发
- `npm run build` — 构建检查
- `curl -s localhost:3000/api/quote?symbols=US10Y,VIX | jq` — 检查报价接口
