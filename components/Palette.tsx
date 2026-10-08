'use client';
import { useEffect, useMemo, useRef, useState } from 'react';
import { RANGES, type RangeId } from '@/lib/ranges';
import type { Inst } from '@/lib/types';

export type PanelId = 'watch' | 'cal' | 'earn' | 'news' | 'alerts';
export const PANELS: { id: PanelId; label: string; key: string }[] = [
  { id: 'watch', label: 'Watchlist', key: 'W' },
  { id: 'cal', label: 'Economic calendar', key: 'C' },
  { id: 'earn', label: 'Earnings calendar', key: 'E' },
  { id: 'news', label: 'News', key: 'N' },
  { id: 'alerts', label: 'Price alerts', key: 'A' },
];

interface Item { kind: string; title: string; sub: string; hint: string; run: () => void }

interface Props {
  open: boolean;
  onClose: () => void;
  symbols: Inst[];
  onSymbol: (id: string) => void;
  onPanel: (p: PanelId) => void;
  onRange: (r: RangeId) => void;
}

export default function Palette({ open, onClose, symbols, onSymbol, onPanel, onRange }: Props) {
  const [q, setQ] = useState('');
  const [idx, setIdx] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (open) { setQ(''); setIdx(0); setTimeout(() => inputRef.current?.focus(), 0); }
  }, [open]);

  const items: Item[] = useMemo(() => {
    const s = q.trim().toLowerCase();
    const syms = symbols
      .filter((x) => !s || x.id.toLowerCase().includes(s) || x.name.toLowerCase().includes(s) || x.y.toLowerCase().includes(s))
      .slice(0, s ? 8 : 5)
      .map((x): Item => ({ kind: 'Symbol', title: `${x.id} — ${x.name}`, sub: `${x.y} · ${x.kind}`, hint: '', run: () => onSymbol(x.id) }));
    const cmds: Item[] = [
      ...PANELS.map((p): Item => ({ kind: 'Panel', title: `Open ${p.label.toLowerCase()}`, sub: '', hint: p.key, run: () => onPanel(p.id) })),
      ...RANGES.map((r, i): Item => ({ kind: 'Range', title: `Chart range ${r.id}`, sub: r.name, hint: String(i + 1), run: () => onRange(r.id) })),
    ].filter((c) => !s || c.title.toLowerCase().includes(s) || c.sub.toLowerCase().includes(s));
    return syms.concat(s ? cmds : cmds.slice(0, 4));
  }, [q, symbols, onSymbol, onPanel, onRange]);

  if (!open) return null;
  const cur = Math.min(idx, Math.max(0, items.length - 1));
  const run = (it: Item) => { it.run(); onClose(); };

  const onKey = (e: React.KeyboardEvent) => {
    if (e.key === 'ArrowDown') { e.preventDefault(); setIdx(Math.min(items.length - 1, cur + 1)); }
    else if (e.key === 'ArrowUp') { e.preventDefault(); setIdx(Math.max(0, cur - 1)); }
    else if (e.key === 'Enter') { e.preventDefault(); if (items[cur]) run(items[cur]); }
    else if (e.key === 'Escape') { e.preventDefault(); e.stopPropagation(); onClose(); }
  };

  return (
    <div style={{ position: 'fixed', inset: 0, zIndex: 60, display: 'flex', justifyContent: 'center', alignItems: 'flex-start', padding: '12vh 16px 0' }}>
      <button onClick={onClose} aria-label="Close search" tabIndex={-1} style={{ position: 'absolute', inset: 0, border: 'none', padding: 0, background: 'rgba(0,0,0,.55)', cursor: 'pointer' }} />
      <div role="dialog" aria-modal="true" aria-label="Search and commands" style={{ position: 'relative', width: '100%', maxWidth: 560, background: 'var(--raised)', border: '1px solid var(--line3)', borderRadius: 12, boxShadow: '0 24px 64px rgba(0,0,0,.6)', overflow: 'hidden' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '0 16px', borderBottom: '1px solid var(--line2)' }}>
          <svg width="18" height="18" viewBox="0 0 16 16" aria-hidden="true" style={{ fill: 'none', stroke: 'var(--soft)', strokeWidth: 1.6, strokeLinecap: 'round', flexShrink: 0 }}><circle cx="7" cy="7" r="5" /><path d="M14 14l-3.4-3.4" /></svg>
          <input ref={inputRef} value={q} onChange={(e) => { setQ(e.target.value); setIdx(0); }} onKeyDown={onKey} role="combobox" aria-expanded="true" aria-controls="mi-pal-list" aria-activedescendant={items.length ? `mi-pal-${cur}` : undefined}
            aria-label="Search symbols or commands" placeholder="Symbol, or a command like “calendar”" style={{ flexGrow: 1, height: 52, background: 'none', border: 'none', color: 'var(--fg)', fontSize: 16 }} />
          <kbd className="num" style={{ fontSize: 12, color: 'var(--soft)', border: '1px solid var(--line4)', borderRadius: 4, padding: '1px 6px' }}>Esc</kbd>
        </div>
        <ul id="mi-pal-list" role="listbox" aria-label="Results" style={{ listStyle: 'none', margin: 0, padding: 6, maxHeight: '50vh', overflowY: 'auto' }}>
          {items.map((it, j) => (
            <li key={j} id={`mi-pal-${j}`} role="option" aria-selected={j === cur} onClick={() => run(it)} onMouseEnter={() => setIdx(j)}
              style={{ display: 'flex', alignItems: 'center', gap: 12, minHeight: 44, padding: '0 12px', borderRadius: 8, background: j === cur ? '#2a2f36' : 'transparent', cursor: 'pointer' }}>
              <span style={{ fontSize: 11, color: 'var(--muted)', width: 64, flexShrink: 0 }}>{it.kind}</span>
              <span style={{ flexGrow: 1, minWidth: 0, display: 'flex', flexDirection: 'column' }}>
                <span style={{ fontSize: 14 }}>{it.title}</span>
                <span style={{ fontSize: 12, color: 'var(--muted)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{it.sub}</span>
              </span>
              <span className="num" style={{ fontSize: 12, color: 'var(--muted)' }}>{it.hint}</span>
            </li>
          ))}
          {items.length === 0 && <li style={{ padding: '16px 12px', color: 'var(--soft)', fontSize: 13 }}>Nothing matches “{q}”.</li>}
        </ul>
      </div>
    </div>
  );
}
