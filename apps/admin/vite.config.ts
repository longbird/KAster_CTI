import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { createDevServerAccessGuard, resolveDevServerHost } from '../../tools/vite-dev-server-security.mjs';

export default defineConfig(() => ({
  plugins: [react(), createDevServerAccessGuard()],
  server: {
    host: resolveDevServerHost(),
    port: 5173,
  },
}));
