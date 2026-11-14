import { getConfig } from '@/lib/api';

const STORAGE_KEY = 'ultimate-ui-theme';

export type Theme = 'light' | 'dark' | 'auto';

export function applyTheme(theme: Theme): void {
  const actual =
    theme === 'auto'
      ? window.matchMedia('(prefers-color-scheme: dark)').matches
        ? 'dark'
        : 'light'
      : theme;

  document.documentElement.setAttribute('data-theme', actual);
  try {
    localStorage.setItem(STORAGE_KEY, theme);
  } catch {
    /* storage blocked */
  }
}

function isTheme(value: unknown): value is Theme {
  return value === 'light' || value === 'dark' || value === 'auto';
}

/**
 * A choice made in this browser (localStorage) wins; otherwise the theme
 * saved on the server (Config page / config.yaml) applies. Before this, the
 * server setting was never read, so changing it had no visible effect.
 */
export function loadTheme(): Theme {
  let saved: string | null = null;
  try {
    saved = localStorage.getItem(STORAGE_KEY);
  } catch {
    /* storage blocked */
  }
  if (isTheme(saved)) return saved;
  const server = getConfig()?.ui?.theme;
  return isTheme(server) ? server : 'dark';
}

export function watchSystemTheme(callback: () => void): () => void {
  const mq = window.matchMedia('(prefers-color-scheme: dark)');
  const handler = () => callback();
  mq.addEventListener('change', handler);
  return () => mq.removeEventListener('change', handler);
}
