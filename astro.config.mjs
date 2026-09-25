import { defineConfig } from 'astro/config'

// GitHub project pages need BASE_PATH=/repo-name/. User pages and custom domains stay at /.
export default defineConfig({
  site: process.env.SITE_URL || 'https://example.github.io',
  base: process.env.BASE_PATH || '/',
})
