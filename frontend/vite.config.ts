import vue from '@vitejs/plugin-vue';
import { defineConfig, loadEnv } from 'vite';

// The backend is the only gateway: REST under /api and Socket.IO under /socket.io, both
// proxied so the browser talks to one origin.
export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), '');
  const backend = env.VITE_BACKEND_URL || 'http://localhost:3000';
  return {
    plugins: [vue()],
    server: {
      port: 5173,
      proxy: {
        '/api': backend,
        '/socket.io': { target: backend, ws: true },
      },
    },
  };
});
