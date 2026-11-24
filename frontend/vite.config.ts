import tailwindcss from '@tailwindcss/vite';
import react from '@vitejs/plugin-react';
import path from 'path';
import {defineConfig, loadEnv} from 'vite';

const repoRoot = path.resolve(__dirname, '..');

// Proxy /api to the local backend on whatever SERVER_PORT backend/.env sets, so the two
// never drift apart (3001 is often taken by other local projects).
const backendPort = loadEnv('development', path.resolve(repoRoot, 'backend'), 'SERVER_PORT').SERVER_PORT || '3002';

export default defineConfig({
  root: __dirname,
  // Client-safe VITE_* values live in frontend/.env; server secrets stay in backend/.env.
  envDir: __dirname,
  plugins: [
    react(),
    tailwindcss(),
  ],
  resolve: {
    alias: {
      '@': __dirname,
    },
  },
  build: {
    outDir: path.resolve(__dirname, 'dist'),
    emptyOutDir: true,
  },
  server: {
    // HMR is disabled in AI Studio via DISABLE_HMR env var.
    hmr: process.env.DISABLE_HMR !== 'true',
    port: 5173,
    strictPort: true,
    fs: {
      // Allow importing ../shared from the dev server.
      allow: [repoRoot],
    },
    proxy: {
      '/api': {
        target: `http://localhost:${backendPort}`,
        changeOrigin: true,
      },
    },
  },
});
