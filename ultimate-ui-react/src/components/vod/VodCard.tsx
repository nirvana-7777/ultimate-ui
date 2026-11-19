import { memo, useState } from 'react';
import { accessInfo, formatDuration } from '@/lib/vod';
import type { VodItem } from '@/lib/vod';

export const AccessBadge = ({ access, price }: { access?: string; price?: string }) => {
  const info = accessInfo(access);
  if (!info) return null;
  return (
    <span className={`vod-badge vod-badge-${info.tone}`}>
      {info.label}
      {price && info.tone === 'paid' ? ` · ${price}` : ''}
    </span>
  );
};

export const VodCard = memo(function VodCard({
  item,
  onOpen,
}: {
  item: VodItem;
  onOpen: (i: VodItem) => void;
}) {
  const [broken, setBroken] = useState(false);
  const sub = [
    item.year,
    item.kind === 'movie' ? formatDuration(item.durationSeconds) : item.seasons ? `${item.seasons} Staffeln` : 'Serie',
  ]
    .filter(Boolean)
    .join(' · ');

  return (
    <button className="vod-card" onClick={() => onOpen(item)} title={item.title}>
      <span className="vod-poster">
        {item.poster && !broken ? (
          <img
            src={item.poster}
            alt=""
            loading="lazy"
            referrerPolicy="no-referrer"
            onError={() => setBroken(true)}
          />
        ) : (
          <span className="vod-poster-fallback" aria-hidden="true">
            {item.title.substring(0, 2).toUpperCase()}
          </span>
        )}
        <span className="vod-poster-badges">
          <AccessBadge access={item.access} price={item.price} />
        </span>
      </span>
      <span className="vod-card-title">{item.title}</span>
      <span className="vod-card-sub">{sub || '\u00a0'}</span>
    </button>
  );
});
