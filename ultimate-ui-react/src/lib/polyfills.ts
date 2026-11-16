/**
 * crypto.randomUUID() is only exposed in secure contexts (HTTPS / localhost).
 * The UI is typically served over plain http://<host>:<port>, where it is
 * undefined and shaka-player throws from its video event handlers and during
 * load(). getRandomValues() is available everywhere, so build a v4 UUID
 * from it.
 */
(function polyfillRandomUUID() {
  const c: any = typeof globalThis !== 'undefined' ? (globalThis as any).crypto : undefined;
  if (!c || typeof c.randomUUID === 'function' || typeof c.getRandomValues !== 'function') return;

  const randomUUID = (): string => {
    const b = c.getRandomValues(new Uint8Array(16)) as Uint8Array;
    b[6] = (b[6] & 0x0f) | 0x40; // version 4
    b[8] = (b[8] & 0x3f) | 0x80; // variant 10xx
    const h = Array.from(b, (x) => x.toString(16).padStart(2, '0'));
    return `${h.slice(0, 4).join('')}-${h.slice(4, 6).join('')}-${h.slice(6, 8).join('')}-${h
      .slice(8, 10)
      .join('')}-${h.slice(10).join('')}`;
  };

  try {
    Object.defineProperty(c, 'randomUUID', { value: randomUUID, configurable: true, writable: true });
  } catch {
    try {
      c.randomUUID = randomUUID;
    } catch {
      /* nothing more we can do */
    }
  }
})();

export {};
