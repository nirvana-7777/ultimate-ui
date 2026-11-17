import { useCallback, useState } from 'react';
import type { EPGService } from '@/services/epgService';
import type { Channel, Program } from '@/lib/types';
import type { PlayerState } from '@/components/epg/FloatingPlayer';
import { useToast } from '@/lib/toast';
import { describeCatchupError } from '@/lib/catchup';

/** Play / catchup / download actions plus the floating player state. */
export function usePlayback(service: EPGService) {
  const { showToast } = useToast();
  const [player, setPlayer] = useState<PlayerState | null>(null);

  const closePlayer = useCallback(() => setPlayer(null), []);

  /** DRM config of the channel's stream (null = unencrypted). A broken header is toasted, never silent. */
  const loadDrm = useCallback(
    async (channel: Channel) => {
      try {
        return { drm: await service.getDrmInfo(channel), ok: true };
      } catch (e) {
        showToast((e as Error).message, 'error');
        return { drm: null, ok: false };
      }
    },
    [service, showToast]
  );

  const playChannel = useCallback(
    async (channel: Channel) => {
      const { url, error } = await service.resolveLiveStreamUrl(channel);
      if (!url) {
        showToast(service.describeLiveError(error), 'warning');
        return;
      }
      const { drm, ok } = await loadDrm(channel);
      if (!ok) return;
      setPlayer({ url, title: channel.display_name, subtitle: 'Live Stream', drm });
    },
    [service, showToast, loadDrm]
  );

  const playProgram = useCallback(
    async (channel: Channel, program: Program) => {
      // Live programs play the channel's live stream; the manifest is preferred
      // over any static URL because it points at the native (MPD) stream.
      let url: string | null | undefined = program.is_live
        ? null
        : program.stream_url || program.stream;
      let error: string | undefined;
      if (!url) ({ url, error } = await service.resolveLiveStreamUrl(channel));
      if (!url) {
        showToast(service.describeLiveError(error), 'warning');
        return;
      }
      const { drm, ok } = await loadDrm(channel);
      if (!ok) return;
      setPlayer({ url, title: program.title, subtitle: program.subtitle, drm });
    },
    [service, showToast, loadDrm]
  );

  const playCatchup = useCallback(
    async (channel: Channel, program: Program) => {
      const url = await service.buildCatchupStreamUrl(channel, program);
      if (!url) {
        showToast('Catchup für diese Sendung nicht mehr verfügbar', 'warning');
        return;
      }

      // HEAD pre-flight: no body download, backend still validates.
      const controller = new AbortController();
      let timedOut = false;
      const timer = setTimeout(() => {
        timedOut = true;
        controller.abort();
      }, 8000);

      try {
        const resp = await fetch(url, {
          method: 'HEAD',
          credentials: 'omit',
          signal: controller.signal,
        });
        if (!resp.ok) {
          let errText = '';
          try {
            errText = String((await resp.json())?.error || '');
          } catch {}
          showToast(describeCatchupError(errText), 'warning');
          return;
        }
        const { drm, ok } = await loadDrm(channel);
        if (!ok) return;
        setPlayer({
          url,
          title: program.title,
          subtitle: `Catchup · ${program.start_time_local}`,
          drm,
        });
      } catch {
        showToast(
          timedOut ? 'Catchup-Anfrage hat zu lange gedauert' : 'Catchup-Verbindung fehlgeschlagen',
          'error'
        );
      } finally {
        clearTimeout(timer);
      }
    },
    [service, showToast, loadDrm]
  );

  const download = useCallback(
    async (channel: Channel, program: Program) => {
      const start = new Date(program.start_time);
      const end = new Date(program.end_time);
      const filename = `${channel.display_name}_${program.title}`.replace(
        /[^A-Za-z0-9._-]+/g,
        '_'
      );
      const params = new URLSearchParams({
        provider: channel.provider || '',
        channel: String(channel.id),
        start: String(Math.floor(start.getTime() / 1000)),
        end: String(Math.floor(end.getTime() / 1000)),
        filename,
      });
      const dlUrl = `/api/proxy/catchup/download?${params}`;
      try {
        const head = await fetch(dlUrl, { method: 'HEAD' });
        if (!head.ok) {
          showToast(
            head.status === 503
              ? 'Download für diesen Kanal nicht verfügbar'
              : head.status === 400
              ? 'Ungültige Download-Anfrage'
              : 'Download nicht verfügbar',
            'warning'
          );
          return;
        }
        window.location.href = dlUrl;
      } catch {
        showToast('Download-Verbindung fehlgeschlagen', 'error');
      }
    },
    [showToast]
  );

  return { player, closePlayer, playChannel, playProgram, playCatchup, download };
}
