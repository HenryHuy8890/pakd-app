import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig({
  base: '/pakd-app/',
  plugins: [react()],
  build: { outDir: 'dist', chunkSizeWarningLimit: 1500 },
});
