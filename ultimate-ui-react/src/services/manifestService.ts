import { getConfig } from '@/lib/api';
import { DRM_HEADER, parseDrmHeader, type DrmInfo } from '@/lib/drm';

/** Backend routes that serve /manifest (and /manifest/original) per item kind. */
export type ManifestKind = 'channels' | 'events' | 'vod' | 'recordings';

const seg = encodeURIComponent;

export function backendBase(): string {
  const cfg = getConfig().ultimate_backend;
  return (cfg.public_url || cfg.url || '').replace(/\/+$/, '');
}

export function manifestEndpoint(base: string, kind: ManifestKind, provider: string, id: string | number): string {
  return `${base}/api/providers/${seg(provider)}/${kind}/${seg(String(id))}/manifest`;
}

function streamOf(manifest: any): string | null {
  return manifest?.manifest_url || manifest?.ts_stream_url || null;
}

function absolute(url: string, base: string): string {
  try {
    return new URL(url, `${base}/`).toString();
  } catch {
    return url;
  }
}

/**
 * Unproxied stream URL of an encrypted item: the same manifest route plus
 * "/original". Never throws; null means "not available" and the caller keeps
 * the proxied URL from the first call.
 */
export async function fetchOriginalStreamUrl(endpoint: string, base: string): Promise<string | null> {
  try {
    const resp = await fetch(`${endpoint}/original`, { credentials: 'omit' });
    if (!resp.ok) {
      console.warn(`[drm] ${endpoint}/original: HTTP ${resp.status}`);
      return null;
    }
    const url = streamOf(await resp.json());
    return url ? absolute(url, base) : null;
  } catch (e) {
    console.warn(`[drm] ${endpoint}/original failed`, e);
    return null;
  }
}

export interface ResolvedManifest {
  /** What the player should load (original URL for DRM streams when available). */
  url: string | null;
  /** License info from the first call; null = unencrypted. */
  drm: DrmInfo | null;
  /** True when the DRM stream had to fall back to the proxied URL. */
  originalMissing: boolean;
}

/**
 * Two-step manifest lookup used for every kind:
 *   1. GET .../manifest           -> stream URL + X-Kodi-Drm-Configs header
 *   2. header present (DRM)       -> GET .../manifest/original for the unproxied URL
 * Shaka gets the original URL together with the license info of step 1.
 * Throws German messages for the first call only.
 */
export async function resolveManifest(
  kind: ManifestKind,
  provider: string,
  id: string | number
): Promise<ResolvedManifest> {
  const base = backendBase();
  if (!base) {
    throw new Error('Kein Stream: Backend-URL fehlt (ULTIMATE_BACKEND_URL bzw. ULTIMATE_BACKEND_PUBLIC_URL)');
  }
  const endpoint = manifestEndpoint(base, kind, provider, id);
  let resp: Response;
  try {
    resp = await fetch(endpoint, { credentials: 'omit' });
  } catch {
    throw new Error(`Backend ${base} aus dem Browser nicht erreichbar (Erreichbarkeit/CORS prüfen)`);
  }
  if (!resp.ok) throw new Error(`Backend hat die Stream-Anfrage abgelehnt (HTTP ${resp.status})`);
  const manifest = await resp.json();
  const drm = parseDrmHeader(resp.headers.get(DRM_HEADER));
  let url = streamOf(manifest);
  let originalMissing = false;
  if (drm) {
    const original = await fetchOriginalStreamUrl(endpoint, base);
    if (original) url = original;
    else originalMissing = true;
  }
  return { url, drm, originalMissing };
}
