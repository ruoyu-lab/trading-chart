import vue from '@vitejs/plugin-vue';
import { defaultClientConditions, defineConfig } from 'vite';

export default defineConfig({
  // GitHub Pages serves the playground below the repository name.
  base: process.env.PLAYGROUND_BASE ?? '/',
  plugins: [vue()],
  resolve: {
    conditions: ['@trading-chart-sdk/source', ...defaultClientConditions]
  },
  build: {
    rollupOptions: {
      input: ['index.html', 'react.html']
    }
  },
  server: {
    port: 5180
  }
});
