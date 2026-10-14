// @ts-check
import { defineConfig } from 'astro/config'
import starlight from '@astrojs/starlight'
import remarkGfm from 'remark-gfm'
import { unified } from '@astrojs/markdown-remark'

// exactcli: Astro + Starlight for GitHub Pages (project site).
// Live URL: https://wavyx.github.io/exactcli -> site + base below.
export default defineConfig({
  site: 'https://wavyx.github.io',
  base: '/exactcli',

  // GFM tables in Markdown; smartypants off so examples keep literal
  // `--flags` and straight quotes.
  markdown: {
    processor: unified({ smartypants: false, remarkPlugins: [remarkGfm] }),
  },

  integrations: [
    starlight({
      title: 'exactcli',
      description:
        'An open-source CLI for Exact Online: typed reads, safe writes, for terminals, CI and AI agents.',
      logo: { src: './src/assets/exactcli-mark.svg', replacesTitle: false },
      components: {
        Header: './src/components/Header.astro',
        Footer: './src/components/Footer.astro',
      },
      social: [
        {
          icon: 'github',
          label: 'GitHub',
          href: 'https://github.com/wavyx/exactcli',
        },
      ],
      // home.css stays out: its class names (.card, .tab) would restyle
      // Starlight's own components; only the home page imports it.
      customCss: ['./src/styles/custom.css'],
      // Code blocks stay dark in both site themes, like the terminal on the
      // home page.
      expressiveCode: {
        themes: ['github-dark'],
        styleOverrides: {
          borderRadius: '10px',
          borderColor: '#2F2F37',
          codeFontFamily:
            "'JetBrains Mono Variable', 'JetBrains Mono', ui-monospace, Menlo, monospace",
          codeFontSize: '0.86rem',
          frames: {
            editorActiveTabIndicatorTopColor: '#F0525A',
            terminalTitlebarDotsForeground: '#8E8E99',
            terminalBackground: '#1B1B1F',
            editorBackground: '#1B1B1F',
          },
        },
      },
      sidebar: [
        {
          label: 'Get started',
          items: [
            { label: 'Overview', slug: 'guides/overview' },
            { label: 'Installation', slug: 'guides/installation' },
            { label: 'Authentication', slug: 'guides/authentication' },
            { label: 'Profiles and divisions', slug: 'guides/profiles' },
          ],
        },
        {
          label: 'Guides',
          items: [
            { label: 'Reading data', slug: 'guides/reading' },
            { label: 'Safe writes', slug: 'guides/writes' },
            { label: 'Entries and invoices', slug: 'guides/entries' },
            { label: 'Lines of a document', slug: 'guides/lines' },
            { label: 'Master data', slug: 'guides/master-data' },
            { label: 'Payments and collections', slug: 'guides/payments' },
            { label: 'Sync, backup and webhooks', slug: 'guides/sync' },
          ],
        },
        {
          label: 'Automation',
          items: [
            { label: 'Output and filtering', slug: 'automation/output' },
            { label: 'Exit codes', slug: 'automation/exit-codes' },
            { label: 'AI agents and MCP', slug: 'automation/agents' },
            { label: 'CI pipelines', slug: 'automation/ci' },
          ],
        },
        {
          label: 'Reference',
          items: [{ autogenerate: { directory: 'reference' } }],
        },
      ],
    }),
  ],
})
