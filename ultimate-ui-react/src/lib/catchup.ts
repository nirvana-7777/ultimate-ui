import type { Channel, Program } from '@/lib/types';
import { parseProgramTime } from './time';

export function normalizeCatchup(channel: any): { enabled: boolean; hours: number } {
  if (!channel) return { enabled: false, hours: 0 };

  const rawHours =
    channel.catchup_hours ?? channel.catchupHours ??
    channel.CatchupHours ?? channel.catchup_window ??
    channel.CatchupWindow ?? channel.catchupWindow;

  let hours = Number(rawHours);
  if (!isFinite(hours) || hours < 0) hours = 0;

  if (rawHours === undefined || rawHours === null) {
    const rawDays = channel.tv_archive_duration ?? channel.TvArchiveDuration;
    const days = Number(rawDays);
    if (isFinite(days) && days > 0) hours = days * 24;
  }

  const flag = channel.catchup_enabled ?? channel.catchupEnabled
    ?? channel.TvArchive ?? channel.tv_archive;

  let enabled: boolean;
  if (flag === undefined || flag === null) {
    enabled = hours > 0;
  } else {
    const s = String(flag).toLowerCase();
    enabled = !(s === '0' || s === 'false' || s === 'no' || s === 'off');
  }

  return { enabled: enabled && hours > 0, hours };
}

export function isCatchupEligible(
  program: Program,
  channel: Channel,
  now = new Date()
): boolean {
  if (!channel?.catchup?.enabled) return false;
  const start = parseProgramTime(program.start_time);
  const end = parseProgramTime(program.end_time);
  if (!start || !end) return false;
  if (end >= now) return false;
  const ageHours = (now.getTime() - start.getTime()) / 3600000;
  return ageHours <= (channel.catchup.hours || 0);
}

export function catchupWindowAgeHours(
  program: Program,
  now = new Date()
): number | null {
  const start = parseProgramTime(program.start_time);
  if (!start) return null;
  return (now.getTime() - start.getTime()) / 3600000;
}

/**
 * Maps a backend catchup error body to a user-facing toast message.
 * Centralised here so playback paths and future download paths agree.
 */
export function describeCatchupError(errText: string): string {
  if (!errText) return 'Catchup nicht abspielbar';
  if (/outside.*catchup|catchup.*window/i.test(errText))
    return 'Catchup für diese Sendung ist abgelaufen';
  if (/not supported|no catchup/i.test(errText))
    return 'Catchup wird für diesen Kanal nicht unterstützt';
  if (/media proxy|MEDIA_PROXY_URL/i.test(errText))
    return 'Catchup momentan nicht verfügbar (Media-Proxy nicht konfiguriert)';
  return errText;
}
