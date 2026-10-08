import { AMBER, UP } from './format';
import type { Inst, Quote } from './types';
import type { SearchHit } from './sources/yahoo-types';

export interface MarketStatus { label: string; color: string; open: boolean }

const CLOSED = '#8b929c';

/** Market label from Yahoo's own marketState (handles holidays, unlike a clock guess). */
export function marketStatus(inst: Inst, q?: Quote): MarketStatus {
  if (inst.sess === 'crypto') return { label: 'Trading 24/7', color: UP, open: true };
  const st = q?.marketState ?? null;
  const name = inst.sess === 'hk' ? 'HK' : 'US';
  if (st === 'REGULAR') return inst.sess === 'fut' ? { label: 'Futures trading', color: UP, open: true } : { label: `${name} market open`, color: UP, open: true };
  if (inst.sess === 'fut') return { label: 'Futures closed', color: CLOSED, open: false };
  if (st === 'PRE') return { label: 'Pre-market', color: AMBER, open: false };
  if (st === 'POST') return { label: 'After hours', color: AMBER, open: false };
  return { label: `${name} market closed`, color: CLOSED, open: false };
}

/** Turn a Yahoo search hit into an instrument we can chart. */
export function instFromHit(h: SearchHit): Inst {
  const isHK = h.symbol.endsWith('.HK') || h.symbol === '^HSI';
  const t = h.type;
  const group = t === 'CRYPTOCURRENCY' ? 'Crypto' : t === 'FUTURE' ? 'Commodities' : t === 'CURRENCY' ? 'FX' : t === 'INDEX' ? 'Equities' : t === 'ETF' || t === 'MUTUALFUND' ? 'ETFs' : 'Stocks';
  const kind = t === 'EQUITY' ? 'Stock' : t === 'ETF' ? 'ETF' : t === 'INDEX' ? 'Index' : t === 'CRYPTOCURRENCY' ? 'Crypto' : t === 'FUTURE' ? 'Futures' : t === 'CURRENCY' ? 'Currency' : 'Fund';
  return {
    id: h.symbol, y: h.symbol, short: h.symbol, name: h.name, exch: h.exch, kind, group, dp: 2,
    unit: isHK ? 'HKD' : t === 'EQUITY' || t === 'ETF' || t === 'CRYPTOCURRENCY' || t === 'FUTURE' ? 'USD' : '',
    sess: isHK ? 'hk' : t === 'CRYPTOCURRENCY' ? 'crypto' : t === 'FUTURE' || t === 'CURRENCY' ? 'fut' : 'us',
    driver: 'Earnings, sector and macro news',
  };
}

export function lsGet<T>(key: string, fallback: T): T {
  try {
    const raw = window.localStorage.getItem(key);
    return raw ? (JSON.parse(raw) as T) : fallback;
  } catch {
    return fallback;
  }
}
export function lsSet(key: string, value: unknown) {
  try {
    window.localStorage.setItem(key, JSON.stringify(value));
  } catch {
    /* private mode etc. */
  }
}
