import type { Inst } from './types';

// Default 15 symbols (ARCHITECTURE §2). Prices are never stored here — only metadata.
export const BASE: Inst[] = [
  { id: 'SPX', y: '^GSPC', short: 'S&P 500', name: 'S&P 500', kind: 'US index', group: 'Equities', dp: 2, unit: '', sess: 'us', driver: 'Fed speakers, CPI' },
  { id: 'NDX', y: '^IXIC', short: 'Nasdaq', name: 'NASDAQ Composite', kind: 'US index', group: 'Equities', dp: 2, unit: '', sess: 'us', driver: 'Mega-cap earnings, 10Y' },
  { id: 'DJI', y: '^DJI', short: 'Dow', name: 'Dow Jones Industrial Average', kind: 'US index', group: 'Equities', dp: 2, unit: '', sess: 'us', driver: 'Industrials, USD' },
  { id: 'RUT', y: '^RUT', short: 'Russell', name: 'Russell 2000', kind: 'US index', group: 'Equities', dp: 2, unit: '', sess: 'us', driver: 'Rates, credit spreads' },
  { id: 'VIX', y: '^VIX', short: 'VIX', name: 'CBOE Volatility Index', kind: 'Volatility', group: 'Equities', dp: 2, unit: '', sess: 'us', driver: 'Event risk, S&P drawdowns' },
  { id: 'US10Y', y: '^TNX', short: 'US 10Y', name: 'US 10-Year Treasury Yield', kind: 'Yield', group: 'Rates', dp: 3, unit: '%', sess: 'us', driver: 'Fed speakers, inflation data' },
  { id: 'US05Y', y: '^FVX', short: 'US 5Y', name: 'US 5-Year Treasury Yield', kind: 'Yield', group: 'Rates', dp: 3, unit: '%', sess: 'us', driver: 'Fed path pricing' },
  { id: 'US13W', y: '^IRX', short: 'US 13W', name: 'US 13-Week T-Bill Yield', kind: 'Yield', group: 'Rates', dp: 3, unit: '%', sess: 'us', driver: 'Policy rate' },
  { id: 'DXY', y: 'DX-Y.NYB', short: 'DXY', name: 'US Dollar Index', kind: 'Currency index', group: 'FX', dp: 3, unit: '', sess: 'fut', delayed: true, driver: 'Rate differentials' },
  { id: 'GOLD', y: 'GC=F', short: 'Gold', name: 'Gold Futures', kind: 'Futures', group: 'Commodities', dp: 2, unit: 'USD', sess: 'fut', delayed: true, driver: 'Real yields, USD' },
  { id: 'SILVER', y: 'SI=F', short: 'Silver', name: 'Silver Futures', kind: 'Futures', group: 'Commodities', dp: 2, unit: 'USD', sess: 'fut', delayed: true, driver: 'Industrial demand' },
  { id: 'WTI', y: 'CL=F', short: 'WTI', name: 'Crude Oil WTI Futures', kind: 'Futures', group: 'Commodities', dp: 2, unit: 'USD', sess: 'fut', delayed: true, driver: 'EIA inventories, OPEC+' },
  { id: 'BRENT', y: 'BZ=F', short: 'Brent', name: 'Brent Crude Oil Futures', kind: 'Futures', group: 'Commodities', dp: 2, unit: 'USD', sess: 'fut', delayed: true, driver: 'Middle East supply' },
  { id: 'BTC', y: 'BTC-USD', short: 'Bitcoin', name: 'Bitcoin', kind: 'Crypto', group: 'Crypto', dp: 2, unit: 'USD', sess: 'crypto', driver: 'Liquidity, ETF flows' },
  { id: 'ETH', y: 'ETH-USD', short: 'Ether', name: 'Ethereum', kind: 'Crypto', group: 'Crypto', dp: 2, unit: 'USD', sess: 'crypto', driver: 'BTC beta, staking flows' },
];

export const TAPE = ['SPX', 'NDX', 'US10Y', 'DXY', 'GOLD', 'WTI', 'BTC', 'VIX'];

// 11 SPDR sector ETFs, proxies for the GICS sectors (ARCHITECTURE §2).
export const SECTOR_DEF: [string, string, string][] = [
  ['XLK', 'Technology', 'Tech'],
  ['XLC', 'Communication Services', 'Comms'],
  ['XLY', 'Consumer Discretionary', 'Discretionary'],
  ['XLP', 'Consumer Staples', 'Staples'],
  ['XLE', 'Energy', 'Energy'],
  ['XLF', 'Financials', 'Financials'],
  ['XLV', 'Health Care', 'Health'],
  ['XLI', 'Industrials', 'Industrials'],
  ['XLB', 'Materials', 'Materials'],
  ['XLRE', 'Real Estate', 'Real estate'],
  ['XLU', 'Utilities', 'Utilities'],
];

// Helper instruments: sector ETFs + the three ETFs behind "Market internals".
export const HELPERS: Inst[] = [
  ...SECTOR_DEF.map(([id, name, short]): Inst => ({
    id, y: id, short: id, name: `${name} Select Sector SPDR`, sector: name, sectorShort: short,
    exch: 'NYSE Arca', kind: 'Sector ETF', group: 'Sector ETFs', dp: 2, unit: 'USD', sess: 'us', driver: `${name} earnings, rates`,
  })),
  { id: 'SPY', y: 'SPY', short: 'SPY', name: 'SPDR S&P 500 ETF', exch: 'NYSE Arca', kind: 'ETF', group: 'ETFs', dp: 2, unit: 'USD', sess: 'us', driver: 'Index flows' },
  { id: 'RSP', y: 'RSP', short: 'RSP', name: 'Invesco S&P 500 Equal Weight ETF', exch: 'NYSE Arca', kind: 'ETF', group: 'ETFs', dp: 2, unit: 'USD', sess: 'us', driver: 'Index flows' },
  { id: 'IWM', y: 'IWM', short: 'IWM', name: 'iShares Russell 2000 ETF', exch: 'NYSE Arca', kind: 'ETF', group: 'ETFs', dp: 2, unit: 'USD', sess: 'us', driver: 'Index flows' },
];

export const GROUPS = ['Equities', 'Rates', 'FX', 'Commodities', 'Crypto', 'Stocks', 'Sector ETFs', 'ETFs'];
export const US_INDEX = ['SPX', 'NDX', 'DJI', 'RUT'];

// Which sector ETF a well-known US stock belongs to (highlighted in the sector chart).
export const STOCK_SECTOR: Record<string, string> = {
  AAPL: 'XLK', MSFT: 'XLK', NVDA: 'XLK', AVGO: 'XLK', ORCL: 'XLK', AMD: 'XLK', CRM: 'XLK', ADBE: 'XLK', QCOM: 'XLK', INTC: 'XLK', CSCO: 'XLK', IBM: 'XLK', MU: 'XLK',
  GOOGL: 'XLC', GOOG: 'XLC', META: 'XLC', NFLX: 'XLC', DIS: 'XLC', T: 'XLC', VZ: 'XLC',
  AMZN: 'XLY', TSLA: 'XLY', HD: 'XLY', MCD: 'XLY', NKE: 'XLY', SBUX: 'XLY', LOW: 'XLY',
  WMT: 'XLP', COST: 'XLP', PG: 'XLP', KO: 'XLP', PEP: 'XLP', PM: 'XLP',
  XOM: 'XLE', CVX: 'XLE', COP: 'XLE',
  JPM: 'XLF', BAC: 'XLF', WFC: 'XLF', GS: 'XLF', MS: 'XLF', V: 'XLF', MA: 'XLF', BRK_B: 'XLF', 'BRK-B': 'XLF',
  UNH: 'XLV', JNJ: 'XLV', LLY: 'XLV', PFE: 'XLV', MRK: 'XLV', ABBV: 'XLV',
  CAT: 'XLI', BA: 'XLI', GE: 'XLI', UPS: 'XLI', HON: 'XLI',
  LIN: 'XLB', NEM: 'XLB', FCX: 'XLB',
  PLD: 'XLRE', AMT: 'XLRE',
  NEE: 'XLU', DUK: 'XLU', SO: 'XLU',
};

export const ALL_STATIC: Inst[] = [...BASE, ...HELPERS];

export function findInst(id: string): Inst | undefined {
  return ALL_STATIC.find((x) => x.id === id);
}

/** Symbols fetched on every quote poll: the 15 defaults + 14 helper ETFs = 29 (ARCHITECTURE §2). */
export const CORE_SYMBOLS = ALL_STATIC.map((x) => x.id);

/** Map an internal id (or a raw Yahoo symbol) to a Yahoo symbol. */
export function toYahoo(id: string): string {
  return findInst(id)?.y ?? id;
}
