import { useCallback, useEffect } from 'react';
import { useSearchParams } from 'react-router-dom';

const STORAGE_KEY = 'ultimate-ui:epg-selection';

interface Selection {
  provider: string | null;
  channel: string | null;
}

function readStored(): Selection {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw) {
      const v = JSON.parse(raw);
      return { provider: v.provider ?? null, channel: v.channel ?? null };
    }
  } catch {}
  return { provider: null, channel: null };
}

/**
 * Provider/channel selection lives in the URL (?provider=…&channel=…) so it is
 * linkable and survives reloads; the last selection is remembered in
 * localStorage for a bare /.
 */
export function useEpgSelection() {
  const [params, setParams] = useSearchParams();
  const urlProvider = params.get('provider');
  const urlChannel = params.get('channel');

  useEffect(() => {
    if (urlProvider || urlChannel) return;
    const stored = readStored();
    if (!stored.provider) return;
    const next = new URLSearchParams();
    next.set('provider', stored.provider);
    if (stored.channel) next.set('channel', stored.channel);
    setParams(next, { replace: true });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    if (!urlProvider) return;
    try {
      localStorage.setItem(
        STORAGE_KEY,
        JSON.stringify({ provider: urlProvider, channel: urlChannel })
      );
    } catch {}
  }, [urlProvider, urlChannel]);

  const selectProvider = useCallback(
    (provider: string | null) => {
      const next = new URLSearchParams();
      if (provider) next.set('provider', provider);
      setParams(next, { replace: true });
    },
    [setParams]
  );

  const selectChannel = useCallback(
    (channel: string | null) => {
      const next = new URLSearchParams(params);
      if (channel) next.set('channel', channel);
      else next.delete('channel');
      setParams(next, { replace: true });
    },
    [params, setParams]
  );

  return {
    provider: urlProvider,
    channel: urlChannel,
    selectProvider,
    selectChannel,
  };
}
