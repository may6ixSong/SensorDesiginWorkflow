import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

// SIREN web(5173)·Calypso(5174)와 겹치지 않는 포트. SIREN web은 VITE_SHEET_HOST_URL로 이 주소를 띄운다.
export default defineConfig({
  plugins: [react()],
  server: { port: 5175, strictPort: true },
  preview: { port: 5175, strictPort: true },
});
