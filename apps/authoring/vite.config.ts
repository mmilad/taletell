import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { storytellerApiPlugin } from './vite-api-plugin.ts';
import { storytellerImagePlugin } from './vite-image-plugin.ts';
import { storytellerStoryPlugin } from './vite-story-plugin.ts';

export default defineConfig({
  plugins: [react(), storytellerApiPlugin(), storytellerStoryPlugin(), storytellerImagePlugin()]
});
