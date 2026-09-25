import { defineConfig } from 'astro/config'

// GitHub project pages need BASE_PATH=/mc-daily-hero (leading slash, no trailing slash).
// A user site or a custom domain at the root of the host stays at /.
export default defineConfig({
  site: process.env.SITE_URL || 'https://example.github.io',
  base: process.env.BASE_PATH || '/',
})
