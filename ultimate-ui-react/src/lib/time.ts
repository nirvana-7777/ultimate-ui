/**
 * Time utilities with the exact defensive parsing behavior from the
 * original epg_core.js — offset-less ISO strings are coerced to UTC.
 */

const ISO_NO_TZ = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}(:\d{2}(\.\d+)?)?$/;

export function parseProgramTime(value: string | Date | null | undefined): Date | null {
  if (!value) return null;
  if (value instanceof Date) return value;
  if (typeof value !== 'string') return new Date(value);
  if (ISO_NO_TZ.test(value)) return new Date(value + 'Z');
  return new Date(value);
}

export function formatDateTime(
  value: string | Date | null | undefined,
  format: 'date' | 'time' | 'short-date' | 'datetime' = 'datetime',
  timezone?: string
): string {
  if (!value) return '';
  const date = typeof value === 'string' ? parseProgramTime(value) : value;
  if (!date || isNaN(date.getTime())) return '';

  const options: Intl.DateTimeFormatOptions = {
    timeZone: timezone || Intl.DateTimeFormat().resolvedOptions().timeZone,
    hour12: false,
  };

  switch (format) {
    case 'date':
      Object.assign(options, {
        weekday: 'long',
        year: 'numeric',
        month: 'long',
        day: 'numeric',
      });
      return date.toLocaleDateString('de-DE', options);
    case 'time':
      Object.assign(options, { hour: '2-digit', minute: '2-digit' });
      return date.toLocaleTimeString('de-DE', options);
    case 'short-date':
      Object.assign(options, { day: '2-digit', month: '2-digit' });
      return date.toLocaleDateString('de-DE', options);
    default:
      Object.assign(options, {
        year: 'numeric',
        month: '2-digit',
        day: '2-digit',
        hour: '2-digit',
        minute: '2-digit',
      });
      return date.toLocaleString('de-DE', options);
  }
}

export function localDateKey(date: Date): string {
  const d = new Date(date);
  const mm = String(d.getMonth() + 1).padStart(2, '0');
  const dd = String(d.getDate()).padStart(2, '0');
  return `${d.getFullYear()}-${mm}-${dd}`;
}

export function isSameDay(a: Date, b: Date): boolean {
  return a.getFullYear() === b.getFullYear() &&
    a.getMonth() === b.getMonth() &&
    a.getDate() === b.getDate();
}

export function calculateDuration(start: string | Date, end: string | Date): number {
  const s = typeof start === 'string' ? parseProgramTime(start) : start;
  const e = typeof end === 'string' ? parseProgramTime(end) : end;
  if (!s || !e) return 0;
  return Math.round((e.getTime() - s.getTime()) / 60000);
}

export function calculateProgress(
  startTime: string | Date,
  endTime: string | Date
): { percentage: number; duration: number; elapsed: number; remaining: number } | null {
  const now = new Date();
  const start = typeof startTime === 'string' ? parseProgramTime(startTime) : startTime;
  const end = typeof endTime === 'string' ? parseProgramTime(endTime) : endTime;
  if (!start || !end || now < start || now > end) return null;
  const total = end.getTime() - start.getTime();
  const elapsed = now.getTime() - start.getTime();
  return {
    percentage: (elapsed / total) * 100,
    duration: Math.round(total / 60000),
    elapsed: Math.round(elapsed / 60000),
    remaining: Math.round((end.getTime() - now.getTime()) / 60000),
  };
}

export function calculateTimeRemaining(endTime: string | Date): string {
  const now = new Date();
  const end = typeof endTime === 'string' ? parseProgramTime(endTime) : endTime;
  if (!end) return '';
  const diff = end.getTime() - now.getTime();
  if (diff <= 0) return 'Beendet';
  const hours = Math.floor(diff / (1000 * 60 * 60));
  const minutes = Math.floor((diff % (1000 * 60 * 60)) / (1000 * 60));
  return hours > 0 ? `noch ${hours}h ${minutes} min` : `noch ${minutes} min`;
}
