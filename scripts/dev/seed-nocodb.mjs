// Seeds the local NocoDB (docker-compose.yml) with the tables the n8n
// workflows expect, plus a few sample rows.
//
//   node scripts/dev/seed-nocodb.mjs
//
// Sample rows only — never a copy of production customer data.
//
// IMPORTANT: the table IDs printed at the end are LOCAL. They will not match
// production. Patch them into the workflow copies imported inside n8n, never
// into the JSON files in n8n-workflows/ — those hold the production IDs.

const BASE_URL = process.env.NOCODB_URL || 'http://localhost:8080'
const EMAIL = process.env.NOCODB_EMAIL || 'dev@ilot.local'
const PASSWORD = process.env.NOCODB_PASSWORD || 'Ilot#Local1'
const BASE_TITLE = process.env.NOCODB_BASE || 'Ilot Local'

async function call(path, { method = 'GET', token, apiToken, body } = {}) {
  const res = await fetch(`${BASE_URL}${path}`, {
    method,
    headers: {
      'content-type': 'application/json',
      ...(token ? { 'xc-auth': token } : {}),
      ...(apiToken ? { 'xc-token': apiToken } : {}),
    },
    ...(body ? { body: JSON.stringify(body) } : {}),
  })
  const text = await res.text()
  let json
  try {
    json = JSON.parse(text)
  } catch {
    json = text
  }
  if (!res.ok) {
    throw new Error(`${method} ${path} -> ${res.status}\n${text.slice(0, 500)}`)
  }
  return json
}

// NocoDB only allows signup while no super admin exists, so fall back to signin.
async function authenticate() {
  try {
    const out = await call('/api/v1/auth/user/signup', {
      method: 'POST',
      body: { email: EMAIL, password: PASSWORD },
    })
    console.log(`signed up super admin ${EMAIL}`)
    return out.token
  } catch {
    const out = await call('/api/v1/auth/user/signin', {
      method: 'POST',
      body: { email: EMAIL, password: PASSWORD },
    })
    console.log(`signed in as ${EMAIL}`)
    return out.token
  }
}

const text = (title, column_name) => ({ title, uidt: 'SingleLineText', ...(column_name ? { column_name } : {}) })
const longText = (title) => ({ title, uidt: 'LongText' })
const number = (title) => ({ title, uidt: 'Number' })
const checkbox = (title) => ({ title, uidt: 'Checkbox' })

const ID_COLUMN = { title: 'Id', uidt: 'ID' }

// Columns are taken from what the workflows actually read and write:
//   Agents  — docs/human-agent-handoff.md
//   Clients — "Create lead in NocoDB" node + docs/commitment-gate-flow.md
//   processed_emails — the three "Log Processed" nodes in the Commitment Gate
//   FAQs    — "Fetch active FAQs" filter + "Format as documents" code node
const TABLES = [
  {
    title: 'Agents',
    columns: [
      ID_COLUMN,
      text('name'),
      text('phone'),
      text('department'),
      checkbox('active'),
      text('slack_id'), // repurposed for the Mattermost user/channel
      number('open_cases'),
    ],
    // One active agent per department the production AI Agent can emit. Any
    // department with no active row falls to the false branch, which is the
    // broken ops alert — so a gap here reproduces the production defect.
    rows: [
      { name: 'Dewi Pratama', phone: '6281200000001', department: 'visa', active: true, slack_id: 'dewi', open_cases: 0 },
      { name: 'Sari Kusuma', phone: '6281200000002', department: 'company', active: true, slack_id: 'sari', open_cases: 0 },
      { name: 'Andi Wijaya', phone: '6281200000003', department: 'legal', active: true, slack_id: 'andi', open_cases: 0 },
      { name: 'Rina Halim', phone: '6281200000004', department: 'tax', active: true, slack_id: 'rina', open_cases: 0 },
      { name: 'Budi Santoso', phone: '6281200000005', department: 'property', active: true, slack_id: 'budi', open_cases: 0 },
      { name: 'Maya Iskandar', phone: '6281200000006', department: 'hr', active: true, slack_id: 'maya', open_cases: 0 },
      { name: 'Tomi Wibowo', phone: '6281200000007', department: 'insurance', active: true, slack_id: 'tomi', open_cases: 0 },
    ],
  },
  {
    title: 'Clients',
    columns: [
      ID_COLUMN,
      text('Phone'),
      text('Name'),
      text('Nationality'),
      text('Service'),
      text('Department'),
      longText('Summary'),
      text('Status'),
      // NocoDB reserves created_at for its own system column, so the physical
      // column is named differently; the field title stays 'Created At' because
      // that is what the "Create lead in NocoDB" node writes to.
      text('Created At', 'lead_created_at'),
      // Commitment gate (docs/commitment-gate-flow.md)
      text('commitment_status'),
      text('commitment_token'),
      longText('required_docs'),
      text('committed_at'),
      text('attachments_drive_url'),
      text('message_id'),
      text('assigned_agent_id'),
      // Stage 2 — human agent takeover
      checkbox('takeover'),
    ],
    rows: [
      {
        Phone: '6281299990001',
        Name: 'Sample Existing Lead',
        Nationality: 'Australian',
        Service: 'KITAS',
        Department: 'visa',
        Summary: 'Sample row created by seed-nocodb.mjs. Not real customer data.',
        Status: 'NEW_LEAD',
        'Created At': new Date().toISOString(),
        commitment_status: 'in_conversation',
        takeover: false,
      },
    ],
  },
  {
    // Idempotency log for the Commitment Gate. Columns are the field lists the
    // production nodes actually write — "Log Processed (committed)",
    // "(rejected)" and "(no match)" — plus the read in "Already Processed?".
    //
    // Production has a unique constraint on message_id. NocoDB's meta API does
    // not expose one here, so a duplicate will be accepted locally where
    // production would reject it. Do not use this stack to prove idempotency.
    title: 'processed_emails',
    columns: [
      ID_COLUMN,
      text('message_id'),
      text('from_email'),
      text('token'),
      text('result'),
      text('processed_at'),
    ],
    rows: [
      {
        message_id: 'seed-message-id-0001',
        from_email: 'sample@ilot.local',
        token: 'seed-token-0001',
        result: 'committed',
        processed_at: new Date().toISOString(),
      },
    ],
  },
  {
    title: 'FAQs',
    columns: [
      ID_COLUMN,
      longText('Question'),
      longText('Answer'),
      text('Department'),
      checkbox('Active'),
    ],
    rows: [
      { Question: 'How long does a KITAS take?', Answer: 'Typically 10-14 working days once documents are complete.', Department: 'visa', Active: true },
      { Question: 'Can a foreigner own a PT PMA outright?', Answer: 'Yes, subject to the Positive Investment List for the chosen business classification.', Department: 'company-setup', Active: true },
      { Question: 'Draft answer, not yet published', Answer: 'This row is inactive and must not be indexed.', Department: 'general', Active: false },
    ],
  },
  {
    // Columns are what the "Ilot - Log WA Message (sub)" workflow writes;
    // one row per logical WhatsApp conversation; the transcript column is a
    // rendered read model regenerated from the Messages table, never appended to.
    title: 'Conversations',
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
    rows: [
      {
        phone: '6281299990001',
        wa_profile_name: 'Sample Existing Lead',
        started_at: new Date().toISOString(),
        last_message_at: new Date().toISOString(),
        message_count: 0,
        transcript: '',
      },
    ],
  },
  {
    // Append-only source of truth for WhatsApp conversation history;
    // wa_message_id is the dedup key for retried Meta webhook deliveries.
    // Production carries a unique constraint on it that NocoDB's meta API
    // cannot create here, so duplicates are accepted locally where production
    // rejects them. Do not use this stack to prove dedup.
    title: 'Messages',
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
    rows: [],
  },
]

async function main() {
  const token = await authenticate()

  const { list: bases = [] } = await call('/api/v2/meta/bases', { token })
  let base = bases.find((b) => b.title === BASE_TITLE)
  if (base) {
    console.log(`base "${BASE_TITLE}" already exists (${base.id})`)
  } else {
    base = await call('/api/v2/meta/bases', {
      method: 'POST',
      token,
      body: { title: BASE_TITLE, type: 'database' },
    })
    console.log(`created base "${BASE_TITLE}" (${base.id})`)
  }

  const { list: existing = [] } = await call(`/api/v2/meta/bases/${base.id}/tables`, { token })
  const created = {}

  for (const spec of TABLES) {
    let table = existing.find((t) => t.title === spec.title)
    if (table) {
      console.log(`  table ${spec.title} already exists (${table.id}) — leaving as is`)
      created[spec.title] = table.id
      continue
    }

    table = await call(`/api/v2/meta/bases/${base.id}/tables`, {
      method: 'POST',
      token,
      body: { title: spec.title, table_name: spec.title, columns: spec.columns },
    })
    created[spec.title] = table.id
    console.log(`  created table ${spec.title} (${table.id})`)

    if (spec.rows.length > 0) {
      await call(`/api/v2/tables/${table.id}/records`, {
        method: 'POST',
        token,
        body: spec.rows,
      })
      console.log(`    inserted ${spec.rows.length} sample row(s)`)
    }
  }

  const apiToken = await call('/api/v1/tokens', {
    method: 'POST',
    token,
    body: { description: `ilot-dev ${new Date().toISOString()}` },
  })

  console.log(`
${'='.repeat(70)}
LOCAL IDs — for the n8n credential and for patching imported workflows.
Do not commit these. Do not write them into n8n-workflows/*.json.
${'='.repeat(70)}
  NocoDB URL       ${BASE_URL}
  login            ${EMAIL} / ${PASSWORD}
  base (projectId) ${base.id}
  API token        ${apiToken.token}

  Table IDs:`)
  for (const [name, id] of Object.entries(created)) {
    console.log(`    ${name.padEnd(16)} ${id}`)
  }
  console.log(`
  In n8n, create a "NocoDB API Token" credential with:
    Host   http://nocodb:8080
    Token  ${apiToken.token}
${'='.repeat(70)}`)
}

main().catch((err) => {
  console.error(`\nseed failed: ${err.message}`)
  process.exit(1)
})
