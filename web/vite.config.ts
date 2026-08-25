import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import path from 'node:path';

export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: {
      '@': path.resolve(__dirname, 'src'),
    },
  },
  server: {
    port: 5173,
  },
  // Vite only exposes import.meta.env.* for vars matching one of these prefixes.
  // The common-platform API base URLs (SSM_WEB convention) are stored without a
  // VITE_ prefix in .env.development/.env.production, so they must be listed
  // here explicitly alongside the default 'VITE_'.
  envPrefix: ['VITE_', 'SIREN_API', 'MOBILAVE', 'USER_GROUP_API', 'SDP_COMMON_API', 'SYSTEM_API', 'ENVIRONMENT'],
});
