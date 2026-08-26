// @ts-check
import { defineConfig } from 'astro/config';

import tailwindcss from '@tailwindcss/vite';
import sitemap from '@astrojs/sitemap';
import { satteri } from '@astrojs/markdown-satteri';
import { linkCardPlugin } from './src/lib/link-cards.mjs';
import { externalLinkPlugin } from './src/lib/external-links.mjs';
import { footnoteLabelPlugin } from './src/lib/footnote-label.mjs';
import { mathPlugin } from './src/lib/math.mjs';

// https://astro.build/config
export default defineConfig({
  site: 'https://yagaodekawasu.com',
  prefetch: {
    prefetchAll: true
  },
  integrations: [sitemap()],
  markdown: {
    processor: satteri({
      mdastPlugins: [linkCardPlugin, mathPlugin],
      hastPlugins: [externalLinkPlugin, footnoteLabelPlugin],
      features: { math: true }
    })
  },
  vite: {
    plugins: [tailwindcss()],
    server: {
      allowedHosts: ['yagaodekawasu.local'],
      hmr: {
        host: 'yagaodekawasu.local',
        protocol: 'wss',
        clientPort: 443
      }
    }
  }
});