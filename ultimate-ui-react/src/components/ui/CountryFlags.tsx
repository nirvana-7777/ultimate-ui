import { useState } from 'react';

/** Codes flagcdn.com does not know under the ISO name people tend to write. */
const ALIASES: Record<string, string> = { uk: 'gb' };

function FlagOrCode({ token }: { token: string }) {
  const [failed, setFailed] = useState(false);
  const code = token.toLowerCase();
  const flag = ALIASES[code] ?? code;
  if (failed) return <span>{token.toUpperCase()}</span>;
  return (
    <img
      className="country-flag"
      src={`https://flagcdn.com/16x12/${flag}.png`}
      srcSet={`https://flagcdn.com/32x24/${flag}.png 2x`}
      width={16}
      height={12}
      alt={token.toUpperCase()}
      title={token.toUpperCase()}
      loading="lazy"
      referrerPolicy="no-referrer"
      onError={() => setFailed(true)}
    />
  );
}

/**
 * Country field as flags. The server sends ISO codes, sometimes several
 * ("us, de"). Anything that is not a two-letter code stays plain text.
 */
export function CountryFlags({ value }: { value: string }) {
  const tokens = value
    .split(/[,;/|]+/)
    .map((t) => t.trim())
    .filter(Boolean);
  return (
    <>
      {tokens.map((t, i) =>
        /^[A-Za-z]{2}$/.test(t) ? <FlagOrCode key={`${t}${i}`} token={t} /> : <span key={`${t}${i}`}>{t}</span>
      )}
    </>
  );
}
