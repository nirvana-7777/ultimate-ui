import { useMemo } from 'react';
import { useFanOut } from '@/hooks/useRecordings';
import type { RecordingProvider } from '@/services/recordingsService';
import { listEvents } from '@/services/eventsService';
import type { EventItem } from '@/lib/events';

/**
 * Events of one provider, or of all providers when `provider` is null
 * (the backend has one events route per provider, so this fans out).
 * A provider that fails must not break the others - see useFanOut.
 */
export function useEvents(provider: string | null, providers: RecordingProvider[], ready: boolean) {
  const targets = useMemo(
    () => (provider ? [provider] : providers.map((p) => p.key)),
    [provider, providers]
  );
  return useFanOut<EventItem>(ready, targets, (p, signal) => listEvents(p, { signal }), []);
}
