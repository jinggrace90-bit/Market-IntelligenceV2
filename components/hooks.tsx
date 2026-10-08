'use client';
import { useEffect, useState } from 'react';
import { ago } from '@/lib/format';

export function useNow(ms: number): number {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), ms);
    return () => clearInterval(t);
  }, [ms]);
  return now;
}

/** "42s ago" that keeps itself fresh without re-rendering the whole dashboard. */
export function Ago({ ts }: { ts: number | string | null }) {
  const now = useNow(1000);
  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);
  if (ts == null || !mounted) return <>—</>;
  const t = typeof ts === 'number' ? ts : Date.parse(ts);
  return <>{ago(now - t)}</>;
}
