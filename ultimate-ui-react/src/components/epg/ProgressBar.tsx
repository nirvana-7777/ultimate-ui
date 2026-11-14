import { motion } from 'motion/react';
import type { Program } from '@/lib/types';
import { parseProgramTime } from '@/lib/time';
import { useNow } from '@/lib/now';

export function ProgressBar({ program }: { program: Program }) {
  const now = useNow();
  const start = parseProgramTime(program.start_time);
  const end = parseProgramTime(program.end_time);
  if (!start || !end) return null;

  const total = end.getTime() - start.getTime();
  const elapsed = now.getTime() - start.getTime();
  const pct = Math.max(0, Math.min(100, (elapsed / total) * 100));
  const remaining = end.getTime() - now.getTime();
  const remainingText = (() => {
    if (remaining <= 0) return 'Beendet';
    const h = Math.floor(remaining / 3600000);
    const m = Math.floor((remaining % 3600000) / 60000);
    return h > 0 ? `noch ${h}h ${m} min` : `noch ${m} min`;
  })();

  return (
    <div className="event-progress">
      <div className="progress-bar">
        <motion.div
          className={`progress-fill ${program.is_live ? 'live' : ''}`}
          initial={false}
          animate={{ width: `${pct}%` }}
          transition={{ duration: 1, ease: 'linear' }}
        />
      </div>
      <div className="time-remaining-left">{remainingText}</div>
    </div>
  );
}
