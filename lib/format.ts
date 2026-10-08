export const UP = '#3fcf8e';
export const DOWN = '#f2606b';
export const FLAT = '#b9bfc7';
export const AMBER = '#e3a33b';

export function fmt(v: number, dp: number): string {
  return v.toLocaleString('en-US', { minimumFractionDigits: dp, maximumFractionDigits: dp });
}
export function signed(v: number, dp: number): string {
  if (Math.abs(v) < Math.pow(10, -dp) / 2) return fmt(0, dp);
  return (v > 0 ? '+' : '−') + fmt(Math.abs(v), dp);
}
export function pctStr(p: number): string {
  if (Math.abs(p) < 0.005) return '0.00%';
  return (p > 0 ? '+' : '−') + Math.abs(p).toFixed(2) + '%';
}
export function colorOf(v: number): string {
  return v > 1e-9 ? UP : v < -1e-9 ? DOWN : FLAT;
}
export function ago(ms: number): string {
  const s = Math.max(0, Math.round(ms / 1000));
  if (s < 5) return 'just now';
  if (s < 60) return s + 's ago';
  const m = Math.floor(s / 60);
  if (m < 60) return m + 'm ago';
  const h = Math.floor(m / 60);
  if (h < 48) return h + 'h ago';
  return Math.floor(h / 24) + 'd ago';
}
export function hhmm(m: number): string {
  return String(Math.floor(m / 60) % 24).padStart(2, '0') + ':' + String(m % 60).padStart(2, '0');
}
export function inMin(d: number): string {
  if (d < 60) return 'in ' + d + 'm';
  return 'in ' + Math.floor(d / 60) + 'h ' + String(d % 60).padStart(2, '0') + 'm';
}
