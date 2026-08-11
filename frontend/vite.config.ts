import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

// Supabase endpoints that need proxying for mainland China users
const SUPABASE_TARGET = 'https://avuldnywmiflbmmlgmas.supabase.co';

export default defineConfig({
  plugins: [react()],
  server: {
    port: 3000,
    open: true,
    proxy: {
      // Proxy /api/auth → Supabase Auth
      '/api/auth': {
        target: SUPABASE_TARGET,
        changeOrigin: true,
        rewrite: (path) => path.replace(/^\/api\/auth/, '/auth/v1'),
      },
      // Proxy /api/rest → Supabase PostgREST
      '/api/rest': {
        target: SUPABASE_TARGET,
        changeOrigin: true,
        rewrite: (path) => path.replace(/^\/api\/rest/, '/rest/v1'),
      },
    },
  },
  build: {
    outDir: 'dist',
  },
  resolve: {
    alias: {
      src: '/src',
    },
  },
});
