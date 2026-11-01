import { defineConfig } from 'vite';
import { copyFileSync } from 'node:fs';
import { svelte } from '@sveltejs/vite-plugin-svelte';

export default defineConfig(() => {
  return {
    plugins: [svelte({ configFile: 'svelte.config.js' }), {
      name: 'copy-annotorious-css',
      closeBundle() {
        copyFileSync(
          'node_modules/@annotorious/openseadragon/dist/annotorious-openseadragon.css',
          'dist/annotorious.css',
        );
      },
    }],
    build: {
      lib: {
        entry: {
          index: 'src/index.ts',
        },
        formats: ['es'],
      },
      rollupOptions: {
        external: [
          'openseadragon',
          '@annotorious/openseadragon',
          '@annotorious/plugin-tools',
          '@annotorious/plugin-magnetic-outline',
          'svelte',
          /^svelte\//,
          '@lucide/svelte',
        ],
      },
    },
  };
});
