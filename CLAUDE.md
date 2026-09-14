# Project Notes for Claude

## Stack
- Next.js 15 App Router + React 19
- Sanity CMS (private dataset) — all content served via GROQ
- Tailwind CSS v4, Lucide React icons
- No Supabase — removed entirely; Sanity is the source of truth
- Dev port: **3003** (port 3000 is occupied by another project)

## Data Import Workflow

Whenever the client's service data changes, the full workflow is:

1. Update `docs/seed-data/raw.json` (or re-run `scripts/generate-seed.py`)
2. Dry-run the import to verify:
   ```
   npm run import:sanity:dry
   ```
3. Run the real import:
   ```
   npm run import:sanity
   ```
4. **Always follow with the cleanup script** to remove any orphaned Sanity documents
   (docs whose `_id` is no longer in the expected set — renamed, restructured, or removed services):
   ```
   npm run cleanup:sanity:dry   ← preview what will be removed
   npm run cleanup:sanity       ← actually remove them
   ```

### Why this matters
Sanity's `createOrReplace` only upserts by exact `_id`. If a category/sub-category/service is
renamed (changing its slug), the old document is never touched — it stays in Sanity with
`isActive: true` and shows up in GROQ queries alongside the new one, causing duplicates.
The cleanup script computes expected `_id`s from the current seed data and removes anything
outside that set (hard-delete where possible, `isActive: false` where references exist).

## Sanity Document ID Format
- Categories:     `category-{slug}`
- Sub-categories: `subCategory-{categorySlug}-{subSlug}`
- Services:       `service-{categorySlug}-{subCategorySlug}-{serviceSlug}`

## Seed Data Format (`docs/seed-data/raw.json`)
Snake_case fields: `category_slug`, `sub_category_slug`, `service_slug`, `category_sort_order`,
`sub_category_sort_order`, `service_sort_order`, `description`, `target_client`,
`key_deliverables`, `estimated_timeline`, `real_time_work`, `note`, `whatsapp_message` (optional).
Slugs are **pre-computed** in the JSON — `parseClientData.ts` reads them directly,
no auto-generation from names.

### WhatsApp Messages
`whatsapp_message` is **optional** in the JSON. If blank/missing, the parser auto-generates:
> `"Hi Ilot 👋 I'd like to learn more about your *{service_name}* service. Can you help me?"`

The `*bold*` service name lets the WhatsApp bot reliably identify the service.
If a row has a value in `whatsapp_message`, it is used as-is (manual override).
All 100 services always have a message written to Sanity — never null.
(`docs/seed-data/raw.json` holds 101 rows: 100 services plus one category-only
placeholder row for Property Advisory, which has no service yet.)

### Null fields
Optional object-type fields (`localizedString`, `localizedText`) must be **absent** from the
Sanity document when empty — NOT written as `null`. The writer uses conditional spreading.
If you ever see "Invalid property value" errors in Studio, run:
```
npm run fix:sanity
```
This unsets null object fields and fixes slug conflicts on soft-disabled orphan docs.

## GROQ / Types Notes
- All GROQ projections rename camelCase Sanity fields → snake_case to match TS types in
  `src/lib/db/types.ts`. Do not change field names in queries without updating types.
- Localized fields: `coalesce(field.en, null)` — English only for now.
- Cache tags: `category`, `subCategory`, `service` — used for on-demand revalidation.

## Docs layout
- `docs/` — current. `design.md`, `deploy-coolify.md`, `human-agent-handoff.md`,
  `whatsapp-cutover-status.md`, `commitment-gate-flow.md`, `conversation-history.md`,
  `client/editing-content.md`.
- `docs/archive/` — historical only. Superseded runbooks, landed phase plans, the client
  proposal, and `chatwoot-evaluation.md` (evaluated, worked, not adopted — its Meta and
  Chatwoot findings are still accurate and worth reading). Do not treat anything in there as
  describing the current system; see its README.
- Both seed inputs live in `docs/seed-data/`: `raw.json` (primary) and
  `legacy-categories.sql` (fallback for the 4 partially-delivered categories, read by both
  the import and cleanup scripts). There is no `supabase/` folder any more.
- File naming in `docs/` is kebab-case throughout; `README.md` is the only exception.
