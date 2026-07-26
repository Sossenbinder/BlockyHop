import { defineConfig } from 'vite'

export default defineConfig({
  base: './',
  build: {
    target: 'es2022',
    // One chunk is correct for a single-canvas game: three.js is ~500 kB raw but
    // 138 kB gzipped, and splitting it would only add a round trip before first paint.
    chunkSizeWarningLimit: 700,
  },
})
