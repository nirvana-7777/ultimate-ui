/**
 * Two-bucket cache (mirroring the original epg_core.js):
 *  - `past` — immutable, survives auto-refresh (past programs never change)
 *  - `volatile` — cleared on refresh (today + future)
 *
 * Plus `pastProgramsByDay` — a durable per-day store keyed by
 * `<channelId>|<YYYY-MM-DD>` (LOCAL date). Searched first by getProgram()
 * so catchup clicks survive auto-refresh.
 */
import type { Program } from '@/lib/types';
import { localDateKey, parseProgramTime } from '@/lib/time';

export class ProgramCache {
  private past = new Map<string, Program[]>();
  private volatile = new Map<string, Program[]>();
  private byDay = new Map<string, Program[]>();
  private manifests = new Map<string, any>();

  programsKey(channelId: string | number, start: Date, end: Date, provider?: string | null): string {
    return `programs|${provider || ''}|${channelId}|${start.toISOString()}|${end.toISOString()}`;
  }

  getPrograms(
    channelId: string | number,
    start: Date,
    end: Date,
    provider?: string | null
  ): Program[] | undefined {
    const key = this.programsKey(channelId, start, end, provider);
    const isPast = end.getTime() <= Date.now();
    return (isPast ? this.past : this.volatile).get(key);
  }

  setPrograms(
    channelId: string | number,
    start: Date,
    end: Date,
    provider: string | null | undefined,
    programs: Program[]
  ): void {
    const key = this.programsKey(channelId, start, end, provider);
    const isPast = end.getTime() <= Date.now();
    (isPast ? this.past : this.volatile).set(key, programs);
  }

  getDailyPrograms(channelId: string | number, date: Date): Program[] | undefined {
    return this.byDay.get(`${channelId}|${localDateKey(date)}`);
  }

  setDailyPrograms(channelId: string | number, date: Date, programs: Program[]): void {
    this.byDay.set(`${channelId}|${localDateKey(date)}`, programs);
  }

  /** Search pastProgramsByDay first, then volatile daily cache. */
  findProgram(channelId: string | number, programKeyStr: string, keyFn: (p: Program) => string): Program | null {
    const prefix = `${channelId}|`;
    for (const [k, programs] of this.byDay) {
      if (!k.startsWith(prefix)) continue;
      const found = programs.find((p) => keyFn(p) === programKeyStr);
      if (found) return found;
    }
    for (const programs of this.volatile.values()) {
      const found = programs.find((p) => keyFn(p) === programKeyStr);
      if (found) return found;
    }
    return null;
  }

  getManifest(provider: string, channelId: string | number): any | undefined {
    return this.manifests.get(`${provider}|${channelId}`);
  }

  setManifest(provider: string, channelId: string | number, manifest: any): void {
    this.manifests.set(`${provider}|${channelId}`, manifest);
  }

  clearVolatile(): void {
    this.volatile.clear();
  }

  clear(): void {
    this.past.clear();
    this.volatile.clear();
    this.byDay.clear();
    this.manifests.clear();
  }
}
