import { defineConfig } from 'vite';
import glsl from 'vite-plugin-glsl';

const envHex = (process.env.GALLERY_KEY || '').match(/[0-9a-f]{64}/i)?.[0];
const openPath = envHex ? `/#${envHex.toLowerCase()}` : true;

export default defineConfig({
  base: './',
  plugins: [glsl()],
  server: { open: openPath },
  preview: { open: openPath },
  build: {
    assetsInlineLimit: 0,
    chunkSizeWarningLimit: 1500,
  },
});
