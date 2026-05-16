import { defineConfig } from 'astro/config';
import starlight from '@astrojs/starlight';

export default defineConfig({
  site: 'https://supanut9.github.io',
  base: '/orchestra',
  integrations: [
    starlight({
      title: 'Orchestra',
      description:
        'An open-source, model-agnostic desktop IDE for the AI-orchestration era.',
      logo: {
        src: './public/favicon.svg',
      },
      social: [
        {
          icon: 'github',
          label: 'GitHub',
          href: 'https://github.com/supanut9/orchestra',
        },
      ],
      sidebar: [
        {
          label: 'Start here',
          items: [
            { label: 'Introduction', slug: 'index' },
            { label: 'Getting started', slug: 'getting-started' },
          ],
        },
        {
          label: 'Architecture',
          items: [{ label: 'Overview', slug: 'architecture' }],
        },
        {
          label: 'Concepts',
          items: [
            { label: 'Service Orchestrator', slug: 'concepts/service-orchestrator' },
            { label: 'Shared PTY', slug: 'concepts/shared-pty' },
            { label: 'Task Lanes', slug: 'concepts/task-lanes' },
            { label: 'MCP Servers', slug: 'concepts/mcp' },
            { label: 'Skills', slug: 'concepts/skills' },
            { label: 'Memory', slug: 'concepts/memory' },
          ],
        },
      ],
      customCss: [],
      editLink: {
        baseUrl: 'https://github.com/supanut9/orchestra/edit/main/docs-site/',
      },
    }),
  ],
});
