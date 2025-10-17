import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react-swc';

export default defineConfig({
  plugins: [react()],
  build: {
    outDir: 'build',
    sourcemap: true
  },
  server: {
    port: 5173,
    host: true
  },
  test: {
    environment: 'jsdom',
    setupFiles: './vitest.setup.js',
    globals: true
  }
});
