import type { VodStatus } from '@/lib/vod';

const fmtDate = (iso?: string) => {
  if (!iso) return null;
  const d = new Date(/[zZ]|[+-]\d\d:?\d\d$/.test(iso) ? iso : iso + 'Z'); // crawler stores UTC
  return isNaN(d.getTime())
    ? iso
    : d.toLocaleString('de-DE', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' });
};

interface Props {
  status: VodStatus | null;
  error: string | null;
  syncing: boolean;
  provider: string | null;
  onSync: () => void;
}

export function VodStatusBar({ status, error, syncing, provider, onSync }: Props) {
  const running = status?.syncInProgress || syncing;
  const prog = status?.syncProgress;
  const current = prog?.current ? String(prog.current) : null;
  const done = Array.isArray(prog?.completed) ? prog!.completed.length : null;
  const total = typeof prog?.total === 'number' ? prog.total : null;

  const parts: string[] = [];
  if (status?.movies !== undefined) parts.push(`${status.movies} Filme`);
  if (status?.shows !== undefined) parts.push(`${status.shows} Serien`);
  const last = fmtDate(status?.lastCrawl);
  if (last) parts.push(`Letzter Crawl ${last}`);

  return (
    <div className="vod-status">
      <span className="vod-status-text" title={error ?? undefined}>
        {error ? (
          <>
            <span className="status-dot offline" aria-hidden="true" /> Crawler nicht erreichbar
          </>
        ) : running ? (
          <>
            <span className="status-dot online pulse" aria-hidden="true" /> Sync läuft
            {current ? `: ${current}` : ''}
            {done !== null && total ? ` (${done}/${total})` : ''}
          </>
        ) : (
          parts.join(' · ')
        )}
      </span>
      <button
        className="btn-date"
        onClick={onSync}
        disabled={!!running || !!error}
        title={provider ? `Nur ${provider} synchronisieren` : 'Alle Provider synchronisieren'}
      >
        ↻ Sync{provider ? ` ${provider}` : ''}
      </button>
    </div>
  );
}
