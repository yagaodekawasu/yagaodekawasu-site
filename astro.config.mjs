// @ts-check
import { defineConfig } from 'astro/config';

import tailwindcss from '@tailwindcss/vite';
import sitemap from '@astrojs/sitemap';
import { satteri } from '@astrojs/markdown-satteri';
import { linkCardPlugin } from './src/lib/link-cards.mjs';
import { externalLinkPlugin } from './src/lib/external-links.mjs';
import { mathPlugin } from './src/lib/math.mjs';
import { calloutPlugin } from './src/lib/callout.mjs';
import { imageCaptionPlugin } from './src/lib/image-caption.mjs';
import { glossaryPlugin } from './src/lib/glossary.mjs';

// https://astro.build/config
export default defineConfig({
  site: 'https://yagaodekawasu.com',
  prefetch: {
    prefetchAll: true
  },
  integrations: [sitemap()],
  markdown: {
    processor: satteri({
      mdastPlugins: [linkCardPlugin, mathPlugin, calloutPlugin, imageCaptionPlugin, glossaryPlugin],
      hastPlugins: [externalLinkPlugin],
      // 脚注セクションの見出しはremark-rehype由来の既定値「Footnotes」が入るため，
      // Sätteri組み込みのi18nオプションで日本語に差し替える。
      features: {
        math: true,
        directive: true,
        gfm: { footnotes: { label: '注釈' } }
      }
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