/**
 * DRM info the Ultimate Backend piggybacks on the manifest response as
 *   X-Kodi-Drm-Configs: base64(JSON)
 * Shape (one entry per key system, Kodi inputstream.adaptive style):
 *   { "com.widevine.alpha": { "priority": 2,
 *       "license": { "server_url": "...",
 *                    "req_headers": "Key=val&Key2=val2" (urlencoded),
 *                    "req_data": base64("{CHA-RAW}") } } }
 * Unencrypted streams carry no header.
 *
 * NOTE: a cross-origin fetch can only read this header if the backend lists
 * it in Access-Control-Expose-Headers (see CHANGES.md).
 */
export const DRM_HEADER = 'X-Kodi-Drm-Configs';

export interface DrmInfo {
  /** key system -> license server URL */
  servers: Record<string, string>;
  /** key system -> extra license request headers (forbidden ones removed) */
  headers: Record<string, Record<string, string>>;
}

/** Headers a browser refuses to set from script; Shaka cannot send them. */
const FORBIDDEN_HEADERS = new Set(['user-agent', 'host', 'origin', 'referer', 'cookie']);

function decodeB64Utf8(b64: string): string {
  const bin = atob(b64.trim());
  const bytes = Uint8Array.from(bin, (c) => c.charCodeAt(0));
  return new TextDecoder().decode(bytes);
}

/** Returns null for "no DRM"; throws on a header that is present but unusable. */
export function parseDrmHeader(value: string | null | undefined): DrmInfo | null {
  if (!value) return null;
  let cfg: any;
  try {
    cfg = JSON.parse(decodeB64Utf8(value));
  } catch (e) {
    throw new Error(`${DRM_HEADER} ist nicht dekodierbar`);
  }
  const servers: DrmInfo['servers'] = {};
  const headers: DrmInfo['headers'] = {};

  for (const [keySystem, entry] of Object.entries<any>(cfg || {})) {
    const lic = entry?.license;
    if (!lic?.server_url) continue;
    if (lic.req_data) {
      let reqData = '';
      try {
        reqData = decodeB64Utf8(lic.req_data);
      } catch {}
      // {CHA-RAW} = send the raw CDM challenge, which is Shaka's default.
      if (reqData !== '{CHA-RAW}') {
        console.warn(`[drm] ${keySystem}: req_data "${reqData}" wird nicht unterstützt`);
        continue;
      }
    }
    servers[keySystem] = String(lic.server_url);

    const h: Record<string, string> = {};
    if (lic.req_headers) {
      for (const [k, v] of new URLSearchParams(String(lic.req_headers))) {
        if (!FORBIDDEN_HEADERS.has(k.toLowerCase())) h[k] = v;
      }
    }
    headers[keySystem] = h;
  }

  if (Object.keys(servers).length === 0) {
    throw new Error(`${DRM_HEADER} enthält keinen nutzbaren Lizenzserver`);
  }
  return { servers, headers };
}
