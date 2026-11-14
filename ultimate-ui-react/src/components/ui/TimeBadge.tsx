import type { Program } from '@/lib/types';

export function TimeBadge({ badge }: { badge: Program['time_badge'] }) {
  if (!badge) return null;
  return <span className={badge.class}>{badge.text}</span>;
}

export function FskBadge({ rating }: { rating?: string }) {
  if (!rating) return null;
  const m = rating.match(/(\d+)/);
  if (!m) return <span className="program-rating">{rating}</span>;
  const age = parseInt(m[1], 10);
  let cls = 'fsk-0';
  if (age >= 18) cls = 'fsk-18';
  else if (age >= 16) cls = 'fsk-16';
  else if (age >= 12) cls = 'fsk-12';
  else if (age >= 6) cls = 'fsk-6';
  return <span className={`fsk-badge ${cls}`}>FSK {age}</span>;
}
