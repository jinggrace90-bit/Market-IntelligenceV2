'use client';
import { useEffect, useMemo, useState } from 'react';
import { AMBER, colorOf, DOWN, fmt, hhmm, inMin, pctStr, UP } from '@/lib/format';
import { instFromHit } from '@/lib/client';
import { ALL_STATIC, GROUPS } from '@/lib/instruments';
import type { SearchHit } from '@/lib/sources/yahoo-types';
import type { EconEvent, Inst, NewsItem, Quote } from '@/lib/types';
import { Ago, useNow } from './hooks';

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
const DOW = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

const pill = (on: boolean) => ({ height: 32, padding: '0 14px', borderRadius: 16, border: `1px solid ${on ? 'var(--fg)' : 'var(--line4)'}`, background: on ? 'var(--fg)' : 'transparent', color: on ? 'var(--bg)' : 'var(--fg)', fontSize: 13, cursor: 'pointer' }) as const;
const xIcon = <svg width="16" height="16" viewBox="0 0 24 24" aria-hidden="true" style={{ fill: 'none', stroke: 'currentColor', strokeWidth: 1.8, strokeLinecap: 'round' }}><path d="M17 7 7 17M7 7l10 10" /></svg>;

/* ------------------------------------------------------------------ Watchlist */
interface WatchProps {
  list: Inst[];
  addedIds: Set<string>;
  quotes: Record<string, Quote>;
  currentId: string;
  onPick: (id: string) => void;
  onAdd: (inst: Inst) => void;
  onRemove: (id: string) => void;
}

export function WatchlistPanel({ list, addedIds, quotes, currentId, onPick, onAdd, onRemove }: WatchProps) {
  const [query, setQuery] = useState('');
  const [remote, setRemote] = useState<SearchHit[]>([]);
  const [searching, setSearching] = useState(false);
  const [searchFailed, setSearchFailed] = useState(false);
  const qq = query.trim();

  useEffect(() => {
    if (!qq) { setRemote([]); setSearchFailed(false); return; }
    setSearching(true);
    const ac = new AbortController();
    const t = setTimeout(async () => {
      try {
        const r = await fetch(`/api/search?q=${encodeURIComponent(qq)}`, { signal: ac.signal });
        const j = await r.json();
        setRemote(j.results ?? []);
        setSearchFailed(!r.ok);
      } catch (e) {
        if ((e as Error).name !== 'AbortError') setSearchFailed(true);
      }
      setSearching(false);
    }, 250);
    return () => { clearTimeout(t); ac.abort(); };
  }, [qq]);

  const results: Inst[] = useMemo(() => {
    if (!qq) return [];
    const s = qq.toLowerCase();
    const local = ALL_STATIC.filter((x) => x.id.toLowerCase().includes(s) || x.name.toLowerCase().includes(s) || x.y.toLowerCase().includes(s));
    const seen = new Set(local.map((x) => x.id));
    const rem = remote.filter((h) => !seen.has(h.symbol)).map(instFromHit);
    return [...local, ...rem].slice(0, 10);
  }, [qq, remote]);

  return (
    <>
      <div style={{ padding: '14px 16px 10px' }}>
        <label htmlFor="mi-wl-search" style={{ display: 'block', fontSize: 12, color: 'var(--muted)', marginBottom: 6 }}>Add a symbol</label>
        <input id="mi-wl-search" value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Search Yahoo Finance — AAPL, NVDA, ^HSI…" autoComplete="off"
          style={{ width: '100%', height: 40, padding: '0 12px', background: 'var(--bg)', border: '1px solid var(--line4)', borderRadius: 8, color: 'var(--fg)', fontSize: 14 }} />
      </div>
      <div style={{ flexGrow: 1, overflowY: 'auto', padding: '0 8px 16px' }}>
        {qq ? (
          <>
            {results.map((x) => {
              const inList = list.some((y) => y.id === x.id);
              return (
                <div key={x.id} style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '4px 4px 4px 12px', borderRadius: 8 }}>
                  <button onClick={() => onPick(x.id)} className="btn" style={{ flexGrow: 1, minWidth: 0, minHeight: 44, display: 'flex', flexDirection: 'column', justifyContent: 'center', gap: 2, background: 'none', border: 'none', color: 'var(--fg)', textAlign: 'left', padding: 0 }}>
                    <span style={{ fontSize: 14, fontWeight: 500 }}>{x.id}</span>
                    <span style={{ fontSize: 12, color: 'var(--muted)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{x.name} · {x.exch || x.kind}</span>
                  </button>
                  <button onClick={() => { onAdd(x); setQuery(''); }} disabled={inList} aria-label={inList ? `${x.id} is already in your watchlist` : `Add ${x.id} to watchlist`}
                    style={{ height: 32, padding: '0 12px', borderRadius: 6, border: `1px solid ${inList ? 'var(--line2)' : 'var(--line4)'}`, background: 'none', color: inList ? 'var(--muted)' : 'var(--fg)', fontSize: 13, cursor: inList ? 'default' : 'pointer' }}>
                    {inList ? 'In list' : 'Add'}
                  </button>
                </div>
              );
            })}
            {searching && results.length === 0 && <p style={{ margin: 0, padding: '20px 12px', fontSize: 13, color: 'var(--soft)' }}>Searching…</p>}
            {!searching && results.length === 0 && <p style={{ margin: 0, padding: '20px 12px', fontSize: 13, color: 'var(--soft)' }}>{searchFailed ? 'Search is unavailable right now.' : `No match for “${qq}”. Try a ticker such as MSFT or a Yahoo code such as ^HSI.`}</p>}
          </>
        ) : (
          <>
            {GROUPS.map((g) => {
              const rows = list.filter((x) => x.group === g);
              if (!rows.length) return null;
              return (
                <div key={g}>
                  <h3 style={{ margin: 0, padding: '14px 12px 6px', fontSize: 12, fontWeight: 500, color: 'var(--muted)' }}>{g}</h3>
                  <ul style={{ listStyle: 'none', margin: 0, padding: 0 }}>
                    {rows.map((x) => {
                      const q = quotes[x.id], sel = x.id === currentId;
                      return (
                        <li key={x.id} style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
                          <button onClick={() => onPick(x.id)} aria-current={sel} className="btn"
                            style={{ flexGrow: 1, minWidth: 0, height: 44, display: 'grid', gridTemplateColumns: 'minmax(0,1fr) 92px 72px', gap: 8, alignItems: 'center', padding: '0 12px', background: sel ? 'var(--line)' : 'transparent', border: 'none', borderRadius: 8, color: 'var(--fg)', textAlign: 'left' }}>
                            <span style={{ display: 'flex', flexDirection: 'column', minWidth: 0 }}>
                              <span style={{ fontSize: 13, fontWeight: 500 }}>{x.id}</span>
                              <span style={{ fontSize: 12, color: 'var(--muted)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{x.name}</span>
                            </span>
                            <span className="num" style={{ fontSize: 13, textAlign: 'right' }}>{q ? fmt(q.price, x.dp) : '—'}</span>
                            <span className="num" style={{ fontSize: 13, textAlign: 'right', color: q ? colorOf(q.change) : 'var(--muted)' }}>{q ? pctStr(q.changePct) : '—'}</span>
                          </button>
                          {addedIds.has(x.id) && (
                            <button onClick={() => onRemove(x.id)} aria-label={`Remove ${x.id} from watchlist`} className="btn" style={{ width: 36, height: 36, flexShrink: 0, border: 'none', background: 'none', borderRadius: 6, color: 'var(--muted)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>{xIcon}</button>
                          )}
                        </li>
                      );
                    })}
                  </ul>
                </div>
              );
            })}
            <p style={{ margin: '16px 12px 0', fontSize: 12, lineHeight: 1.5, color: 'var(--muted)' }}>Added symbols are saved in this browser.</p>
          </>
        )}
      </div>
    </>
  );
}

/* ------------------------------------------------------------------ Calendar */
function dayStart(d: Date): number { return new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime(); }

export function CalendarPanel({ events }: { events: EconEvent[] }) {
  const now = useNow(30000);
  const [day, setDay] = useState<number | null>(null);
  const [impact, setImpact] = useState<'all' | 'med' | 'high'>('all');

  const dNow = new Date(now);
  const todayIdx = dNow.getDay(), selDay = day === null ? todayIdx : day;
  const monday = dayStart(dNow) - ((todayIdx + 6) % 7) * 86400000;
  const tzOff = -dNow.getTimezoneOffset() / 60;
  const tzLabel = 'GMT' + (tzOff >= 0 ? '+' : '−') + Math.abs(tzOff);

  const byDay = useMemo(() => {
    const out: EconEvent[][] = [[], [], [], [], [], [], []];
    for (const e of events) {
      const t = new Date(e.ts).getTime();
      const i = Math.floor((dayStart(new Date(t)) - monday) / 86400000);
      if (i >= 0 && i < 7) out[i].push(e);
    }
    return out;
  }, [events, monday]);

  const dows = [1, 2, 3, 4, 5, 6, 0];
  const minImp = impact === 'high' ? 3 : impact === 'med' ? 2 : 1;
  const selIdx = dows.indexOf(selDay);
  const evs = byDay[selIdx].filter((e) => e.impact >= minImp);
  const isToday = selDay === todayIdx;
  const hasActual = events.some((e) => e.actual);
  const nowMin = dNow.getHours() * 60 + dNow.getMinutes();

  const rows: ({ now: true } | { now?: false; e: EconEvent })[] = [];
  let placed = !isToday;
  for (const e of evs) {
    if (!placed && new Date(e.ts).getTime() > now) { rows.push({ now: true }); placed = true; }
    rows.push({ e });
  }
  if (!placed && evs.length) rows.push({ now: true });

  return (
    <>
      <div role="group" aria-label="Day" style={{ display: 'grid', gridTemplateColumns: 'repeat(7, minmax(0,1fr))', gap: 4, padding: '14px 16px 10px' }}>
        {dows.map((dow, i) => {
          const dt = new Date(monday + i * 86400000), on = dow === selDay, n = byDay[i].length;
          return (
            <button key={dow} onClick={() => setDay(dow)} aria-pressed={on} aria-label={`${DOW[dow]} ${dt.getDate()} ${MONTHS[dt.getMonth()]}${dow === todayIdx ? ', today' : ''}, ${n} events`} className="btn"
              style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 2, minHeight: 60, padding: '6px 0', borderRadius: 8, background: on ? 'var(--line)' : 'transparent', border: `1px solid ${dow === todayIdx ? 'var(--line4)' : 'var(--line)'}`, color: 'var(--fg)' }}>
              <span style={{ fontSize: 12, color: 'var(--soft)' }}>{DOW[dow]}</span>
              <span className="num" style={{ fontSize: 15, fontWeight: 500 }}>{dt.getDate()}</span>
              <span className="num" style={{ fontSize: 11, color: 'var(--muted)' }}>{n || '—'}</span>
            </button>
          );
        })}
      </div>
      <div role="group" aria-label="Impact filter" style={{ display: 'flex', gap: 6, padding: '0 16px 12px' }}>
        {([['all', 'All'], ['med', 'Medium +'], ['high', 'High']] as const).map(([k, label]) => (
          <button key={k} onClick={() => setImpact(k)} aria-pressed={impact === k} style={pill(impact === k)}>{label}</button>
        ))}
      </div>
      <div role="table" aria-label={`Economic events, ${DOW[selDay]}`} style={{ flexGrow: 1, overflowY: 'auto', fontSize: 13 }}>
        <div role="rowgroup" style={{ position: 'sticky', top: 0, background: 'var(--raised)' }}>
          <div role="row" className="mi-evhead" style={{ display: 'grid', gridTemplateColumns: '48px minmax(0,1fr) 58px 58px 58px', gap: 8, padding: '8px 16px', fontSize: 12, color: 'var(--soft)', borderTop: '1px solid var(--line)', borderBottom: '1px solid var(--line)' }}>
            <span role="columnheader">Time</span><span role="columnheader">Event</span>
            <span role="columnheader" style={{ textAlign: 'right' }}>Actual</span><span role="columnheader" style={{ textAlign: 'right' }}>Fcst</span><span role="columnheader" style={{ textAlign: 'right' }}>Prior</span>
          </div>
        </div>
        <div role="rowgroup">
          {rows.map((r, i) => {
            if (r.now) {
              return (
                <div key={'now' + i} role="row" aria-label={`Now, ${hhmm(nowMin)}`} style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '0 16px', height: 22 }}>
                  <span role="cell" className="num" style={{ fontSize: 12, fontWeight: 600 }}>{hhmm(nowMin)}</span>
                  <span aria-hidden="true" style={{ flexGrow: 1, height: 1, background: 'var(--fg)', opacity: 0.7 }} />
                </div>
              );
            }
            const e = r.e, t = new Date(e.ts), tMin = t.getHours() * 60 + t.getMinutes();
            const past = t.getTime() <= now, diff = Math.round((t.getTime() - now) / 60000), soon = !past && diff <= 180;
            const act = e.actual || (past ? '—' : soon ? (diff < 60 ? diff + 'm' : Math.floor(diff / 60) + 'h' + String(diff % 60).padStart(2, '0')) : '');
            const lit = AMBER, dim = '#3a4048';
            return (
              <div key={e.id} role="row" className="mi-evrow" style={{ display: 'grid', gridTemplateColumns: '48px minmax(0,1fr) 58px 58px 58px', columnGap: 8, rowGap: 6, alignItems: 'center', padding: '10px 16px', borderBottom: '1px solid #1d2126', opacity: past && !e.actual ? 0.7 : 1 }}>
                <span role="cell" className="num mi-evtime" style={{ gridRow: '1 / 3', alignSelf: 'start', color: 'var(--soft)' }}>{hhmm(tMin)}</span>
                <span role="cell" className="mi-evname" title={e.name} style={{ gridColumn: '2 / 6', fontSize: 14, lineHeight: 1.35 }}>{e.name}</span>
                <span role="cell" className="mi-evmeta" style={{ gridColumn: 2, display: 'flex', alignItems: 'center', gap: 8, minWidth: 0 }}>
                  <span className="num" style={{ fontSize: 11, border: '1px solid var(--line4)', borderRadius: 4, padding: '0 4px', flexShrink: 0 }}>{e.country}</span>
                  <span role="img" aria-label={['Low', 'Medium', 'High'][e.impact - 1] + ' impact'} style={{ display: 'flex', alignItems: 'flex-end', gap: 2, height: 10, flexShrink: 0 }}>
                    <span style={{ width: 3, height: 4, background: lit }} /><span style={{ width: 3, height: 7, background: e.impact >= 2 ? lit : dim }} /><span style={{ width: 3, height: 10, background: e.impact >= 3 ? lit : dim }} />
                  </span>
                </span>
                <span role="cell" className="num" style={{ textAlign: 'right', fontWeight: 500, color: !e.actual && soon ? AMBER : 'var(--fg)' }}>{act}</span>
                <span role="cell" className="num" style={{ textAlign: 'right', color: 'var(--soft)' }}>{e.forecast || '—'}</span>
                <span role="cell" className="num" style={{ textAlign: 'right', color: 'var(--soft)' }}>{e.prior || '—'}</span>
              </div>
            );
          })}
          {rows.length === 0 && (
            <p style={{ margin: 0, padding: '28px 16px', color: 'var(--soft)' }}>
              {events.length === 0 ? 'No calendar data yet. It fills in after the calendar job runs.' : selDay === 0 || selDay === 6 ? 'Weekend — no scheduled releases.' : 'No events at this impact level.'}
            </p>
          )}
        </div>
      </div>
      <p style={{ margin: 0, padding: '10px 16px', fontSize: 12, color: 'var(--muted)', borderTop: '1px solid var(--line)' }}>
        {events[0]?.source ?? 'Economic calendar'} · times in {tzLabel}{hasActual ? '' : ' · forecast and prior only, actual values are not provided by this source'}
      </p>
    </>
  );
}

/** Next medium/high event for the "Next:" button in the header. */
export function nextEvent(events: EconEvent[], now: number): { name: string; when: string; impact: number } | null {
  const e = events.filter((x) => x.impact >= 2 && new Date(x.ts).getTime() > now).sort((a, b) => a.ts.localeCompare(b.ts))[0];
  if (!e) return null;
  const mins = Math.round((new Date(e.ts).getTime() - now) / 60000);
  return { name: `${e.name} (${e.country})`, when: mins < 60 * 48 ? inMin(mins) : new Date(e.ts).toLocaleDateString('en-GB', { weekday: 'short', day: 'numeric', month: 'short' }), impact: e.impact };
}

/* ------------------------------------------------------------------ News */
export function NewsPanel({ news }: { news: NewsItem[] }) {
  const [filter, setFilter] = useState<'all' | 'macro'>('all');
  const [open, setOpen] = useState<Record<number, boolean>>({});
  const list = news.filter((n) => filter === 'all' || n.ai_impact === 'macro');
  const hasAi = news.some((n) => n.ai_tone);
  return (
    <>
      <div role="group" aria-label="News filter" style={{ display: 'flex', gap: 6, padding: '14px 16px 10px' }}>
        {([['all', 'All'], ['macro', 'Macro only']] as const).map(([k, label]) => (
          <button key={k} onClick={() => setFilter(k)} aria-pressed={filter === k} style={pill(filter === k)}>{label}</button>
        ))}
      </div>
      <ul style={{ listStyle: 'none', margin: 0, padding: 0, flexGrow: 1, overflowY: 'auto' }}>
        {list.map((n) => {
          const isOpen = !!open[n.id];
          const toneColor = n.ai_tone === 'Bullish' ? UP : n.ai_tone === 'Bearish' ? DOWN : 'var(--soft)';
          return (
            <li key={n.id} style={{ padding: '14px 16px', borderBottom: '1px solid #1d2126', display: 'flex', flexDirection: 'column', gap: 8 }}>
              <button onClick={() => setOpen((o) => ({ ...o, [n.id]: !o[n.id] }))} aria-expanded={isOpen} className="btn" style={{ display: 'flex', flexDirection: 'column', gap: 6, padding: 0, border: 'none', background: 'none', color: 'var(--fg)', textAlign: 'left' }}>
                <span style={{ fontSize: 14, lineHeight: 1.4 }}>{n.title}</span>
                <span style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: '6px 10px', fontSize: 12, color: 'var(--muted)' }}>
                  <span>{n.source}</span><span aria-hidden="true">·</span><span><Ago ts={n.published_at} /></span>
                  {n.ai_tone && <span style={{ color: toneColor, border: `1px solid ${toneColor}`, borderRadius: 4, padding: '0 6px' }}>{n.ai_tone}</span>}
                  {(n.tickers ?? []).slice(0, 4).map((t) => <span key={t} className="num" style={{ color: 'var(--fg)' }}>{t}</span>)}
                </span>
              </button>
              {isOpen && (
                <div style={{ display: 'flex', flexDirection: 'column', gap: 8, padding: '10px 12px', background: 'var(--bg)', borderRadius: 8, fontSize: 13, lineHeight: 1.5 }}>
                  {n.ai_summary ? (<><span style={{ fontSize: 12, color: 'var(--muted)' }}>AI read (Groq)</span><span>{n.ai_summary}</span></>) : n.summary ? <span style={{ color: 'var(--soft)' }}>{n.summary}</span> : null}
                  <a href={n.url} target="_blank" rel="noopener noreferrer" style={{ fontSize: 13 }}>Open on {n.source} ↗</a>
                </div>
              )}
            </li>
          );
        })}
        {list.length === 0 && (
          <li style={{ padding: '28px 16px', color: 'var(--soft)', fontSize: 13, lineHeight: 1.5 }}>
            {news.length === 0 ? 'No news yet. It fills in after the news job runs.' : 'No macro-tagged headlines yet.'}
          </li>
        )}
      </ul>
      <p style={{ margin: 0, padding: '10px 16px', fontSize: 12, color: 'var(--muted)', borderTop: '1px solid var(--line)' }}>
        RSS · CNBC, Investing.com, MarketWatch, FT · refreshed every 10 min{hasAi ? ' · AI reads by Groq, generated once per headline' : ''}
      </p>
    </>
  );
}

/* ------------------------------------------------------------------ Alerts */
export interface AlertRule { sym: string; cond: 'above' | 'below'; val: number }

interface AlertProps {
  inst: Inst;
  price: number | null;
  alerts: AlertRule[];
  priceOf: (id: string) => { price: number | null; dp: number };
  onChange: (a: AlertRule[]) => void;
}

export function AlertsPanel({ inst, price, alerts, priceOf, onChange }: AlertProps) {
  const [cond, setCond] = useState<'above' | 'below'>('above');
  const [val, setVal] = useState('');
  const dflt = price == null ? '' : fmt(price * (cond === 'above' ? 1.01 : 0.99), inst.dp).replace(/,/g, '');
  return (
    <>
      <form onSubmit={(e) => { e.preventDefault(); const v = parseFloat(val === '' ? dflt : val); if (!isFinite(v)) return; onChange([...alerts, { sym: inst.id, cond, val: v }]); setVal(''); }} style={{ display: 'flex', flexDirection: 'column', gap: 12, padding: 16 }}>
        <div style={{ fontSize: 13, color: 'var(--soft)' }}>Alert me when <strong style={{ color: 'var(--fg)' }}>{inst.id}</strong> is</div>
        <div role="group" aria-label="Condition" style={{ display: 'flex', gap: 6 }}>
          {(['above', 'below'] as const).map((c) => (
            <button type="button" key={c} onClick={() => setCond(c)} aria-pressed={cond === c} className="btn"
              style={{ flexGrow: 1, height: 40, borderRadius: 8, border: `1px solid ${cond === c ? 'var(--fg)' : 'var(--line4)'}`, background: cond === c ? 'var(--fg)' : 'transparent', color: cond === c ? 'var(--bg)' : 'var(--fg)', fontSize: 14 }}>
              {c === 'above' ? 'Above' : 'Below'}
            </button>
          ))}
        </div>
        <label htmlFor="mi-alert-val" style={{ fontSize: 12, color: 'var(--muted)' }}>Price ({inst.id} now {price == null ? '—' : fmt(price, inst.dp)})</label>
        <input id="mi-alert-val" type="number" step="any" value={val === '' ? dflt : val} onChange={(e) => setVal(e.target.value)} className="num" style={{ height: 40, padding: '0 12px', background: 'var(--bg)', border: '1px solid var(--line4)', borderRadius: 8, color: 'var(--fg)', fontSize: 15 }} />
        <button type="submit" className="btn" style={{ height: 44, borderRadius: 8, border: 'none', background: 'var(--fg)', color: 'var(--bg)', fontSize: 14, fontWeight: 600 }}>Create alert</button>
      </form>
      <div style={{ flexGrow: 1, overflowY: 'auto', borderTop: '1px solid var(--line)' }}>
        {alerts.length === 0 && <p style={{ margin: 0, padding: '20px 16px', fontSize: 13, lineHeight: 1.5, color: 'var(--soft)' }}>No alerts yet. Alerts are checked in this browser while the page is open — no email or push in v1.</p>}
        <ul style={{ listStyle: 'none', margin: 0, padding: 0 }}>
          {alerts.map((a, idx) => {
            const { price: p, dp } = priceOf(a.sym);
            const hit = p != null && (a.cond === 'above' ? p >= a.val : p <= a.val);
            return (
              <li key={idx} style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '12px 8px 12px 16px', borderBottom: '1px solid #1d2126' }}>
                <span style={{ flexGrow: 1, display: 'flex', flexDirection: 'column', gap: 2 }}>
                  <span className="num" style={{ fontSize: 14 }}>{a.sym} {a.cond === 'above' ? '≥' : '≤'} {fmt(a.val, dp)}</span>
                  <span style={{ fontSize: 12, color: hit ? AMBER : 'var(--muted)' }}>{hit ? 'Triggered' : 'Watching'} · now {p == null ? '—' : fmt(p, dp)}</span>
                </span>
                <button onClick={() => onChange(alerts.filter((_, j) => j !== idx))} aria-label={`Delete alert ${a.sym}`} className="btn" style={{ width: 36, height: 36, border: 'none', background: 'none', borderRadius: 6, color: 'var(--muted)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>{xIcon}</button>
              </li>
            );
          })}
        </ul>
      </div>
    </>
  );
}
