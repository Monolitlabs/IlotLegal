import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import path from 'node:path'

/**
 * The conversation logger lives in n8n Code nodes, so there is no module to
 * import. These tests read the published workflow JSON and run the node bodies
 * against a fake n8n context. That keeps the JSON itself under test: an edit
 * made in the n8n UI and exported back here cannot silently change the session
 * rule or the transcript ordering without failing a test.
 */

const WORKFLOW = path.resolve(__dirname, '../n8n-workflows/ilot-log-wa-message.json')

type Item = { json: Record<string, unknown> }

const nodeSource: Record<string, string> = Object.fromEntries(
  (JSON.parse(readFileSync(WORKFLOW, 'utf8')).nodes as Array<Record<string, any>>)
    .filter((n) => n.parameters?.jsCode)
    .map((n) => [n.name as string, n.parameters.jsCode as string]),
)

function runNode(name: string, items: Item[], reachBack: Record<string, unknown> = {}): Item[] {
  const $input = { first: () => items[0], all: () => items }
  const $ = (target: string) => {
    if (!(target in reachBack)) throw new Error(`unexpected reach-back to ${target}`)
    return { first: () => ({ json: reachBack[target] }), item: { json: reachBack[target] } }
  }
  return new Function('$input', '$', nodeSource[name])($input, $) as Item[]
}

const minutesAgo = (mins: number) => new Date(Date.now() - mins * 60_000).toISOString()

describe('Normalize Input', () => {
  it('strips formatting from the phone number', () => {
    const out = runNode('Normalize Input', [{ json: { phone: '+62 819-9480-0946' } }])[0].json
    expect(out.phone).toBe('6281994800946')
  })

  it('converts the Meta second-granular timestamp to ISO', () => {
    const out = runNode('Normalize Input', [{ json: { wa_timestamp: '1757836920' } }])[0].json
    expect(out.wa_timestamp).toBe(new Date(1757836920 * 1000).toISOString())
  })

  it('defaults the actor from the direction', () => {
    expect(runNode('Normalize Input', [{ json: { direction: 'in' } }])[0].json.actor).toBe('customer')
    expect(runNode('Normalize Input', [{ json: { direction: 'out' } }])[0].json.actor).toBe('ai')
  })

  it('synthesises a dedup key when Meta never acknowledged the send', () => {
    // An empty key would collide with every other unacknowledged message and the
    // dedup lookup would start discarding real ones.
    const out = runNode('Normalize Input', [{ json: { direction: 'out', wa_message_id: '  ' } }])[0].json
    expect(out.wa_message_id).toMatch(/^unacked-out-\d+-[a-z0-9]+$/)
  })

  it('serialises raw payloads and caps their size', () => {
    const out = runNode('Normalize Input', [{ json: { raw: { a: 'x'.repeat(20_000) } } }])[0].json
    expect(typeof out.raw).toBe('string')
    expect((out.raw as string).endsWith('...[truncated]')).toBe(true)
  })
})

describe('Resolve Session', () => {
  const message = { phone: '6281994800946', wa_profile_name: 'Budi', wa_timestamp: new Date().toISOString() }
  const resolve = (...existing: Array<Record<string, unknown>>) =>
    runNode('Resolve Session', existing.map((json) => ({ json })), { 'Normalize Input': message })[0].json

  it('opens a conversation when the phone number has none', () => {
    expect(resolve({}).needs_new_conversation).toBe(true)
  })

  it('reuses a conversation that is still inside the idle window', () => {
    const out = resolve({ Id: 7, last_message_at: minutesAgo(10) })
    expect(out.needs_new_conversation).toBe(false)
    expect(out.Id).toBe(7)
  })

  it('reuses right up to the boundary and opens a new one past it', () => {
    expect(resolve({ Id: 7, last_message_at: minutesAgo(24 * 60 - 1) }).needs_new_conversation).toBe(false)
    expect(resolve({ Id: 7, last_message_at: minutesAgo(24 * 60 + 1) }).needs_new_conversation).toBe(true)
  })

  it('picks the newest conversation, not the first row returned', () => {
    // The NocoDB node's sort option is not applied, so the rows arrive in whatever
    // order the table gives. Taking the first one pins every message to the oldest
    // conversation for that phone number.
    const out = resolve(
      { Id: 1, last_message_at: minutesAgo(600) },
      { Id: 7, last_message_at: minutesAgo(5) },
      { Id: 3, last_message_at: minutesAgo(120) },
    )
    expect(out.needs_new_conversation).toBe(false)
    expect(out.Id).toBe(7)
  })

  it('judges staleness by the newest conversation alone', () => {
    // An ancient first conversation must not drag a live one into a new session.
    const out = resolve({ Id: 1, last_message_at: minutesAgo(60 * 24 * 30) }, { Id: 9, last_message_at: minutesAgo(2) })
    expect(out.needs_new_conversation).toBe(false)
    expect(out.Id).toBe(9)
  })

  it('opens a new conversation when the timestamp cannot be parsed', () => {
    expect(resolve({ Id: 7, last_message_at: 'not-a-date' }).needs_new_conversation).toBe(true)
  })
})

describe('Prepare Message Row', () => {
  const message = { phone: '6281994800946', wa_message_id: 'wamid.A' }

  it('carries the resolved conversation id onto the message', () => {
    const out = runNode('Prepare Message Row', [{ json: { Id: 42 } }], { 'Normalize Input': message })[0].json
    expect(out.conversation_id).toBe('42')
  })

  it('refuses to write a message that belongs to no conversation', () => {
    expect(() => runNode('Prepare Message Row', [{ json: {} }], { 'Normalize Input': message })).toThrow(
      /orphan message row/,
    )
  })
})

describe('Render Transcript', () => {
  const prepared = { conversation_id: '42', wa_timestamp: '2026-09-14T10:04:00.000Z' }
  const render = (rows: Array<Record<string, unknown>>) =>
    runNode('Render Transcript', rows.map((json) => ({ json })), { 'Prepare Message Row': prepared })[0].json

  const conversation = [
    { Id: 2, wa_message_id: 'w2', actor: 'ai', body: 'Investor or employee?', msg_type: 'text', wa_timestamp: '2026-09-14T10:02:00.000Z' },
    { Id: 1, wa_message_id: 'w1', actor: 'customer', body: 'Hi, I need a KITAS', msg_type: 'text', wa_timestamp: '2026-09-14T10:02:00.000Z' },
    { Id: 3, wa_message_id: 'w3', actor: 'customer', body: '', msg_type: 'image', media_id: 'media-99', wa_timestamp: '2026-09-14T10:04:00.000Z' },
  ]

  it('orders same-second messages by insertion id, not by arrival', () => {
    // Meta timestamps are second-granular, so a reply routinely shares a second
    // with the message it answers. Without the Id tiebreak the bot appears to
    // answer before the customer asked.
    const lines = (render(conversation).transcript as string).split('\n')
    expect(lines[0]).toContain('Client: Hi, I need a KITAS')
    expect(lines[1]).toContain('Bot   : Investor or employee?')
  })

  it('renders a media message as a placeholder rather than a blank line', () => {
    expect(render(conversation).transcript).toContain('<image media-99>')
  })

  it('reports the count and newest timestamp of the whole conversation', () => {
    const out = render(conversation)
    expect(out.message_count).toBe(3)
    expect(out.last_message_at).toBe('2026-09-14T10:04:00.000Z')
  })

  it('ignores rows that carry no message', () => {
    expect(render([...conversation, {}]).message_count).toBe(3)
  })

  it('keeps the newest messages when a conversation outgrows the transcript', () => {
    const many = Array.from({ length: 130 }, (_, i) => ({
      Id: i + 1,
      wa_message_id: `w${i}`,
      actor: i % 2 ? 'ai' : 'customer',
      body: `line ${i}`,
      msg_type: 'text',
      wa_timestamp: new Date(Date.parse('2026-09-14T10:00:00Z') + i * 60_000).toISOString(),
    }))
    const out = render(many)
    expect(out.transcript).toMatch(/^\[\.\.\. 30 earlier messages omitted/)
    expect(out.transcript).toContain('line 129')
    expect(out.transcript).not.toContain('line 5:')
    expect(out.message_count).toBe(130)
  })
})

describe('workflow wiring', () => {
  const workflow = JSON.parse(readFileSync(WORKFLOW, 'utf8'))
  const inbound = JSON.parse(
    readFileSync(path.resolve(__dirname, '../n8n-workflows/ilot-inbound-whatsapp.json'), 'utf8'),
  )

  it('fetches every conversation for the phone rather than sorting and taking one', () => {
    // sort + limit 1 hands back the OLDEST row, because the node's sort option is
    // not applied. Resolve Session picks the newest from the full set instead.
    const node = workflow.nodes.find((n: any) => n.name === 'Find Open Conversation')
    expect(node.parameters.returnAll).toBe(true)
    expect(node.parameters.limit).toBeUndefined()
    expect(node.parameters.options.sort).toBeUndefined()
  })

  it('keeps alwaysOutputData on the lookups whose empty result must still flow', () => {
    // Without it a NocoDB lookup that finds nothing emits zero items, the IF
    // after it never runs, and the branch dies instead of taking the "new" path.
    for (const name of ['Already Logged?', 'Find Open Conversation']) {
      const node = workflow.nodes.find((n: any) => n.name === name)
      expect(node.alwaysOutputData, name).toBe(true)
    }
  })

  it('branches on the session decision with a boolean test, not a string one', () => {
    // needs_new_conversation is a boolean. A string "notEmpty" test reads false as
    // the non-empty text "false", so every message takes the create branch and each
    // one opens its own conversation. That shipped once; this is the guard.
    const node = workflow.nodes.find((n: any) => n.name === 'Need New Conversation?')
    const condition = node.parameters.conditions.conditions[0]
    expect(condition.leftValue).toContain('needs_new_conversation')
    expect(condition.operator.type).toBe('boolean')
    expect(condition.operator.operation).toBe('true')
  })

  it('routes the reuse branch into Prepare Message Row and the new branch into Create Conversation', () => {
    const main = workflow.connections['Need New Conversation?'].main
    expect(main[0].map((c: any) => c.node)).toEqual(['Create Conversation'])
    expect(main[1].map((c: any) => c.node)).toEqual(['Prepare Message Row'])
  })

  it('calls the logger with a resource locator, not a bare workflow id', () => {
    // A bare string is the live defect in docs/human-agent-handoff.md: every run
    // dies with "No information about the workflow to execute found".
    const callers = inbound.nodes.filter((n: any) => n.type === 'n8n-nodes-base.executeWorkflow')
    expect(callers.length).toBeGreaterThan(0)
    for (const node of callers) {
      expect(typeof node.parameters.workflowId, node.name).toBe('object')
      expect(node.parameters.workflowId.value).toBe(workflow.id)
    }
  })

  it('never lets a logging failure break the customer conversation', () => {
    const logging = inbound.nodes.filter((n: any) => /^(Log |Find Conversation for Lead|Link Conversation)/.test(n.name))
    expect(logging.length).toBe(5)
    for (const node of logging) expect(node.onError, node.name).toBe('continueRegularOutput')
  })

  it('logs inbound on a branch parallel to the AI Agent', () => {
    // In line, the logging node would replace $json and break both the AI Agent's
    // {{ $json.messages[0].text.body }} and Simple Memory's session key.
    const targets = inbound.connections['Has Message?'].main[0].map((c: any) => c.node)
    expect(targets).toContain('AI Agent')
    expect(targets).toContain('Log Inbound')
  })
})
