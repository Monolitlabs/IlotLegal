// Creates the production NocoDB `Conversations` and `Messages` tables that the
// "Ilot - Log WA Message (sub)" workflow reads and writes.
//
//   NOCODB_TOKEN=... node scripts/create-conversation-tables.mjs            # dry run
//   NOCODB_TOKEN=... node scripts/create-conversation-tables.mjs --commit   # create
//
// Dry run by default, matching `import:sanity:dry` and `seed-agents.mjs`.
//
// On --commit the new table IDs are written into the two workflow JSON files in
// place of the `__CONVERSATIONS_TABLE_ID__` / `__MESSAGES_TABLE_ID__` placeholders.
// Production IDs belong in n8n-workflows/*.json; local IDs never do
// (scripts/dev/README.md).
//
// `Messages` is the source of truth for conversation history. `Conversations`
// carries a rendered transcript that is rebuilt from it on every turn.

import { readFileSync, writeFileSync } from 'node:fs'

const BASE = process.env.NOCODB_URL || 'https://nocodb.ilotlegal.com'
const PROJECT = process.env.NOCODB_PROJECT || 'pkm6hqm4mh9vj0s'
const TOKEN = process.env.NOCODB_TOKEN

const commit = process.argv.includes('--commit')

const WORKFLOW_FILES = [
  'n8n-workflows/ilot-log-wa-message.json',
  'n8n-workflows/ilot-inbound-whatsapp.json',
]

const text = (title) => ({ title, uidt: 'SingleLineText' })
const longText = (title) => ({ title, uidt: 'LongText' })
const number = (title) => ({ title, uidt: 'Number' })
const ID_COLUMN = { title: 'Id', uidt: 'ID' }

const TABLES = [
  {
    title: 'Conversations',
    placeholder: '__CONVERSATIONS_TABLE_ID__',
    columns: [
      ID_COLUMN,
      text('phone'),
      text('wa_profile_name'),
      text('started_at'),
      text('last_message_at'),
      number('message_count'),
      longText('transcript'),
      text('client_id'),
      text('commitment_token'),
    ],
  },
  {
    title: 'Messages',
    placeholder: '__MESSAGES_TABLE_ID__',
    columns: [
      ID_COLUMN,
      text('conversation_id'),
      text('phone'),
      text('wa_message_id'),
      text('direction'),
      text('actor'),
      text('msg_type'),
      longText('body'),
      text('media_id'),
      text('wa_timestamp'),
      text('logged_at'),
      longText('raw'),
    ],
  },
]

function die(msg) {
  console.error(`\n${msg}`)
  process.exit(1)
}

async function call(path, { method = 'GET', body } = {}) {
  const res = await fetch(`${BASE}${path}`, {
    method,
    headers: { 'content-type': 'application/json', 'xc-token': TOKEN },
    ...(body ? { body: JSON.stringify(body) } : {}),
  })
  const raw = await res.text()
  if (!res.ok) throw new Error(`${method} ${path} -> ${res.status}\n${raw.slice(0, 500)}`)
  return raw ? JSON.parse(raw) : {}
}

async function main() {
  if (!TOKEN) die('NOCODB_TOKEN is not set.')

  let existing
  try {
    const out = await call(`/api/v2/meta/bases/${PROJECT}/tables`)
    existing = out.list || []
  } catch (err) {
    die(
      `Could not list tables in base ${PROJECT}:\n  ${err.message}\n\n` +
        'If this is a 401/403, the API token cannot reach the meta API. Create the two\n' +
        'tables by hand in the NocoDB UI with the columns printed by a dry run, then put\n' +
        'their IDs into the workflow JSON placeholders.',
    )
  }

  const ids = {}
  for (const spec of TABLES) {
    const found = existing.find((t) => t.title === spec.title)
    if (found) {
      console.log(`  ${spec.title} already exists (${found.id}) — leaving as is`)
      ids[spec.placeholder] = found.id
      continue
    }

    if (!commit) {
      console.log(`  would create ${spec.title} with ${spec.columns.length} columns:`)
      for (const c of spec.columns) console.log(`      ${c.title.padEnd(18)} ${c.uidt}`)
      continue
    }

    const table = await call(`/api/v2/meta/bases/${PROJECT}/tables`, {
      method: 'POST',
      body: { title: spec.title, table_name: spec.title, columns: spec.columns },
    })
    ids[spec.placeholder] = table.id
    console.log(`  created ${spec.title} (${table.id})`)
  }

  if (!commit) {
    console.log('\nDry run. Nothing was created. Re-run with --commit.')
    return
  }

  let replaced = 0
  for (const file of WORKFLOW_FILES) {
    const before = readFileSync(file, 'utf8')
    let after = before
    for (const [placeholder, id] of Object.entries(ids)) {
      after = after.split(placeholder).join(id)
    }
    if (after !== before) {
      writeFileSync(file, after)
      replaced += 1
      console.log(`  patched table IDs into ${file}`)
    }
  }
  if (replaced === 0) console.log('  no placeholders left to patch')

  console.log(`
Next, by hand in the NocoDB UI:

  Add a UNIQUE constraint on Messages.wa_message_id.

  It is what makes a retried Meta webhook delivery harmless. The workflow also
  looks the id up before inserting, but that is a check-then-write and two
  deliveries arriving together can both pass it. processed_emails.message_id
  carries the same constraint for the same reason.

Then import and publish the workflows, and verify activeVersion — not the
top-level draft nodes (scripts/dev/README.md).`)
}

main().catch((err) => {
  console.error(`\nfailed: ${err.message}`)
  process.exit(1)
})
