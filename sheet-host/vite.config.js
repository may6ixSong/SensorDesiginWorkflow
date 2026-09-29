import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

const BASE = '/sheet-host/';
const BARE = BASE.slice(0, -1);

/** SIREN의 SHEET_HOST_URL은 끝 슬래시 없이(`.../sheet-host`) 쓰는데 Vite는 base를 슬래시까지 맞춰야 연다. */
const redirectBareBase = {
  name: 'redirect-bare-base',
  configureServer(server) {
    server.middlewares.use((req, res, next) => {
      const [path, query] = (req.url ?? '').split('?');
      if (path !== BARE) {
        next();
        return;
      }
      res.statusCode = 302;
      res.setHeader('Location', query ? `${BASE}?${query}` : BASE);
      res.end();
    });
  },
};

// SDP_SPA 개발 서버와 같은 주소(http://localhost:3000/sheet-host)에서 뜬다 — SIREN web의
// SHEET_HOST_URL 하나로 둘 중 어느 쪽이든 쓸 수 있다. 같은 포트라 한 번에 하나만 띄운다.
export default defineConfig({
  plugins: [react(), redirectBareBase],
  base: BASE,
  server: { port: 3000, strictPort: true },
  preview: { port: 3000, strictPort: true },
});
