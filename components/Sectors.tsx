'use client';
import { colorOf, pctStr } from '@/lib/format';
import { BASE, HELPERS, STOCK_SECTOR } from '@/lib/instruments';
import type { RangeId } from '@/lib/ranges';
import type { Inst } from '@/lib/types';

export interface SectorState { loading: boolean; returns: Record<string, number> | null; error: boolean; asOf: string | null }

const SECTORS = HELPERS.filter((h) => h.group === 'Sector ETFs');

interface Props {
  inst: Inst;
  range: RangeId;
  state: SectorState;
  isUsIndex: boolean;
  onPick: (id: string) => void;
}

export default function Sectors({ inst, range, state, isUsIndex, onPick }: Props) {
  const ret = state.returns;
  const box = { padding: '18px 20px 14px', border: '1px solid var(--line)', borderRadius: 10, display: 'flex', flexDirection: 'column', gap: 12 } as const;

  if (state.loading || !ret) {
    return (
      <div className="mi-internals">
        <section style={box} aria-busy={state.loading}>
          <h2 style={{ margin: 0, fontSize: 16, fontWeight: 600 }}>Sector performance</h2>
          {state.loading ? <div className="mi-skel" style={{ height: 280 }} aria-hidden="true" /> : <p style={{ margin: 0, fontSize: 13, color: 'var(--soft)' }}>Sector data is unavailable right now.</p>}
        </section>
        <section style={box}><h2 style={{ margin: 0, fontSize: 16, fontWeight: 600 }}>Market internals</h2>{state.loading && <div className="mi-skel" style={{ height: 180 }} aria-hidden="true" />}</section>
      </div>
    );
  }

  const ref = isUsIndex ? inst : BASE[0];
  const refRet = ret[ref.id] ?? 0;
  const hl = STOCK_SECTOR[inst.id] || (inst.group === 'Sector ETFs' ? inst.id : null);
  const secs = SECTORS.filter((s) => ret[s.id] != null).map((s) => ({ s, p: ret[s.id] })).sort((a, b) => b.p - a.p);
  const maxAbs = Math.max(...secs.map((o) => Math.abs(o.p)), Math.abs(refRet), 0.1) * 1.15;
  const beat = secs.filter((o) => o.p > refRet).length;
  const total = secs.length;

  const R = (id: string) => ret[id];
  const spreads = [
    { label: 'Equal-weight vs S&P 500', a: 'RSP', b: 'SPY', pos: 'Broad participation', neg: 'Narrow, mega-cap led' },
    { label: 'Small caps vs large caps', a: 'IWM', b: 'SPY', pos: 'Risk appetite rising', neg: 'Preference for size & quality' },
    { label: 'Cyclicals vs defensives', a: 'XLY', b: 'XLP', pos: 'Risk-on rotation', neg: 'Defensive rotation' },
  ].filter((sp) => R(sp.a) != null && R(sp.b) != null).map((sp) => ({ sp, v: R(sp.a) - R(sp.b) }));
  const smax = Math.max(...spreads.map((o) => Math.abs(o.v)), 0.5) * 1.2;
  const hlName = hl ? SECTORS.find((s) => s.id === hl)?.sector : null;

  return (
    <div className="mi-internals">
      <section aria-labelledby="mi-sec-h" style={box}>
        <div style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'baseline', justifyContent: 'space-between', gap: '4px 16px' }}>
          <h2 id="mi-sec-h" style={{ margin: 0, fontSize: 16, fontWeight: 600 }}>Sector performance <span className="num" style={{ fontSize: 13, fontWeight: 400, color: 'var(--soft)' }}>US · {range}</span></h2>
          {secs.length > 0 && (
            <span className="num" style={{ fontSize: 12, color: 'var(--soft)' }}>
              {beat} of {total} beat {ref.short} · leader {secs[0].s.sectorShort} {pctStr(secs[0].p)} · laggard {secs[total - 1].s.sectorShort} {pctStr(secs[total - 1].p)}
            </span>
          )}
        </div>
        <ol aria-label="Sectors ranked by performance" style={{ listStyle: 'none', margin: 0, padding: 0, display: 'flex', flexDirection: 'column', gap: 2 }}>
          {secs.map(({ s, p }) => {
            const w = (Math.abs(p) / maxAbs) * 50, up = p >= 0, rel = p - refRet, mine = s.id === hl;
            const aria = `${s.sector} (${s.id}) ${pctStr(p)}, ${rel >= 0 ? 'outperforming ' : 'underperforming '}${ref.short} by ${Math.abs(rel).toFixed(2)} points${mine ? ', this stock’s sector' : ''}. Open chart.`;
            return (
              <li key={s.id}>
                <button onClick={() => onPick(s.id)} aria-label={aria} title={aria} className="btn"
                  style={{ width: '100%', minHeight: 32, display: 'grid', gridTemplateColumns: 'minmax(96px,168px) minmax(0,1fr) 64px', gap: 12, alignItems: 'center', padding: '0 8px', border: `1px solid ${mine ? 'var(--fg)' : 'transparent'}`, borderRadius: 6, background: mine ? 'var(--raised)' : 'transparent', color: 'var(--fg)', textAlign: 'left' }}>
                  <span style={{ display: 'flex', alignItems: 'baseline', gap: 8, minWidth: 0 }}>
                    <span style={{ fontSize: 13, fontWeight: mine ? 600 : 400, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{s.sector}</span>
                    <span className="num" style={{ fontSize: 11, color: 'var(--muted)' }}>{s.id}</span>
                  </span>
                  <span aria-hidden="true" style={{ position: 'relative', height: 14 }}>
                    <span style={{ position: 'absolute', left: '50%', top: -6, bottom: -6, width: 1, background: '#4a5058' }} />
                    <span style={{ position: 'absolute', left: `${50 + (refRet / maxAbs) * 50}%`, top: -8, bottom: -8, borderLeft: '1px dashed var(--soft)' }} />
                    <span style={{ position: 'absolute', top: 2, height: 10, left: `${up ? 50 : 50 - w}%`, width: `${Math.max(0.6, w)}%`, borderRadius: up ? '0 4px 4px 0' : '4px 0 0 4px', background: colorOf(p) }} />
                  </span>
                  <span className="num" style={{ fontSize: 13, textAlign: 'right' }}>{pctStr(p)}</span>
                </button>
              </li>
            );
          })}
        </ol>
        <div style={{ display: 'flex', flexWrap: 'wrap', justifyContent: 'space-between', gap: '6px 16px', fontSize: 12, color: 'var(--muted)' }}>
          <span style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <span aria-hidden="true" style={{ width: 14, borderTop: '1px dashed var(--soft)' }} />
            <span className="num">{ref.short} {pctStr(refRet)} (dashed line)</span>
            {hlName && inst.group !== 'Sector ETFs' && <span style={{ color: 'var(--fg)' }}>· {inst.id} is in {hlName} (outlined)</span>}
          </span>
          <span>SPDR sector ETFs via Yahoo Finance · follows the chart range · click to chart</span>
        </div>
      </section>

      <section aria-labelledby="mi-br-h" style={{ ...box, gap: 16 }}>
        <div style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'baseline', justifyContent: 'space-between', gap: '4px 16px' }}>
          <h2 id="mi-br-h" style={{ margin: 0, fontSize: 16, fontWeight: 600 }}>Market internals <span className="num" style={{ fontSize: 13, fontWeight: 400, color: 'var(--soft)' }}>{range}</span></h2>
          <span style={{ fontSize: 12, color: 'var(--soft)' }}>Who is leading the move?</span>
        </div>
        {spreads.map(({ sp, v }) => {
          const w = (Math.abs(v) / smax) * 50, pos = v >= 0;
          return (
            <div key={sp.label} style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', gap: 12 }}>
                <span style={{ fontSize: 14, fontWeight: 500 }}>{sp.label}</span>
                <span className="num" style={{ fontSize: 15, fontWeight: 600, color: colorOf(v) }}>{(pos ? '+' : '−') + Math.abs(v).toFixed(2)} pts</span>
              </div>
              <span aria-hidden="true" style={{ position: 'relative', display: 'block', height: 6, borderRadius: 3, background: '#1d2126' }}>
                <span style={{ position: 'absolute', left: '50%', top: -4, bottom: -4, width: 1, background: '#4a5058' }} />
                <span style={{ position: 'absolute', top: 0, height: 6, left: `${pos ? 50 : 50 - w}%`, width: `${Math.max(0.8, w)}%`, borderRadius: pos ? '0 3px 3px 0' : '3px 0 0 3px', background: colorOf(v) }} />
              </span>
              <div style={{ display: 'flex', justifyContent: 'space-between', gap: 12, fontSize: 12 }}>
                <span className="num" style={{ color: 'var(--muted)' }}>{sp.a} − {sp.b}</span>
                <span>{Math.abs(v) < 0.1 ? 'In line' : pos ? sp.pos : sp.neg}</span>
              </div>
            </div>
          );
        })}
        {total > 0 && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 6, paddingTop: 14, borderTop: '1px solid var(--line)' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', gap: 12 }}>
              <span style={{ fontSize: 14, fontWeight: 500 }}>Sectors beating {ref.short}</span>
              <span className="num" style={{ fontSize: 15, fontWeight: 600 }}>{beat} / {total}</span>
            </div>
            <span role="img" aria-label={`${beat} of ${total} sectors beat ${ref.short}`} style={{ position: 'relative', display: 'block', height: 6, borderRadius: 3, background: '#1d2126' }}>
              <span style={{ position: 'absolute', left: 0, top: 0, height: 6, width: `${(beat / total) * 100}%`, borderRadius: 3, background: 'var(--soft)' }} />
            </span>
            <div style={{ display: 'flex', justifyContent: 'space-between', gap: 12, fontSize: 12 }}>
              <span style={{ color: 'var(--muted)' }}>From the sector chart</span>
              <span>{beat >= 7 ? 'Broad strength' : beat <= 4 ? 'Narrow leadership' : 'Mixed'}</span>
            </div>
          </div>
        )}
        <p style={{ margin: 0, fontSize: 12, lineHeight: 1.5, color: 'var(--muted)' }}>
          Spread = difference in % change over the chart range, in percentage points. RSP, SPY, IWM, XLY, XLP via Yahoo Finance{state.asOf ? '' : ''}.
        </p>
      </section>
    </div>
  );
}
