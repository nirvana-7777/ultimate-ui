// TEMP DEBUG ([live-debug]): lifecycle tracing. Remove again after diagnosis.
import { useEffect } from 'react';

// Who detaches / moves <main class="content"> or the player? Log a stack for
// every DOM operation that touches those elements (installed at import time,
// i.e. before React renders anything).
function stackOf(): string {
  return (new Error().stack || '').split('\n').slice(2, 9).join('\n    ');
}
function isWatched(n: any): boolean {
  return (
    !!n &&
    n.nodeType === 1 &&
    (n.tagName === 'MAIN' || (n.classList && n.classList.contains('floating-player')))
  );
}
function wrapMethod(proto: any, name: string, pick: (self: any, args: any[]) => any) {
  const orig = proto[name];
  if (typeof orig !== 'function') return;
  proto[name] = function (this: any, ...args: any[]) {
    try {
      const n = pick(this, args);
      if (isWatched(n)) {
        console.info(`[live-debug] DOM ${name}: <${n.tagName.toLowerCase()} class="${n.className}">\n    ${stackOf()}`);
      }
    } catch {}
    return orig.apply(this, args);
  };
}
wrapMethod(Node.prototype, 'removeChild', (_s, a) => a[0]);
wrapMethod(Node.prototype, 'appendChild', (_s, a) => a[0]);
wrapMethod(Node.prototype, 'insertBefore', (_s, a) => a[0]);
wrapMethod(Node.prototype, 'replaceChild', (_s, a) => a[1]);
wrapMethod(Element.prototype, 'remove', (s) => s);
wrapMethod(Element.prototype, 'replaceWith', (s) => s);
wrapMethod(Element.prototype, 'replaceChildren', (s) =>
  s.querySelector && s.querySelector('main.content, .floating-player') ? s.querySelector('main.content, .floating-player') : null
);
for (const prop of ['innerHTML', 'outerHTML', 'textContent']) {
  const proto: any = prop === 'textContent' ? Node.prototype : Element.prototype;
  const d = Object.getOwnPropertyDescriptor(proto, prop);
  if (d && d.set) {
    const set = d.set;
    Object.defineProperty(proto, prop, {
      ...d,
      set(this: any, v: any) {
        try {
          const hit = this.querySelector && this.querySelector('main.content, .floating-player');
          if (hit || isWatched(this)) {
            console.info(`[live-debug] DOM set ${prop} on <${this.tagName}>\n    ${stackOf()}`);
          }
        } catch {}
        return set.call(this, v);
      },
    });
  }
}

let installed = false;
function installGlobalListeners() {
  if (installed) return;
  installed = true;
  const log = (...a: unknown[]) => console.info('[live-debug]', ...a);
  window.addEventListener('error', (e) => log('window error:', e.message, e.filename, e.lineno));
  window.addEventListener('unhandledrejection', (e) => log('unhandledrejection:', String((e as any).reason)));
  window.addEventListener('vite:preloadError' as any, (e: any) => log('vite:preloadError', e?.payload?.message ?? e));
  window.addEventListener('pageshow', (e: any) => log('pageshow persisted =', e.persisted));
  window.addEventListener('pagehide', () => log('pagehide'));
  document.addEventListener('visibilitychange', () => log('visibility ->', document.visibilityState));
  log('debug listeners installed');
}

installGlobalListenersAtImport();

function installGlobalListenersAtImport() {
  installGlobalListeners();
}

export function useLifecycleLog(name: string) {
  useEffect(() => {
    installGlobalListeners();
    console.info(`[live-debug] ${name} MOUNTED`);
    return () => console.info(`[live-debug] ${name} UNMOUNTED`);
  }, [name]);
}
