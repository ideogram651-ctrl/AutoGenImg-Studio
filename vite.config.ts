import tailwindcss from '@tailwindcss/vite';
import react from '@vitejs/plugin-react';
import {defineConfig} from 'vite';

export default defineConfig(() => {
  return {
    plugins: [react(), tailwindcss()],
    resolve: {
      alias: {
        '@': import.meta.dirname,
      },
    },
    server: {
      // HMR is disabled in AI Studio via DISABLE_HMR env var.
      // Do not modify—file watching is disabled to prevent flickering during agent edits.
      hmr: process.env.DISABLE_HMR !== 'true',
      // Disable file watching when DISABLE_HMR is true to save CPU during agent edits.
      // Exclude the Chrome automation profile so Vite's watcher does not attempt
      // to watch Chrome-held lock files (Sessions, Preferences.tmp, Local State.tmp)
      // which cause EBUSY errors on Windows.
      watch: process.env.DISABLE_HMR === 'true'
        ? null
        : {
          ignored: [
            '**/browser-profile/**',
            '**/output/**',
            '**/runs/**',
            '**/project-data/**',
            '**/input/**',
            '**/assets/**',
            '**/references/**',
            '**/.download_*',
            '**/*.part',
            '**/*.tmp',
            '**/*.bak',
            '**/events.jsonl',
            '**/run.log',
            '**/*.jsonl',
          ],
        },
    },
  };
});
