import { useState } from 'react';

export function ChannelLogo({
  name,
  url,
  size = 36,
}: {
  name: string;
  url?: string;
  size?: number;
}) {
  const [failed, setFailed] = useState(false);
  return (
    <span className="ch-logo" style={{ width: size, height: size }}>
      {url && !failed ? (
        <img src={url} alt="" loading="lazy" onError={() => setFailed(true)} />
      ) : (
        <span className="ch-logo-fallback">{name.substring(0, 2).toUpperCase()}</span>
      )}
    </span>
  );
}
