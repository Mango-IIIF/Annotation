import { defineConfig } from 'vite';

export default defineConfig(({ command }) => {
  if (command === 'serve') {
    return {
      root: 'demo',
      server: {
        port: 5174,
      },
    };
  }

  return {
    build: {
      lib: {
        entry: {
          index: 'src/index.ts',
          w3c: 'src/w3c.ts',
        },
        formats: ['es'],
      },
      rollupOptions: {
        external: ['openseadragon'],
      },
    },
  };
});
