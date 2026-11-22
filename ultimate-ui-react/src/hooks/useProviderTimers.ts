import { useCallback, useEffect, useState } from 'react';
import { cloudRecordings } from '@/services/recordingsService';
import type { TimerItem } from '@/lib/recordings';

/**
 * Active timers of one provider, so the EPG can tell which programmes already
 * have a timer. Failures (provider without recording support) just mean "no timers".
 */
export function useProviderTimers(provider: string | null) {
  const [timers, setTimers] = useState<TimerItem[]>([]);
  const [nonce, setNonce] = useState(0);

  useEffect(() => {
    setTimers([]);
    if (!provider) return;
    const c = new AbortController();
    cloudRecordings
      .timers(provider, false, { signal: c.signal })
      .then((t) => {
        if (!c.signal.aborted) setTimers(t);
      })
      .catch(() => {});
    return () => c.abort();
  }, [provider, nonce]);

  return { timers, reload: useCallback(() => setNonce((n) => n + 1), []) };
}
