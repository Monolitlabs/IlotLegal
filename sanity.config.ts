import { defineConfig } from 'sanity'
import { structureTool } from 'sanity/structure'
import { visionTool } from '@sanity/vision'
import { googleAnalyticsPlugin } from 'sanity-plugin-analytics'
import { schemaTypes } from './src/sanity/schemas'
import { structure } from './src/sanity/structure'
import { analyticsAuth } from './src/sanity/plugins/analyticsAuth'
import { articleAnalytics } from './src/sanity/plugins/articleAnalytics'
import { apiVersion, dataset, projectId } from './src/sanity/env'

export default defineConfig({
  name: 'default',
  title: 'Ilot CMS',
  basePath: '/studio',
  projectId,
  dataset,
  // Token login (no Sanity cookie) so the Studio holds the user's token and
  // analyticsAuth can send it to /api/analytics.
  auth: { loginMethod: 'token' },
  plugins: [
    structureTool({ structure }),
    visionTool({ defaultApiVersion: apiVersion }),
    googleAnalyticsPlugin({ siteTitle: 'Ilot Legal' }),
    analyticsAuth(),
    articleAnalytics(),
  ],
  schema: { types: schemaTypes },
})
