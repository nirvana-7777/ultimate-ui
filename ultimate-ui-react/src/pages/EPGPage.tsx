import { useCallback, useEffect, useMemo, useState } from 'react';
import { EPGService } from '@/services/epgService';
import { useProviders } from '@/hooks/useProviders';
import { useProviderChannels } from '@/hooks/useProviderChannels';
import { useEpgSelection } from '@/hooks/useEpgSelection';
import { usePlayback } from '@/hooks/usePlayback';
import { ProviderColumn } from '@/components/epg/ProviderColumn';
import { ChannelColumn } from '@/components/epg/ChannelColumn';
import { TimelineColumn } from '@/components/epg/TimelineColumn';
import { FloatingPlayer } from '@/components/epg/FloatingPlayer';
import { getConfig } from '@/lib/api';
import { useLifecycleLog } from '@/lib/liveDebug';
import { localDateKey } from '@/lib/time';
import type { Channel } from '@/lib/types';

/**
 * EPG browser: Provider → Channels → Programme.
 * Selection is kept in the URL; on narrow screens the three columns turn into
 * a drill-down (one column at a time, `data-stage` drives the CSS).
 */
export function EPGPage() {
  useLifecycleLog('EPGPage');
  const cfg = getConfig();
  const service = useMemo(
    () =>
      new EPGService({
        timezone: cfg.ui.timezone,
        catchupMaxHours: cfg.catchup.max_hours,
        // Live playback falls back to the backend URL when no separate public
        // URL is set (catchup replay still requires public_url, see below).
        ultimateBackendPublicUrl: cfg.ultimate_backend.public_url || cfg.ultimate_backend.url,
      }),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    []
  );
  const publicUrlConfigured = !!cfg.ultimate_backend.public_url;

  const { provider, channel: channelParam, selectProvider, selectChannel } = useEpgSelection();
  const providers = useProviders(service);
  const channels = useProviderChannels(service, provider);
  const playback = usePlayback(service);

  const [anchor, setAnchor] = useState(() => new Date());
  const [refreshNonce, setRefreshNonce] = useState(0);

  const channel = useMemo(
    () => channels.channels.find((c) => String(c.id) === channelParam) ?? null,
    [channels.channels, channelParam]
  );
  const providerLabel = useMemo(
    () => providers.providers.find((p) => p.key === provider)?.label ?? provider,
    [providers.providers, provider]
  );

  // Header "refresh" button.
  useEffect(() => {
    const handler = () => {
      service.cache.clearVolatile();
      providers.reload();
      channels.reload();
      setRefreshNonce((n) => n + 1);
    };
    window.addEventListener('ultimate:refresh', handler);
    return () => window.removeEventListener('ultimate:refresh', handler);
  }, [service, providers.reload, channels.reload]);

  const handleSelectProvider = useCallback(
    (key: string) => {
      if (key !== provider) selectProvider(key);
    },
    [provider, selectProvider]
  );

  const handleSelectChannel = useCallback(
    (c: Channel) => {
      setAnchor(new Date());
      selectChannel(String(c.id));
    },
    [selectChannel]
  );

  const stage = channel ? 'timeline' : provider ? 'channels' : 'providers';

  return (
    <div className="epg-browser" data-stage={stage}>
      <ProviderColumn
        providers={providers.providers}
        loading={providers.loading}
        selected={provider}
        onSelect={handleSelectProvider}
      />
      <ChannelColumn
        key={provider ?? 'none'}
        service={service}
        providerLabel={providerLabel}
        channels={channels.channels}
        loading={channels.loading}
        error={channels.error}
        selectedId={channelParam}
        onSelect={handleSelectChannel}
        onPlayLive={playback.playChannel}
        onRetry={channels.reload}
        onBack={() => selectProvider(null)}
      />
      <TimelineColumn
        key={`${provider}|${channel?.id ?? 'none'}|${localDateKey(anchor)}|${refreshNonce}`}
        service={service}
        channel={channel}
        anchor={anchor}
        timezone={cfg.ui.timezone}
        publicUrlConfigured={publicUrlConfigured}
        onJump={setAnchor}
        onBack={() => selectChannel(null)}
        onPlay={playback.playProgram}
        onCatchup={playback.playCatchup}
        onDownload={playback.download}
      />
      <FloatingPlayer state={playback.player} onClose={playback.closePlayer} />
    </div>
  );
}
