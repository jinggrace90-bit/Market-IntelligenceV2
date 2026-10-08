'use client';
import { useEffect, useMemo, useRef, useState } from 'react';
import { lsGet, lsSet } from '@/lib/client';
import { colorOf, DOWN, fmt, pctStr, signed, UP } from '@/lib/format';
import { RANGES, type RangeId } from '@/lib/ranges';
import type { ChartResponse, Inst, Quote } from '@/lib/types';

export interface ChartState { loading: boolean; data: ChartResponse | null; error: boolean }
type ChartType = 'line' | 'area' | 'candle';

const LS_TYPE = 'mi.chartType.v1';
const TYPES: { id: ChartType; label: string; icon: string }[] = [
  { id: 'line', label: 'Line', icon: 'M3 16l5-6 4 3 6-8' },
  { id: 'area', label: 'Area', icon: 'M3 17l5-6 4 3 6-8v11z' },
  { id: 'candle', label: 'Candles', icon: 'M7 5v3M7 14v3M5.5 8h3v6h-3zM15 4v2M15 12v4M13.5 6h3v6h-3z' },
];

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

function parts(ts: number, tz: string | null) {
  try {
    const f = new Intl.DateTimeFormat('en-GB', { timeZone: tz ?? undefined, day: 'numeric', month: 'numeric', year: 'numeric', hour: '2-digit', minute: '2-digit', hourCycle: 'h23', timeZoneName: 'short' });
    const o: Record<string, string> = {};
    f.formatToParts(ts).forEach((p) => (o[p.type] = p.value));
    return { d: Number(o.day), m: Number(o.month) - 1, y: Number(o.year), hh: o.hour, mm: o.minute, tz: o.timeZoneName ?? '' };
  } catch {
    const d = new Date(ts);
    return { d: d.getDate(), m: d.getMonth(), y: d.getFullYear(), hh: String(d.getHours()).padStart(2, '0'), mm: String(d.getMinutes()).padStart(2, '0'), tz: '' };
  }
}
function shortLabel(range: RangeId, ts: number, tz: string | null): string {
  const p = parts(ts, tz);
  if (range === '1D') return `${p.hh}:${p.mm}`;
  if (range === '1Y' || range === '5Y' || range === 'All') return `${MONTHS[p.m]} ’${String(p.y).slice(2)}`;
  return `${MONTHS[p.m]} ${p.d}`;
}
function longLabel(range: RangeId, ts: number, tz: string | null): string {
  const p = parts(ts, tz);
  if (range === '1D') return `${p.hh}:${p.mm} ${p.tz}`.trim();
  const date = `${p.d} ${MONTHS[p.m]} ${p.y}`;
  return range === '5D' || range === '1M' ? `${date}, ${p.hh}:${p.mm}` : date;
}

interface Candle { t: number; o: number; h: number; l: number; c: number }

interface Props {
  inst: Inst;
  quote?: Quote;
  range: RangeId;
  onRange: (r: RangeId) => void;
  state: ChartState;
  onRetry: () => void;
}

export default function Chart({ inst, quote, range, onRange, state, onRetry }: Props) {
  const wrapRef = useRef<HTMLDivElement>(null);
  const [w, setW] = useState(0);
  const [hover, setHover] = useState<number | null>(null);
  const [type, setType] = useState<ChartType>('area');

  useEffect(() => { const t = lsGet<ChartType>(LS_TYPE, 'area'); if (TYPES.some((x) => x.id === t)) setType(t); }, []);
  const chooseType = (t: ChartType) => { setType(t); lsSet(LS_TYPE, t); setHover(null); };

  useEffect(() => {
    const el = wrapRef.current;
    if (!el) return;
    const measure = () => setW(el.getBoundingClientRect().width);
    measure();
    const ro = new ResizeObserver(measure);
    ro.observe(el);
    return () => ro.disconnect();
  }, []);
  useEffect(() => setHover(null), [inst.id, range, state.data]);

  const pts = state.data?.points ?? [];
  const tz = state.data?.tz ?? null;
  const rangeName = RANGES.find((r) => r.id === range)!.name;
  const unitSfx = inst.unit === '%' ? '%' : '';
  // Candles need open/high/low for every point; a saved fallback copy may only have closes.
  const hasOhlc = pts.length > 1 && pts.every((p) => p[2] != null && p[3] != null && p[4] != null);
  const mode: ChartType = type === 'candle' && !hasOhlc ? 'line' : type;
  const candleMode = mode === 'candle';

  const m = useMemo(() => {
    const n = pts.length;
    if (n < 2) return null;
    const v = pts.map((p) => p[1]);
    const cw = w || 900, gutter = 72;
    const plotW = Math.max(200, cw - gutter), plotH = cw < 600 ? 260 : 400;

    // Candles: merge neighbouring points so each candle stays at least ~6px wide.
    let cs: Candle[] = [];
    if (candleMode) {
      const target = Math.max(20, Math.floor(plotW / 6));
      const size = Math.ceil(n / target);
      for (let i = 0; i < n; i += size) {
        const g = pts.slice(i, i + size);
        cs.push({ t: g[0][0], o: g[0][2]!, h: Math.max(...g.map((p) => p[3]!)), l: Math.min(...g.map((p) => p[4]!)), c: g[g.length - 1][1] });
      }
    }
    const K = cs.length;
    const mn = candleMode ? Math.min(...cs.map((c) => c.l)) : Math.min(...v);
    const mx = candleMode ? Math.max(...cs.map((c) => c.h)) : Math.max(...v);
    const pad = (mx - mn) * 0.12 || v[n - 1] * 0.01, lo = mn - pad, hi = mx + pad;
    const X = (i: number) => (i / (n - 1)) * plotW;
    const Y = (val: number) => 12 + ((hi - val) / (hi - lo)) * (plotH - 24);
    let lineD = '';
    for (let i = 0; i < n; i++) lineD += (i ? 'L' : 'M') + X(i).toFixed(1) + ' ' + Y(v[i]).toFixed(1);
    const lastY = Y(v[n - 1]);
    let gridD = '';
    const yTicks: { y: number; label: string }[] = [];
    for (let k = 0; k < 5; k++) {
      const val = hi - ((hi - lo) * (k + 0.5)) / 5, yy = Y(val);
      gridD += `M0 ${yy.toFixed(1)}H${plotW}`;
      if (Math.abs(yy - lastY) > 18) yTicks.push({ y: yy - 8, label: fmt(val, inst.dp) });
    }
    const nx = cw < 600 ? 3 : 5;
    const xTicks = Array.from({ length: nx }, (_, q) => {
      if (candleMode) { const ki = Math.min(K - 1, Math.floor((K * (q + 0.5)) / nx)); return { x: ((ki + 0.5) / K) * plotW, label: shortLabel(range, cs[ki].t, tz) }; }
      const xi = Math.round(((n - 1) * (q + 0.5)) / nx);
      return { x: X(xi), label: shortLabel(range, pts[xi][0], tz) };
    });
    return { n, K, cs, v, plotW, plotH, mn, mx, X, Y, lineD, lastY, gridD, yTicks, xTicks };
  }, [pts, w, inst.dp, range, tz, candleMode]);

  const count = m ? (candleMode ? m.K : m.n) : 0; // number of hoverable positions
  // Period change: for 1D use the exchange's own day change; otherwise first→last point of the chart.
  let pchg = 0, pBase = 0;
  if (m) {
    if (range === '1D' && quote) { pchg = quote.change; pBase = quote.price - quote.change; }
    else { pchg = m.v[m.n - 1] - m.v[0]; pBase = m.v[0]; }
  }
  const lineColor = pchg >= 0 ? UP : DOWN;
  const periodStr = m ? `${signed(pchg, inst.dp)} (${pctStr(pBase ? (pchg / pBase) * 100 : 0)})` : '';
  const hasHover = !!m && hover !== null && hover >= 0 && hover < count;

  const onMove = (e: React.MouseEvent<HTMLDivElement>) => {
    if (!m) return;
    const rect = e.currentTarget.getBoundingClientRect();
    const f = (e.clientX - rect.left) / m.plotW;
    const idx = candleMode ? Math.floor(f * m.K) : Math.round(f * (m.n - 1));
    const c = Math.max(0, Math.min(count - 1, idx));
    if (c !== hover) setHover(c);
  };
  const onKey = (e: React.KeyboardEvent) => {
    if (!m) return;
    const h = hover === null ? count - 1 : hover, step = e.shiftKey ? Math.max(1, Math.round(count / 10)) : 1;
    if (e.key === 'ArrowLeft') { e.preventDefault(); setHover(Math.max(0, h - step)); }
    else if (e.key === 'ArrowRight') { e.preventDefault(); setHover(Math.min(count - 1, h + step)); }
    else if (e.key === 'Home') { e.preventDefault(); setHover(0); }
    else if (e.key === 'End') { e.preventDefault(); setHover(count - 1); }
  };

  // What the tooltip / screen reader says for the hovered position.
  const hov = hasHover && m
    ? candleMode
      ? { x: ((hover! + 0.5) / m.K) * m.plotW, y: m.Y(m.cs[hover!].c), label: longLabel(range, m.cs[hover!].t, tz), c: m.cs[hover!] }
      : { x: m.X(hover!), y: m.Y(m.v[hover!]), label: longLabel(range, pts[hover!][0], tz), c: null }
    : null;
  const hovText = hov && m ? (hov.c ? `O ${fmt(hov.c.o, inst.dp)} H ${fmt(hov.c.h, inst.dp)} L ${fmt(hov.c.l, inst.dp)} C ${fmt(hov.c.c, inst.dp)}${unitSfx}` : fmt(m.v[hover!], inst.dp) + unitSfx) : '';

  return (
    <section aria-labelledby="mi-chart-h" style={{ flexGrow: 1, display: 'flex', flexDirection: 'column', padding: '8px 24px 28px', minWidth: 0 }}>
      <div style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'center', justifyContent: 'space-between', gap: 10, minHeight: 44 }}>
        <h2 id="mi-chart-h" style={{ margin: 0, display: 'flex', alignItems: 'baseline', gap: 10, fontSize: 13, fontWeight: 400, color: 'var(--muted)' }}>
          {rangeName} <span className="num" style={{ fontSize: 14, fontWeight: 500, color: lineColor }}>{periodStr}</span>
        </h2>
        <div style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: 8, minWidth: 0 }}>
          <div role="group" aria-label="Chart range" className="mi-ranges">
            {RANGES.map((r, i) => {
              const on = r.id === range;
              return (
                <button key={r.id} onClick={() => onRange(r.id)} aria-pressed={on} aria-keyshortcuts={String(i + 1)} title={`${r.name} (${i + 1})`} className="num btn"
                  style={{ height: 36, minWidth: 44, padding: '0 10px', border: 'none', borderRadius: 6, background: on ? 'var(--line)' : 'transparent', color: on ? 'var(--fg)' : 'var(--soft)', fontSize: 13 }}>
                  {r.id}
                </button>
              );
            })}
          </div>
          <div role="group" aria-label="Chart type" style={{ display: 'flex', border: '1px solid var(--line4)', borderRadius: 6, overflow: 'hidden' }}>
            {TYPES.map((t) => {
              const on = type === t.id;
              return (
                <button key={t.id} onClick={() => chooseType(t.id)} aria-pressed={on} title={t.id === 'candle' && !hasOhlc && pts.length ? 'Candles need open/high/low data, not available for this copy' : t.label} className="btn"
                  style={{ height: 34, padding: '0 10px', display: 'flex', alignItems: 'center', gap: 6, border: 'none', background: on ? 'var(--line)' : 'transparent', color: on ? 'var(--fg)' : 'var(--soft)', fontSize: 13 }}>
                  <svg width="16" height="16" viewBox="0 0 20 20" aria-hidden="true" style={{ fill: t.id === 'area' ? 'currentColor' : 'none', fillOpacity: t.id === 'area' ? 0.18 : 0, stroke: 'currentColor', strokeWidth: 1.6, strokeLinecap: 'round', strokeLinejoin: 'round' }}><path d={t.icon} /></svg>
                  <span className="mi-hide-sm">{t.label}</span>
                </button>
              );
            })}
          </div>
        </div>
      </div>

      <div ref={wrapRef} style={{ position: 'relative', marginTop: 8, minWidth: 0 }}>
        {state.loading && <div className="mi-skel" aria-hidden="true" style={{ width: '100%', height: w < 600 ? 260 : 400 }} />}
        {!state.loading && (state.error || !m) && (
          <div role="alert" style={{ height: w < 600 ? 260 : 400, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 12, border: '1px dashed var(--line3)', borderRadius: 10, color: 'var(--soft)', fontSize: 13 }}>
            <span>{state.error ? 'Chart data is unavailable right now.' : 'Not enough data for this range.'}</span>
            {state.error && <button onClick={onRetry} className="btn" style={{ height: 32, padding: '0 14px', borderRadius: 6, border: '1px solid var(--line4)', background: 'var(--panel)', color: 'var(--fg)', fontSize: 13 }}>Retry</button>}
          </div>
        )}
        {!state.loading && m && (
          <>
            <div tabIndex={0} role="img" aria-keyshortcuts="ArrowLeft ArrowRight Home End" onKeyDown={onKey} onMouseMove={onMove} onMouseLeave={() => setHover(null)} onBlur={() => setHover(null)}
              aria-label={`${inst.name} ${rangeName.toLowerCase()}, ${candleMode ? 'candlestick' : mode} chart: from ${fmt(m.v[0], inst.dp)} to ${fmt(m.v[m.n - 1], inst.dp)}${unitSfx}, low ${fmt(m.mn, inst.dp)}, high ${fmt(m.mx, inst.dp)}. Use arrow keys to read values.`}
              style={{ position: 'relative', height: m.plotH, cursor: 'crosshair', borderRadius: 4 }}>
              <svg width={m.plotW} height={m.plotH} style={{ position: 'absolute', left: 0, top: 0, overflow: 'visible' }} aria-hidden="true">
                <path d={m.gridD} style={{ fill: 'none', stroke: '#1d2126', strokeWidth: 1 }} />
                {mode === 'area' && <path d={`${m.lineD}L${m.plotW} ${m.plotH}L0 ${m.plotH}Z`} fill={pchg >= 0 ? 'rgba(63,207,142,.07)' : 'rgba(242,96,107,.07)'} />}
                {!candleMode && <path d={m.lineD} fill="none" stroke={lineColor} style={{ strokeWidth: 1.6, strokeLinejoin: 'round' }} />}
                {candleMode && m.cs.map((c, k) => {
                  const cw = m.plotW / m.K, x = (k + 0.5) * cw, bw = Math.max(1.5, Math.min(cw * 0.68, 14));
                  const up = c.c >= c.o, col = up ? UP : DOWN;
                  const top = m.Y(Math.max(c.o, c.c)), bot = m.Y(Math.min(c.o, c.c));
                  return (
                    <g key={k}>
                      <line x1={x} x2={x} y1={m.Y(c.h)} y2={m.Y(c.l)} stroke={col} strokeWidth={1} />
                      <rect x={x - bw / 2} y={top} width={bw} height={Math.max(1, bot - top)} fill={col} />
                    </g>
                  );
                })}
                <path d={`M0 ${m.lastY.toFixed(1)}H${m.plotW}`} fill="none" stroke={lineColor} style={{ strokeWidth: 1, strokeDasharray: '2 4', opacity: 0.55 }} />
                {!candleMode && <circle cx={m.plotW} cy={m.lastY} r={4} fill={lineColor} />}
                {hov && (
                  <>
                    <path d={`M${hov.x.toFixed(1)} 0V${m.plotH}${candleMode ? '' : `M0 ${hov.y.toFixed(1)}H${m.plotW}`}`} style={{ fill: 'none', stroke: '#6c737d', strokeWidth: 1, strokeDasharray: '3 3' }} />
                    {!candleMode && <circle cx={hov.x} cy={hov.y} r={4.5} fill="var(--bg)" stroke={lineColor} style={{ strokeWidth: 2 }} />}
                  </>
                )}
              </svg>
              {m.yTicks.map((t, i) => (
                <div key={i} className="num" aria-hidden="true" style={{ position: 'absolute', left: m.plotW + 10, top: t.y, fontSize: 12, color: 'var(--muted)' }}>{t.label}</div>
              ))}
              <div className="num" aria-hidden="true" style={{ position: 'absolute', left: m.plotW + 6, top: m.lastY - 11, height: 22, padding: '0 8px', borderRadius: 4, background: lineColor, color: 'var(--bg)', fontSize: 12, fontWeight: 600, lineHeight: '22px' }}>
                {fmt(m.v[m.n - 1], inst.dp) + unitSfx}
              </div>
              {hov && (
                <div aria-hidden="true" style={{ position: 'absolute', left: Math.max(0, Math.min(hov.x + 14, m.plotW - (hov.c ? 320 : 170))), top: 10, padding: '8px 12px', borderRadius: 8, background: 'var(--raised)', border: '1px solid var(--line3)', display: 'flex', flexDirection: 'column', gap: 2, pointerEvents: 'none' }}>
                  <span className="num" style={{ fontSize: 14, fontWeight: 600, whiteSpace: 'nowrap' }}>{hovText}</span>
                  <span style={{ fontSize: 12, color: 'var(--soft)' }}>{hov.label}</span>
                </div>
              )}
            </div>
            <div style={{ position: 'relative', height: 26 }}>
              {m.xTicks.map((t, i) => (
                <span key={i} aria-hidden="true" style={{ position: 'absolute', left: t.x, top: 6, transform: 'translateX(-50%)', fontSize: 12, color: 'var(--muted)', whiteSpace: 'nowrap' }}>{t.label}</span>
              ))}
            </div>
            <span aria-live="polite" className="sr-only">{hov ? `${hov.label}: ${hovText}` : ''}</span>
          </>
        )}
      </div>

      <p style={{ margin: '14px 0 0', fontSize: 12, color: 'var(--muted)' }}>
        {state.data ? <>Chart: {state.data.source}{state.data.stale ? ' · saved copy, live feed unavailable' : ''} · last point {longLabel(range, state.data.points[state.data.points.length - 1][0], tz)}.{type === 'candle' && !hasOhlc && pts.length > 1 ? ' Candles unavailable for this copy, showing a line.' : ''}{' '}</> : null}
        Keyboard: <kbd className="num">1</kbd>–<kbd className="num">8</kbd> ranges · <kbd className="num">←</kbd> <kbd className="num">→</kbd> on the chart · <kbd className="num">W</kbd> <kbd className="num">C</kbd> <kbd className="num">E</kbd> <kbd className="num">N</kbd> <kbd className="num">A</kbd> panels · <kbd className="num">Esc</kbd> close
      </p>
    </section>
  );
}

export { colorOf };
