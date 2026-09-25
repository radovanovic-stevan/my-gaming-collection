import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { collectionApi } from './server/api';

// Relative base so the build works from any GitHub Pages path.
export default defineConfig({
  base: './',
  plugins: [react(), collectionApi()],
  server: {
    // The editing API rewrites these; the app updates itself from API responses,
    // so a file-watcher reload would only throw away the current view.
    watch: { ignored: ['**/public/data/**', '**/public/images/**'] },
  },
});
