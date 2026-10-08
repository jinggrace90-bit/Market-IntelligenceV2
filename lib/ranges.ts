export const RANGES = [
  { id: '1D', name: 'Today' },
  { id: '5D', name: '5-day change' },
  { id: '1M', name: '1-month change' },
  { id: '6M', name: '6-month change' },
  { id: 'YTD', name: 'Year-to-date change' },
  { id: '1Y', name: '1-year change' },
  { id: '5Y', name: '5-year change' },
  { id: 'All', name: 'All-time change' },
] as const;

export type RangeId = (typeof RANGES)[number]['id'];

export function isRange(v: string | null): v is RangeId {
  return RANGES.some((r) => r.id === v);
}

/** CDN cache seconds per range (ARCHITECTURE §5). */
export function cacheSeconds(range: RangeId): number {
  if (range === '1D') return 60;
  if (range === '5D' || range === '1M') return 600;
  return 21600;
}

const DAY = 86400000;

/** What to ask Yahoo for each chart range. */
export function chartParams(range: RangeId, now = Date.now()): { period1: Date; interval: '5m' | '15m' | '1h' | '1d' | '1wk' | '1mo' } {
  const year = new Date(now).getUTCFullYear();
  switch (range) {
    case '1D': return { period1: new Date(now - 5 * DAY), interval: '5m' };
    case '5D': return { period1: new Date(now - 9 * DAY), interval: '15m' };
    case '1M': return { period1: new Date(now - 31 * DAY), interval: '1h' };
    case '6M': return { period1: new Date(now - 183 * DAY), interval: '1d' };
    case 'YTD': return { period1: new Date(Date.UTC(year, 0, 1) - 5 * DAY), interval: '1d' };
    case '1Y': return { period1: new Date(now - 366 * DAY), interval: '1d' };
    case '5Y': return { period1: new Date(now - 5 * 366 * DAY), interval: '1wk' };
    case 'All': return { period1: new Date(0), interval: '1mo' };
  }
}
