import { defineConfig, loadEnv } from 'vite';
import react from '@vitejs/plugin-react';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const configDir = path.dirname(fileURLToPath(import.meta.url));

export default defineConfig(({ mode }) => {
  const env = {
    ...loadEnv(mode, configDir, ''),
    ...loadEnv(mode, process.cwd(), ''),
    ...process.env,
  };

  if (mode === 'production') {
    const required = ['VITE_API_BASE_URL', 'VITE_SOCKET_URL'];
    const missing = required.filter((key) => !env[key]?.trim());
    if (missing.length) {
      throw new Error(`Production build requires environment variables: ${missing.join(', ')}`);
    }
  }

  return {
  plugins: [react()],
  server: {
    host: true,
    port: 5173,
    proxy: {
      '/api': {
        target: 'http://127.0.0.1:5000',
        changeOrigin: true,
        secure: false,
      },
      '/images': {
        target: 'http://127.0.0.1:5000',
        changeOrigin: true,
        secure: false,
      },
    },
  },
};
});
