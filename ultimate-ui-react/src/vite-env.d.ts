/// <reference types="vite/client" />

type ShakaModule = typeof import('shaka-player/dist/shaka-player.compiled');

declare global {
  interface Window {
    /** Runtime shape: window.shaka is the shaka namespace, not the module wrapper. */
    shaka: ShakaModule['default'];
    __ULTIMATE_CONFIG__?: Record<string, any>;
  }
}

export {};
