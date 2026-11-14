import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import path from 'path';

export default defineConfig(({ command }) => ({
  base: command === 'build' ? '/static/dist/' : '/',
  plugins: [react()],
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src'),
    },
  },
  server: {
    port: 5173,
    proxy: {
      '/api': { target: 'http://localhost:7779', changeOrigin: true },
      '/config': { target: 'http://localhost:7779', changeOrigin: true },
    },
  },
  build: {
    outDir: process.env.VITE_OUT_DIR
      ? path.resolve(process.env.VITE_OUT_DIR)
      : path.resolve(__dirname, '../src/static/dist'),
    emptyOutDir: true,
    copyPublicDir: false,
    cssCodeSplit: false,
    rollupOptions: {
      output: {
        entryFileNames: 'assets/index.js',
        chunkFileNames: 'assets/[name]-[hash].js',
        assetFileNames: (info) =>
          info.name && info.name.endsWith('.css')
            ? 'assets/index.css'
            : 'assets/[name]-[hash][extname]',
      },
    },
  },
}));
