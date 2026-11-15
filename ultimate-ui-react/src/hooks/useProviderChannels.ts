import { useCallback, useEffect, useRef, useState } from 'react';
import type { EPGService } from '@/services/epgService';
import type { Channel } from '@/lib/types';

export function useProviderChannels(service: EPGService, providerKey: string | null) {
  const [channels, setChannels] = useState<Channel[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const reqId = useRef(0);

  const load = useCallback(async () => {
    const id = ++reqId.current;
    if (!providerKey) {
      setChannels([]);
      setError(null);
      setLoading(false);
      return;
    }
    setLoading(true);
    setError(null);
    setChannels([]);
    try {
      const result = await service.loadProviderChannels(providerKey);
      if (id !== reqId.current) return;
      setChannels(result);
    } catch (e) {
      if (id !== reqId.current) return;
      setError(e instanceof Error && e.message ? e.message : 'Kanäle konnten nicht geladen werden.');
    } finally {
      if (id === reqId.current) setLoading(false);
    }
  }, [service, providerKey]);

  useEffect(() => {
    load();
  }, [load]);

  return { channels, loading, error, reload: load };
}
