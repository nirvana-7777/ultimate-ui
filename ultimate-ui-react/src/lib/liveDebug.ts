// TEMP DEBUG ([live-debug]): lifecycle tracing. Remove again after diagnosis.
import { useEffect } from 'react';

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

export function useLifecycleLog(name: string) {
  useEffect(() => {
    installGlobalListeners();
    console.info(`[live-debug] ${name} MOUNTED`);
    return () => console.info(`[live-debug] ${name} UNMOUNTED`);
  }, [name]);
}
