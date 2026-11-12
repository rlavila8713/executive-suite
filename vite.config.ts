import tailwindcss from '@tailwindcss/vite';
import react from '@vitejs/plugin-react';
import fs from 'node:fs';
import path from 'path';
import {defineConfig, loadEnv} from 'vite';

const appVersion = JSON.parse(fs.readFileSync(path.join(__dirname, 'package.json'), 'utf-8')).version as string;

export default defineConfig(({mode}) => {
  const env = loadEnv(mode, '.', '');
  return {
    // Relative asset paths so file:// + Electron loadFile() resolve JS/CSS correctly.
    base: './',
    plugins: [react(), tailwindcss()],
    define: {
      'process.env.GEMINI_API_KEY': JSON.stringify(env.GEMINI_API_KEY),
      'import.meta.env.VITE_APP_VERSION': JSON.stringify(appVersion),
    },
    resolve: {
      alias: {
        '@': path.resolve(__dirname, '.'),
      },
    },
    server: {
      // HMR can be disabled with DISABLE_HMR=true (e.g. AI Studio).
      hmr: process.env.DISABLE_HMR !== 'true',
      strictPort: true,
      watch: {
        // SQLite writes and API source changes must not reload the web client.
        ignored: ['**/data/**', '**/*.sqlite', '**/server/**'],
      },
      proxy: {
        '/api': { target: 'http://localhost:4000', changeOrigin: true },
        '/health': { target: 'http://localhost:4000', changeOrigin: true },
      },
    },
  };
});
