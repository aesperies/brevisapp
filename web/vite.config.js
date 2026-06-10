import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import path from 'path';
import { fileURLToPath } from 'url';

const here = path.dirname(fileURLToPath(import.meta.url));

// Builds the SPA from web/app.html into dist-web/ at the repo root.
// server.js serves dist-web/ when present (falls back to the legacy
// public/app.html so a missed build never blanks production).
export default defineConfig({
    root: here,
    plugins: [react()],
    build: {
        outDir: path.resolve(here, '..', 'dist-web'),
        emptyOutDir: true,
        rollupOptions: {
            input: path.resolve(here, 'app.html'),
        },
    },
    server: {
        port: 5173,
        // Local dev: `npm run dev` (API on :3000) + `npm run dev:web`
        proxy: {
            '/api': 'http://localhost:3000',
            '/health': 'http://localhost:3000',
        },
    },
});
