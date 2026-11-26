import { defineConfig } from 'vite';
import { copyFileSync, existsSync } from 'node:fs';
import { svelte } from '@sveltejs/vite-plugin-svelte';

export default defineConfig(() => {
  return {
    plugins: [
      svelte({ configFile: 'svelte.config.js' }),
      {
        name: 'copy-annotation-assets',
        closeBundle() {
          copyFileSync(
            'node_modules/@annotorious/openseadragon/dist/annotorious-openseadragon.css',
            'dist/annotorious.css',
          );
          // Preserve stable `./style.css` -> `dist/annotation.css` filename when cssCodeSplit emits `index.css`.
          if (existsSync('dist/index.css')) {
            copyFileSync('dist/index.css', 'dist/annotation.css');
          }
        },
      },
    ],
    build: {
      cssCodeSplit: true,
      lib: {
        entry: {
          index: 'src/index.ts',
          view: 'src/view/index.ts',
          model: 'src/model.ts',
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
