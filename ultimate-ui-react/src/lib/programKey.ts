import type { Program } from './types';
import { parseProgramTime } from './time';

export function programKey(channelId: string | number, program: Program): string {
  if (!program) return String(channelId);
  if (program.id !== undefined && program.id !== null) return String(program.id);
  if ((program as any).program_id !== undefined && (program as any).program_id !== null) {
    return String((program as any).program_id);
  }
  const t = parseProgramTime(program.start_time);
  return `${channelId}_${t ? t.getTime() : String(program.start_time)}`;
}
