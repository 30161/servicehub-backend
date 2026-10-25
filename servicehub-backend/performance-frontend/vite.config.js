import { loadEnv } from 'vite';
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';

export default defineConfig(({ command, mode }) => {
  const env = loadEnv(mode, process.cwd(), '');
  return {
    base: command === 'build' ? '/performance/' : '/',
    plugins: [react(), tailwindcss()],
    server: {
      port: 5173,
      proxy: {
        '/api': env.VITE_DEV_API_TARGET || 'http://127.0.0.1:5000'
      }
    },
    build: {
      outDir: 'dist',
      emptyOutDir: true
    }
  };
});
