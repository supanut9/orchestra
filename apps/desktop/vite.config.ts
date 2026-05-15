import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';
import { resolve } from 'path';

// https://vitejs.dev/config/
export default defineConfig(() => ({
  plugins: [react(), tailwindcss()],

  // Path alias
  resolve: {
    alias: {
      '@': resolve(__dirname, './src'),
    },
  },

  // Vite options tailored for Tauri development and production
  //
  // 1. Prevent Vite from obscuring Rust errors
  clearScreen: false,

  // 2. Tauri expects a fixed port, fail if it's not available
  server: {
    port: 1420,
    strictPort: true,
    host: process.env['TAURI_DEV_HOST'] || false,
    hmr: process.env['TAURI_DEV_HOST']
      ? {
          protocol: 'ws',
          host: process.env['TAURI_DEV_HOST'],
          port: 1421,
        }
      : undefined,
    watch: {
      // 3. Tell Vite to ignore watching `src-tauri`
      ignored: ['**/src-tauri/**'],
    },
  },

  // Env vars exposed to the frontend
  envPrefix: ['VITE_', 'TAURI_ENV_'],

  build: {
    target: process.env['TAURI_ENV_PLATFORM'] === 'windows' ? 'chrome105' : 'safari16',
    minify: (process.env['TAURI_ENV_DEBUG'] ? false : 'esbuild') as 'esbuild' | false,
    sourcemap: !!process.env['TAURI_ENV_DEBUG'],
  },
}));
