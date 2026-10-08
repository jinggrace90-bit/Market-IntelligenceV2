# Market Intelligence V2

Personal, non-commercial markets dashboard: cross-asset prices, charts, sector rotation, RSS news with Groq reads, economic calendar. Free stack: Next.js on Vercel Hobby + Supabase Free.

- Architecture (source of truth): [ARCHITECTURE.md](ARCHITECTURE.md) · working rules: [CLAUDE.md](CLAUDE.md)
- **Beginner setup + deployment: [GUIDE.md](GUIDE.md)**

```bash
npm install
cp .env.example .env.local   # then edit; CRON_SECRET is the only required value locally
npm run dev                  # http://localhost:3000
npm run seed                 # fill news / calendar / sentiment / quotes once
```

Without Supabase credentials the app stores data in `.data/store.json`, so it runs on day one.
