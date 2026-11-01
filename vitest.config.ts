import { defineConfig } from 'vitest/config';
import { svelte } from '@sveltejs/vite-plugin-svelte';

export default defineConfig({
  plugins: [svelte({ configFile: 'svelte.config.js' }) as never],
  test: {
    environment: 'jsdom',
    // Annotorious imports named values from OpenSeadragon's CommonJS bundle.
    server: { deps: { inline: [/@annotorious\//, 'openseadragon'] } },
  },
});
