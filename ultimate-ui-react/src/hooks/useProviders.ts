import { useCallback, useEffect, useState } from 'react';
import type { EPGService } from '@/services/epgService';

export interface ProviderItem {
  /** Stable id used in URLs and API calls (provider `name`, falling back to `id`). */
  key: string;
  label: string;
}

export function useProviders(service: EPGService) {
  const [providers, setProviders] = useState<ProviderItem[]>([]);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    setLoading(true);
    const raw = await service.loadProviders();
    setProviders(
      raw
        .map((p: any) => ({
          key: String(p.name ?? p.id ?? ''),
          label: String(p.label || p.name || `Provider ${p.id}`),
        }))
        .filter((p) => p.key)
    );
    setLoading(false);
  }, [service]);

  useEffect(() => {
    load();
  }, [load]);

  return { providers, loading, reload: load };
}
