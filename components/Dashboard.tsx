'use client';
import { useRouter } from 'next/navigation';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { lsGet, lsSet, marketStatus } from '@/lib/client';
import { AMBER, colorOf, DOWN, fmt, pctStr, signed, UP, ago } from '@/lib/format';
import { ALL_STATIC, BASE, CORE_SYMBOLS, TAPE, US_INDEX } from '@/lib/instruments';
import { RANGES, type RangeId } from '@/lib/ranges';
import type { ChartResponse, InitialData, Inst, Quote, QuoteResponse } from '@/lib/types';
import Chart, { type ChartState } from './Chart';
import { Ago, useNow } from './hooks';
import Palette, { PANELS, type PanelId } from './Palette';
import { AlertsPanel, CalendarPanel, NewsPanel, WatchlistPanel, nextEvent, type AlertRule } from './Panels';
import Sectors, { type SectorState } from './Sectors';

const LS_WATCH = 'mi.watchlist.v2', LS_PW = 'mi.panelW.v1', LS_ALERTS = 'mi.alerts.v1';
const PW_DEFAULT = 400, PW_MIN = 320;
const ICONS: Record<PanelId, string> = {
  watch: 'M9 6h11M9 12h11M9 18h11M4 6h.01M4 12h.01M4 18h.01',
  cal: 'M5 5h14a1 1 0 0 1 1 1v13a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1V6a1 1 0 0 1 1-1zM16 3v4M8 3v4M4 10h16',
  news: 'M5 4h11a3 3 0 0 1 3 3v13H8a3 3 0 0 1-3-3zM9 9h6M9 13h6M9 17h3',
  alerts: 'M6 9a6 6 0 0 1 12 0c0 6 2.5 8 2.5 8h-17S6 15 6 9M10.3 20.5a2 2 0 0 0 3.4 0',
};

type FeedMode = 'ok' | 'stale' | 'offline';

export default function Dashboard({ initial }: { initial: InitialData }) {
  const router = useRouter();
  const [mounted, setMounted] = useState(false);
  const [sym, setSym] = useState('US10Y');
  const [range, setRange] = useState<RangeId>('1D');
  const [panel, setPanel] = useState<PanelId | null>(null);
  const [panelWs, setPanelWs] = useState<Record<string, number>>({});
  const [dragging, setDragging] = useState(false);
  const [vw, setVw] = useState(1440);
  const [added, setAdded] = useState<Inst[]>([]);
  const [alerts, setAlerts] = useState<AlertRule[]>([]);
  const [infoOpen, setInfoOpen] = useState(false);
  const [palette, setPalette] = useState(false);
  const [mac, setMac] = useState(false);

  const [quotes, setQuotes] = useState<Record<string, Quote>>(initial.quotes);
  const [feed, setFeed] = useState<{ lastOk: number | null; mode: FeedMode; polled: boolean; retrying: boolean }>({
    lastOk: initial.quotesFetchedAt ? Date.parse(initial.quotesFetchedAt) : null, mode: 'ok', polled: false, retrying: false,
  });
  const [chart, setChart] = useState<ChartState>({ loading: true, data: null, error: false });
  const [chartTick, setChartTick] = useState(0);
  const [sparks, setSparks] = useState<Record<string, number[]>>({});
  const [sectors, setSectors] = useState<SectorState>({ loading: true, returns: null, error: false, asOf: null });

  const rootRef = useRef<HTMLDivElement>(null);
  const addedRef = useRef<Inst[]>([]);
  addedRef.current = added;
  const now = useNow(5000);

  /* ---------- boot: restore this browser's saved state ---------- */
  useEffect(() => {
    setMounted(true);
    setAdded(lsGet<Inst[]>(LS_WATCH, []));
    setPanelWs(lsGet<Record<string, number>>(LS_PW, {}));
    setAlerts(lsGet<AlertRule[]>(LS_ALERTS, []));
    setMac(/Mac|iPhone|iPad/.test(navigator.platform + navigator.userAgent));
    const onResize = () => setVw(window.innerWidth);
    onResize();
    window.addEventListener('resize', onResize);
    rootRef.current?.focus({ preventScroll: true });
    return () => window.removeEventListener('resize', onResize);
  }, []);

  const allInsts = useMemo(() => [...ALL_STATIC, ...added.filter((a) => !ALL_STATIC.some((s) => s.id === a.id))], [added]);
  const inst = allInsts.find((x) => x.id === sym) ?? BASE[5];
  const quote = quotes[inst.id];
  const list = useMemo(() => [...BASE, ...added.filter((a) => !BASE.some((b) => b.id === a.id))], [added]);

  /* ---------- quote polling: every 15s, paused while the tab is hidden ---------- */
  const poll = useCallback(async () => {
    const ids = [...new Set([...CORE_SYMBOLS, ...addedRef.current.map((a) => a.id)])];
    try {
      const r = await fetch('/api/quote?symbols=' + encodeURIComponent(ids.join(',')));
      if (!r.ok) throw new Error(String(r.status));
      const j: QuoteResponse = await r.json();
      setQuotes((p) => ({ ...p, ...j.quotes }));
      setFeed({ lastOk: Date.parse(j.fetchedAt), mode: j.stale ? 'stale' : 'ok', polled: true, retrying: false });
    } catch {
      setFeed((f) => ({ ...f, mode: 'offline', polled: true, retrying: false }));
    }
  }, []);
  useEffect(() => {
    poll();
    const t = setInterval(() => { if (document.visibilityState === 'visible') poll(); }, 15000);
    const onVis = () => { if (document.visibilityState === 'visible') poll(); };
    document.addEventListener('visibilitychange', onVis);
    return () => { clearInterval(t); document.removeEventListener('visibilitychange', onVis); };
  }, [poll]);

  // A symbol was just added to the watchlist: fetch its price now instead of waiting for the next tick.
  useEffect(() => { if (mounted && added.length) poll(); }, [added.length, mounted, poll]);

  // Pull fresh news / sentiment / calendar from our own database every 5 minutes.
  useEffect(() => {
    const t = setInterval(() => { if (document.visibilityState === 'visible') router.refresh(); }, 300000);
    return () => clearInterval(t);
  }, [router]);

  /* ---------- chart ---------- */
  useEffect(() => {
    const ac = new AbortController();
    const load = async (silent: boolean) => {
      if (!silent) setChart({ loading: true, data: null, error: false });
      try {
        const r = await fetch(`/api/chart?symbol=${encodeURIComponent(sym)}&range=${range}`, { signal: ac.signal });
        if (!r.ok) throw new Error(String(r.status));
        const data: ChartResponse = await r.json();
        setChart({ loading: false, data, error: false });
      } catch (e) {
        if ((e as Error).name === 'AbortError') return;
        if (!silent) setChart({ loading: false, data: null, error: true });
      }
    };
    load(false);
    const t = range === '1D' ? setInterval(() => { if (document.visibilityState === 'visible') load(true); }, 60000) : null;
    return () => { ac.abort(); if (t) clearInterval(t); };
  }, [sym, range, chartTick]);

  /* ---------- sparklines for the tape ---------- */
  useEffect(() => {
    let alive = true;
    const load = async () => {
      try {
        const r = await fetch('/api/sparks');
        const j = await r.json();
        if (alive && j.sparks) setSparks(j.sparks);
      } catch { /* sparklines are decoration; ignore */ }
    };
    load();
    const t = setInterval(load, 300000);
    return () => { alive = false; clearInterval(t); };
  }, []);

  /* ---------- sectors ---------- */
  const isUsIndex = US_INDEX.includes(inst.id);
  const sectorShow = isUsIndex || inst.id === 'VIX' || inst.group === 'Sector ETFs' || (inst.kind === 'Stock' && inst.sess === 'us');
  const sectorNA = !sectorShow && inst.sess === 'hk';
  useEffect(() => {
    if (!sectorShow) return;
    const ac = new AbortController();
    setSectors({ loading: true, returns: null, error: false, asOf: null });
    (async () => {
      try {
        const r = await fetch(`/api/sectors?range=${range}`, { signal: ac.signal });
        if (!r.ok) throw new Error();
        const j = await r.json();
        setSectors({ loading: false, returns: j.returns, error: false, asOf: j.asOf });
      } catch (e) {
        if ((e as Error).name !== 'AbortError') setSectors({ loading: false, returns: null, error: true, asOf: null });
      }
    })();
    return () => ac.abort();
  }, [sectorShow, range]);

  /* ---------- actions ---------- */
  const pick = useCallback((id: string) => setSym(id), []);
  const togglePanel = useCallback((p: PanelId) => setPanel((cur) => (cur === p ? null : p)), []);
  const addInst = (x: Inst) => {
    const next = added.some((a) => a.id === x.id) || BASE.some((b) => b.id === x.id) ? added : [...added, x];
    setAdded(next); lsSet(LS_WATCH, next); setSym(x.id);
  };
  const removeInst = (id: string) => {
    const next = added.filter((a) => a.id !== id);
    setAdded(next); lsSet(LS_WATCH, next);
    if (sym === id) setSym('US10Y');
  };
  const changeAlerts = (a: AlertRule[]) => { setAlerts(a); lsSet(LS_ALERTS, a); };

  const panelMax = Math.max(PW_MIN, Math.min(760, vw - 56 - 480));
  const pw = Math.max(PW_MIN, Math.min(panelMax, (panel && panelWs[panel]) || PW_DEFAULT));
  const pwRef = useRef(pw);
  pwRef.current = pw;
  const panelWsRef = useRef(panelWs);
  panelWsRef.current = panelWs;
  const setPanelW = (w: number, persist = false) => {
    if (!panel) return;
    const c = Math.round(Math.max(PW_MIN, Math.min(panelMax, w)));
    const next = { ...panelWsRef.current, [panel]: c };
    setPanelWs(next);
    if (persist) lsSet(LS_PW, next);
  };
  const drag = useRef({ on: false, raf: 0, x: 0 });
  const splitDown = (e: React.PointerEvent) => {
    if (e.button !== 0) return;
    e.preventDefault(); drag.current.on = true;
    try { (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId); } catch { /* ignore */ }
    document.body.style.userSelect = 'none'; document.body.style.cursor = 'col-resize';
    setDragging(true);
  };
  const splitMove = (e: React.PointerEvent) => {
    if (!drag.current.on) return;
    drag.current.x = e.clientX;
    if (!drag.current.raf) drag.current.raf = requestAnimationFrame(() => { drag.current.raf = 0; setPanelW(window.innerWidth - 56 - drag.current.x); });
  };
  const splitUp = (e: React.PointerEvent) => {
    if (!drag.current.on) return;
    drag.current.on = false;
    try { (e.currentTarget as HTMLElement).releasePointerCapture(e.pointerId); } catch { /* ignore */ }
    document.body.style.userSelect = ''; document.body.style.cursor = '';
    setDragging(false);
    lsSet(LS_PW, panelWsRef.current);
  };
  const splitKey = (e: React.KeyboardEvent) => {
    const step = e.shiftKey ? 80 : 24;
    if (e.key === 'ArrowLeft') setPanelW(pw + step, true);
    else if (e.key === 'ArrowRight') setPanelW(pw - step, true);
    else if (e.key === 'Home') setPanelW(PW_MIN, true);
    else if (e.key === 'End') setPanelW(panelMax, true);
    else return;
    e.preventDefault();
  };

  const onRootKey = (e: React.KeyboardEvent) => {
    const tag = (e.target as HTMLElement).tagName, typing = tag === 'INPUT' || tag === 'TEXTAREA';
    const k = e.key;
    if ((e.metaKey || e.ctrlKey) && (k === 'k' || k === 'K')) { e.preventDefault(); setPalette(true); return; }
    if (k === 'Escape') { if (palette) setPalette(false); else if (infoOpen) setInfoOpen(false); else if (panel) setPanel(null); return; }
    if (typing || e.metaKey || e.ctrlKey || e.altKey) return;
    if (k === '/') { e.preventDefault(); setPalette(true); return; }
    const ri = '12345678'.indexOf(k);
    if (ri >= 0) { setRange(RANGES[ri].id); return; }
    const pm = ({ w: 'watch', c: 'cal', n: 'news', a: 'alerts' } as Record<string, PanelId>)[k.toLowerCase()];
    if (pm) togglePanel(pm);
  };

  /* ---------- derived view data ---------- */
  const compact = !!panel && vw >= 1024; // header tightens when the panel takes width (ARCHITECTURE §6)
  const loading = !mounted || (!quote && !feed.polled);
  const mkt = marketStatus(inst, quote);

  const age = feed.lastOk == null ? Infinity : now - feed.lastOk;
  let feedView: { label: string; color: string; dot: boolean; banner: string | null; bannerBg: string; retry: string };
  if (!feed.polled) feedView = { label: 'Loading', color: 'var(--soft)', dot: false, banner: null, bannerBg: '', retry: '' };
  else if (feed.mode === 'offline') feedView = { label: 'Offline', color: DOWN, dot: false, banner: 'Can’t reach the price feed. Showing the last saved prices.', bannerBg: 'rgba(242,96,107,.08)', retry: feed.retrying ? 'Retrying…' : 'Retry' };
  else if (feed.mode === 'stale') feedView = { label: 'Stale', color: AMBER, dot: false, banner: 'Yahoo Finance is not responding. Showing the last saved prices from the database.', bannerBg: 'rgba(227,163,59,.08)', retry: feed.retrying ? 'Retrying…' : 'Retry now' };
  else if (age > 90000) feedView = { label: 'Stale', color: AMBER, dot: false, banner: `Prices haven’t updated for ${ago(age).replace(' ago', '')}. Yahoo Finance may be rate-limiting us.`, bannerBg: 'rgba(227,163,59,.08)', retry: feed.retrying ? 'Retrying…' : 'Retry now' };
  else feedView = { label: mkt.open ? 'Live' : 'Last close', color: mkt.open ? UP : 'var(--soft)', dot: mkt.open, banner: null, bannerBg: '', retry: '' };

  const vix = quotes.VIX;
  const cnn = initial.sentiment.cnn_fg;
  const cryptoFg = initial.sentiment.crypto_fg;
  const fgVal = cnn?.value ?? null;
  const fgColor = fgVal == null ? 'var(--soft)' : fgVal >= 55 ? UP : fgVal > 45 ? '#b9bfc7' : DOWN;

  let up = 0, down = 0;
  BASE.forEach((x) => { if (x.id === 'VIX' || x.group === 'Rates') return; const c = quotes[x.id]?.change; if (c == null) return; if (c > 0) up++; else if (c < 0) down++; });
  const tot = up + down;
  const word = tot === 0 ? '—' : up / tot >= 0.7 ? 'risk-on' : down / tot >= 0.7 ? 'risk-off' : 'mixed';
  const t10 = quotes.US10Y;
  const next = mounted ? nextEvent(initial.events, now) : null; // time-dependent: only after mount, to avoid a hydration mismatch

  const price = quote?.price ?? null;
  const pS = price == null ? '' : fmt(price, inst.dp), dot = pS.indexOf('.');
  const isRate = inst.group === 'Rates';
  const chgStr = quote ? (isRate ? signed(quote.change * 100, 1) + 'bp' : signed(quote.change, inst.dp)) : '';
  const triggered = alerts.some((a) => { const p = quotes[a.sym]?.price; return p != null && (a.cond === 'above' ? p >= a.val : p <= a.val); });
  const viewSyms = useMemo(() => allInsts, [allInsts]);

  const card = { display: 'flex', flexDirection: 'column', gap: 4 } as const;

  return (
    <div className="mi" ref={rootRef} tabIndex={-1} onKeyDown={onRootKey}>
      <div className="mi-main">
        {/* ---------- top bar ---------- */}
        <header style={{ display: 'flex', alignItems: 'center', gap: 16, padding: '12px 24px', borderBottom: '1px solid var(--line)', flexWrap: compact ? 'nowrap' : 'wrap', overflow: compact ? 'hidden' : undefined }}>
          <div style={{ display: 'flex', alignItems: 'baseline', gap: 10, flexShrink: 0 }}>
            <span className="serif" style={{ fontSize: 26, fontStyle: 'italic', lineHeight: 1 }}>M</span>
            <span style={{ fontSize: 13, fontWeight: 600, letterSpacing: '0.14em' }}>MARKET INTELLIGENCE</span>
          </div>
          <button onClick={() => setPalette(true)} aria-keyshortcuts="Meta+K Control+K /" aria-label="Search symbols or jump to…" className="btn"
            style={{ display: 'flex', alignItems: 'center', justifyContent: compact ? 'center' : undefined, gap: 10, minWidth: compact ? 40 : 220, flex: compact ? '0 0 40px' : '0 1 340px', height: 40, padding: '0 12px', background: 'var(--panel)', border: '1px solid var(--line4)', borderRadius: 8, color: 'var(--soft)', fontSize: 14, textAlign: 'left' }}>
            <svg width="16" height="16" viewBox="0 0 16 16" aria-hidden="true" style={{ fill: 'none', stroke: 'currentColor', strokeWidth: 1.6, strokeLinecap: 'round', flexShrink: 0 }}><circle cx="7" cy="7" r="5" /><path d="M14 14l-3.4-3.4" /></svg>
            {!compact && <span style={{ flexGrow: 1, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>Search symbols or jump to…</span>}
            {!compact && <kbd className="num" style={{ fontSize: 12, color: 'var(--soft)', border: '1px solid var(--line4)', borderRadius: 4, padding: '1px 6px' }}>{mac ? '⌘K' : 'Ctrl K'}</kbd>}
          </button>
          <div style={{ flexGrow: 1 }} />
          <div role="status" aria-live="polite" style={{ display: 'flex', alignItems: 'center', gap: 8, height: 40, padding: '0 12px', border: '1px solid var(--line2)', borderRadius: 8, fontSize: 13, whiteSpace: 'nowrap' }}>
            <span className={feedView.dot ? 'mi-live-dot' : ''} style={{ width: 8, height: 8, borderRadius: 4, background: feedView.color }} />
            {!compact && <span style={{ fontWeight: 500, color: feedView.color }}>{feedView.label}</span>}
            <span style={{ color: 'var(--muted)' }}><Ago ts={feed.lastOk} /></span>
          </div>
          <div style={{ position: 'relative', display: 'flex', alignItems: 'center', gap: 14, height: 40, padding: '0 6px 0 12px', border: '1px solid var(--line2)', borderRadius: 8, fontSize: 13, whiteSpace: 'nowrap' }}>
            <span style={{ display: 'flex', gap: 6, alignItems: 'baseline' }}>
              <span style={{ color: 'var(--muted)' }}>VIX</span>
              <span className="num" style={{ fontWeight: 500 }}>{vix ? fmt(vix.price, 2) : '—'}</span>
              {vix && <span className="num" style={{ fontSize: 12, color: colorOf(vix.change) }}>{pctStr(vix.changePct)}</span>}
            </span>
            <span style={{ width: 1, height: 20, background: 'var(--line2)' }} />
            <span role="img" aria-label={fgVal == null ? 'CNN Fear and Greed index unavailable' : `CNN Fear and Greed index ${fgVal} of 100: ${cnn.label}`} style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
              <span style={{ color: 'var(--muted)' }}>Fear &amp; Greed</span>
              <span aria-hidden="true" className="mi-hide-sm" style={{ position: 'relative', width: 84, height: 4, borderRadius: 2, background: 'var(--line2)' }}>
                {[25, 45, 55, 75].map((p) => <span key={p} style={{ position: 'absolute', left: `${p}%`, top: -2, width: 1, height: 8, background: '#4a5058' }} />)}
                {fgVal != null && <span style={{ position: 'absolute', left: `${fgVal}%`, top: -4, width: 4, height: 12, marginLeft: -2, borderRadius: 2, background: fgColor }} />}
              </span>
              {fgVal != null ? (<><span className="num" style={{ fontWeight: 600 }}>{fgVal}</span><span style={{ color: fgColor }}>{cnn.label}</span></>) : <span style={{ color: 'var(--muted)' }}>—</span>}
            </span>
            <button onClick={() => setInfoOpen((o) => !o)} aria-expanded={infoOpen} aria-controls="mi-info" aria-label="What do VIX and Fear & Greed mean?" className="btn"
              style={{ width: 32, height: 32, border: 'none', background: 'none', borderRadius: 6, color: 'var(--muted)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
              <svg width="16" height="16" viewBox="0 0 16 16" aria-hidden="true" style={{ fill: 'none', stroke: 'currentColor', strokeWidth: 1.5 }}><circle cx="8" cy="8" r="6.5" /><path d="M8 7.2v4M8 4.8v.01" style={{ strokeLinecap: 'round' }} /></svg>
            </button>
            {infoOpen && (
              <div id="mi-info" style={{ position: 'absolute', right: 0, top: 48, width: 320, zIndex: 30, padding: '14px 16px', background: 'var(--raised)', border: '1px solid var(--line3)', borderRadius: 10, whiteSpace: 'normal', display: 'flex', flexDirection: 'column', gap: 10, fontSize: 13, lineHeight: 1.5, boxShadow: '0 16px 40px rgba(0,0,0,.5)' }}>
                <p style={{ margin: 0 }}><strong>VIX</strong> — the options market’s expected S&amp;P 500 volatility over the next 30 days. Above 20 usually means stress; below 15 means calm.</p>
                <p style={{ margin: 0 }}><strong>Fear &amp; Greed</strong> — CNN’s 0–100 stock-market sentiment index (0–25 extreme fear, 75–100 extreme greed).{cnn ? <> Updated <Ago ts={cnn.as_of} />.</> : ' Not available yet.'}</p>
                <p style={{ margin: 0, color: 'var(--muted)' }}>Sources: Yahoo Finance (VIX), CNN (Fear &amp; Greed, unofficial feed).</p>
              </div>
            )}
          </div>
        </header>

        {feedView.banner && (
          <div role="alert" style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '10px 24px', background: feedView.bannerBg, borderBottom: `1px solid ${feedView.color}`, fontSize: 13 }}>
            <svg width="16" height="16" viewBox="0 0 16 16" aria-hidden="true" style={{ fill: 'none', stroke: feedView.color, strokeWidth: 1.6, strokeLinecap: 'round', flexShrink: 0 }}><path d="M8 2 1.5 13.5h13z" /><path d="M8 6.5v3.2M8 11.6v.01" /></svg>
            <span style={{ flexGrow: 1 }}>{feedView.banner}</span>
            <button onClick={() => { setFeed((f) => ({ ...f, retrying: true })); poll(); }} className="btn" style={{ height: 32, padding: '0 14px', borderRadius: 6, border: '1px solid var(--line4)', background: 'var(--panel)', color: 'var(--fg)', fontSize: 13 }}>{feedView.retry}</button>
          </div>
        )}

        {/* ---------- market read ---------- */}
        <section aria-labelledby="mi-read" style={{ padding: '22px 24px 18px', display: 'flex', flexWrap: 'wrap', alignItems: 'flex-end', justifyContent: 'space-between', gap: '12px 32px' }}>
          <h2 id="mi-read" className="serif" style={{ margin: 0, fontSize: 44, lineHeight: 1, letterSpacing: '-0.01em' }}>
            The market is <em style={{ color: word === 'risk-on' ? UP : word === 'risk-off' ? DOWN : '#e8e3d6' }}>{word}</em>.
          </h2>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: '8px 20px', fontSize: 13, color: 'var(--soft)' }}>
            <span className="num">{up} up · {down} down</span>
            <span className="num">10Y {t10 ? signed(t10.change * 100, 1) + 'bp' : '—'} · VIX {vix ? pctStr(vix.changePct) : '—'}</span>
            <button onClick={() => setPanel('cal')} className="btn" style={{ display: 'flex', alignItems: 'center', gap: 8, height: 32, padding: '0 10px', borderRadius: 6, border: '1px solid var(--line3)', background: 'none', color: 'var(--fg)', fontSize: 13 }}>
              <span aria-hidden="true" style={{ display: 'flex', alignItems: 'flex-end', gap: 2, height: 10 }}>
                <span style={{ width: 3, height: 4, background: next ? AMBER : '#3a4048' }} /><span style={{ width: 3, height: 7, background: next ? AMBER : '#3a4048' }} /><span style={{ width: 3, height: 10, background: next && next.impact >= 3 ? AMBER : '#3a4048' }} />
              </span>
              <span>{next ? `Next: ${next.name}` : initial.events.length ? 'No more high-impact events' : 'Calendar'}</span>
              {next && <span className="num" style={{ color: AMBER }}>{next.when}</span>}
            </button>
          </div>
        </section>

        {/* ---------- cross-asset tape ---------- */}
        <nav aria-label="Markets" className="mi-tape">
          {TAPE.map((id) => {
            const x = BASE.find((b) => b.id === id)!, q = quotes[id], sel = id === inst.id, sv = sparks[id];
            let spark = '';
            if (sv && sv.length > 1) {
              const lo = Math.min(...sv), hi = Math.max(...sv);
              sv.forEach((v, j) => { spark += (j ? 'L' : 'M') + ((j / (sv.length - 1)) * 120).toFixed(1) + ' ' + (20 - ((v - lo) / (hi - lo || 1)) * 18).toFixed(1); });
            }
            return (
              <button key={id} onClick={() => pick(id)} aria-pressed={sel} className="btn"
                style={{ display: 'flex', flexDirection: 'column', gap: 6, padding: '12px 14px', border: 'none', background: sel ? 'var(--raised)' : 'var(--bg)', color: 'var(--fg)', textAlign: 'left', boxShadow: `inset 0 -2px 0 ${sel ? 'var(--fg)' : 'transparent'}` }}>
                <span style={{ display: 'flex', justifyContent: 'space-between', gap: 8, fontSize: 12 }}>
                  <span style={{ fontWeight: 600 }}>{x.short}</span>
                  <span className="num" style={{ color: q ? colorOf(q.change) : 'var(--muted)' }}>{q ? (x.group === 'Rates' ? signed(q.change * 100, 1) + 'bp' : pctStr(q.changePct)) : '—'}</span>
                </span>
                <span className="num" style={{ fontSize: 15 }}>{q ? fmt(q.price, x.dp) + (x.unit === '%' ? '%' : '') : '—'}</span>
                <svg width="120" height="22" viewBox="0 0 120 22" aria-hidden="true" style={{ width: '100%', height: 22 }}>
                  {spark && <path d={spark} fill="none" stroke={q ? colorOf(q.change) : 'var(--soft)'} style={{ strokeWidth: 1.4, opacity: 0.85 }} />}
                </svg>
              </button>
            );
          })}
        </nav>

        {/* ---------- asset summary ---------- */}
        <section aria-labelledby="mi-asset" style={{ padding: '24px 24px 8px', display: 'flex', flexDirection: 'column', gap: 16 }}>
          {loading ? (
            <>
              <div aria-hidden="true" style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
                <div className="mi-skel" style={{ width: 280, height: 26 }} /><div className="mi-skel" style={{ width: 360, height: 60 }} /><div className="mi-skel" style={{ width: 520, maxWidth: '100%', height: 18 }} />
              </div>
              <span className="sr-only">Loading prices…</span>
            </>
          ) : (
            <>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                <h1 id="mi-asset" style={{ margin: 0, fontSize: 22, fontWeight: 600 }}>{inst.name}</h1>
                <div style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: '8px 12px', fontSize: 13, color: 'var(--soft)' }}>
                  <span className="num" style={{ color: 'var(--fg)', border: '1px solid var(--line4)', borderRadius: 6, padding: '2px 8px' }}>{inst.id}</span>
                  <span>{inst.kind} · {inst.y}</span><span aria-hidden="true" style={{ color: '#4a5058' }}>·</span>
                  <span style={{ display: 'flex', alignItems: 'center', gap: 6 }}><span style={{ width: 7, height: 7, borderRadius: 4, background: mkt.color }} />{mkt.label}</span>
                  {inst.delayed && <span style={{ color: AMBER, border: '1px solid #6b5326', borderRadius: 6, padding: '2px 8px' }}>Delayed ~10 min</span>}
                  {inst.group === 'Crypto' && cryptoFg && <span>Crypto Fear &amp; Greed <span className="num" style={{ color: 'var(--fg)' }}>{cryptoFg.value}</span> · {cryptoFg.label}</span>}
                </div>
              </div>
              {quote ? (
                <div style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'flex-end', gap: '16px 48px' }}>
                  <div style={card}>
                    <div style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'baseline', gap: '6px 14px' }}>
                      <span className="num mi-bigprice" style={{ fontSize: 64, lineHeight: 1, fontWeight: 500, letterSpacing: '-0.03em' }}>
                        {dot >= 0 ? pS.slice(0, dot) : pS}<span style={{ color: '#6c737d' }}>{dot >= 0 ? pS.slice(dot) : ''}</span>
                      </span>
                      <span style={{ fontSize: 18, color: 'var(--muted)' }}>{inst.unit}</span>
                      <span className="num" style={{ fontSize: 20, fontWeight: 500, color: colorOf(quote.change) }}>{chgStr} ({pctStr(quote.changePct)})</span>
                    </div>
                    <span style={{ fontSize: 12, color: 'var(--muted)' }}>Today · {quote.source} · quote time <Ago ts={quote.asOf} /></span>
                  </div>
                  <dl className="mi-stats" style={{ margin: 0, paddingBottom: 6 }}>
                    <div style={card}><dt style={{ fontSize: 12, color: 'var(--muted)' }}>Prev close</dt><dd className="num" style={{ margin: 0, fontSize: 15 }}>{quote.prevClose != null ? fmt(quote.prevClose, inst.dp) : '—'}</dd></div>
                    <div style={card}><dt style={{ fontSize: 12, color: 'var(--muted)' }}>Day range</dt><dd className="num" style={{ margin: 0, fontSize: 15 }}>{quote.dayLow != null && quote.dayHigh != null ? `${fmt(quote.dayLow, inst.dp)} – ${fmt(quote.dayHigh, inst.dp)}` : '—'}</dd></div>
                    <div style={card}><dt style={{ fontSize: 12, color: 'var(--muted)' }}>52-week range</dt><dd className="num" style={{ margin: 0, fontSize: 15 }}>{quote.wk52Low != null && quote.wk52High != null ? `${fmt(quote.wk52Low, inst.dp)} – ${fmt(quote.wk52High, inst.dp)}` : '—'}</dd></div>
                    <div style={card}><dt style={{ fontSize: 12, color: 'var(--muted)' }}>Watch for</dt><dd style={{ margin: 0, fontSize: 14 }}>{inst.driver}</dd></div>
                  </dl>
                </div>
              ) : (
                <p style={{ margin: 0, fontSize: 14, color: 'var(--soft)' }}>No price available for {inst.id} right now.</p>
              )}
            </>
          )}
        </section>

        <Chart inst={inst} quote={quote} range={range} onRange={setRange} state={mounted ? chart : { ...chart, loading: true }} onRetry={() => setChartTick((t) => t + 1)} />

        {sectorShow && mounted && <Sectors inst={inst} range={range} state={sectors} isUsIndex={isUsIndex} onPick={pick} />}
        {sectorNA && <p style={{ margin: '0 24px 28px', padding: '12px 16px', border: '1px dashed var(--line3)', borderRadius: 10, fontSize: 13, color: 'var(--soft)' }}>Hong Kong sector breakdown isn’t available yet — US sectors only in v1.</p>}
      </div>

      {/* ---------- side panel ---------- */}
      {panel && (
        <>
          <button className="mi-scrim" onClick={() => setPanel(null)} aria-label="Close panel" tabIndex={-1} />
          <aside className="mi-panel" aria-labelledby="mi-panel-h" style={{ ['--mi-pw' as string]: pw + 'px' }}>
            <div className="mi-split" role="separator" aria-orientation="vertical" aria-label="Resize panel" aria-valuenow={pw} aria-valuemin={PW_MIN} aria-valuemax={panelMax} aria-keyshortcuts="ArrowLeft ArrowRight Home End"
              tabIndex={0} data-drag={dragging} title="Drag to resize · double-click to reset" onPointerDown={splitDown} onPointerMove={splitMove} onPointerUp={splitUp} onPointerCancel={splitUp} onKeyDown={splitKey} onDoubleClick={() => setPanelW(PW_DEFAULT, true)}>
              <span className="mi-grip" />
            </div>
            <div style={{ height: 60, flexShrink: 0, display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '0 10px 0 20px', borderBottom: '1px solid var(--line)' }}>
              <h2 id="mi-panel-h" style={{ margin: 0, fontSize: 15, fontWeight: 600 }}>{PANELS.find((p) => p.id === panel)!.label}</h2>
              <button onClick={() => setPanel(null)} aria-label="Close panel (Esc)" className="btn" style={{ width: 44, height: 44, border: 'none', background: 'none', borderRadius: 8, color: 'var(--soft)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                <svg width="20" height="20" viewBox="0 0 24 24" aria-hidden="true" style={{ fill: 'none', stroke: 'currentColor', strokeWidth: 1.8, strokeLinecap: 'round' }}><path d="M17 7 7 17M7 7l10 10" /></svg>
              </button>
            </div>
            {panel === 'watch' && <WatchlistPanel list={list} addedIds={new Set(added.map((a) => a.id))} quotes={quotes} currentId={inst.id} onPick={pick} onAdd={addInst} onRemove={removeInst} />}
            {panel === 'cal' && <CalendarPanel events={initial.events} />}
            {panel === 'news' && <NewsPanel news={initial.news} />}
            {panel === 'alerts' && <AlertsPanel inst={inst} price={price} alerts={alerts} priceOf={(id) => ({ price: quotes[id]?.price ?? null, dp: allInsts.find((x) => x.id === id)?.dp ?? 2 })} onChange={changeAlerts} />}
          </aside>
        </>
      )}

      {/* ---------- rail ---------- */}
      <nav className="mi-rail" aria-label="Panels">
        {PANELS.map((p) => {
          const on = panel === p.id;
          return (
            <button key={p.id} className="mi-railbtn btn" onClick={() => togglePanel(p.id)} aria-pressed={on} aria-label={p.label} aria-keyshortcuts={p.key}
              style={{ width: 44, height: 44, border: 'none', borderRadius: 8, background: on ? 'var(--line)' : 'transparent', color: on ? 'var(--fg)' : 'var(--soft)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
              <svg width="22" height="22" viewBox="0 0 24 24" aria-hidden="true" style={{ fill: 'none', stroke: 'currentColor', strokeWidth: 1.75, strokeLinecap: 'round', strokeLinejoin: 'round' }}><path d={ICONS[p.id]} /></svg>
              {p.id === 'alerts' && triggered && <span aria-hidden="true" style={{ position: 'absolute', top: 8, right: 8, width: 7, height: 7, borderRadius: 4, background: AMBER }} />}
              <span className="mi-tip">{p.label} <span className="num" style={{ color: 'var(--muted)' }}>{p.key}</span></span>
            </button>
          );
        })}
      </nav>

      <Palette open={palette} onClose={() => setPalette(false)} symbols={viewSyms} onSymbol={pick} onPanel={setPanel} onRange={setRange} />
    </div>
  );
}
