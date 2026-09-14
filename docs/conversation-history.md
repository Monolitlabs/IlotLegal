# WhatsApp Conversation History

> **Last updated:** 14 September 2026
> **Status:** 🟡 Built, not yet deployed. The NocoDB tables do not exist in production
> and the workflow JSON still carries table-ID placeholders. See [Deploying](#deploying).

Every WhatsApp message in and out of the bot number is recorded, so an operator can
read what the AI is saying to customers, and so the conversations survive for later
quality review.

Before this, nothing did. `Simple Memory` in the inbound workflow held the last 15
turns in memory and lost them on every restart, and `Clients` rows were only written
after the AI had already captured a name and a service — so a conversation that never
got that far left no trace at all.

## The model

**`Messages` is the source of truth.** Append-only, one row per message, deduplicated
on `wa_message_id`.

**`Conversations.transcript` is a read model.** It is rendered from `Messages` and
rewritten in full after every message. Nothing is ever appended to it.

That distinction is the whole design. An appended transcript is a read-modify-write:
two messages landing together lose one of them, and the gap is permanent and silent.
A rendered transcript is idempotent — a lost or out-of-order update is corrected by
the next message.

Generated `.txt` files are not part of this. If a transcript needs to leave NocoDB,
render one from `Messages` at that moment.

### `Conversations`

| field | meaning |
|---|---|
| `phone` | the customer's number; the conversation identity |
| `wa_profile_name` | WhatsApp profile name at the time the conversation opened |
| `started_at`, `last_message_at` | ISO timestamps |
| `message_count` | rows in `Messages` for this conversation |
| `transcript` | rendered, human-readable, capped at the last 100 messages |
| `client_id` | the `Clients` row this conversation produced, once a lead is captured |
| `commitment_token` | mirrors the lead's token, for cross-lookup |

There is no `status` column. The newest row for a phone number is the current
conversation and `last_message_at` says whether it is still live. A stored status
would have to be written by a second update that can fail on its own, and a status
that lies is worse than one that does not exist.

### `Messages`

| field | meaning |
|---|---|
| `conversation_id` | the `Conversations` row |
| `wa_message_id` | Meta's `wamid`, the dedup key |
| `direction` | `in` or `out` |
| `actor` | `customer`, `ai`, `system`, `human_agent` |
| `msg_type` | `text`, `image`, `document`, … |
| `body` | for outbound, the exact string that was sent |
| `media_id` | Meta media id — the file itself is not downloaded |
| `wa_timestamp` | from the webhook payload, never the time n8n happened to run |
| `logged_at` | when the row was written |
| `raw` | the payload, capped at 8000 characters |

`direction` and `actor` are separate on purpose. Both the AI's reply and the
commitment-gate ask are outbound, but only one of them is the AI talking; telling
them apart is the difference between reviewing the bot's answers and reviewing the
bot's answers mixed with templated system text.

## Session boundary

A message continues the newest conversation for its phone number when that
conversation has been idle for less than `SESSION_IDLE_MINUTES` (default 1440),
defined at the top of the `Resolve Session` node.

It is an operational grouping boundary and nothing more: it decides where one
transcript ends and the next begins. Nothing outside that node reads it, no
downstream logic assumes a particular value, and changing it only changes how future
messages are grouped. It is not a business rule and must not be turned into one.

24 hours is the default because it lines up with Meta's customer-service window, so a
new transcript tends to start where the conversation actually restarts. That is a
convenience, not a dependency.

## How it is wired

`n8n-workflows/ilot-log-wa-message.json` — "Ilot - Log WA Message (sub)" — is the only
place that writes history. Every call site passes the same ten fields to it.

```
When Called -> Normalize Input -> Already Logged? -> New Message?
  |- already logged: stop
  |- new: Find Open Conversation -> Resolve Session -> Need New Conversation?
            |- yes: Create Conversation -\
            |- no:  (reuse the row)      -> Prepare Message Row -> Insert Message
                                            -> Fetch Session Messages
                                            -> Render Transcript
                                            -> Update Conversation
```

Call sites in `ilot-inbound-whatsapp.json`:

| node | actor | where the content comes from |
|---|---|---|
| `Log Inbound` | `customer` | the webhook payload |
| `Log Outbound (reply)` | `ai` | the `Send message` response and the same expression the send used |
| `Log Outbound (commitment)` | `system` | the `Send commitment ask` response and `Generate Case Token` |

`Log Inbound` hangs off `Has Message?` as a **parallel** branch, not in line before
the AI Agent. In line it would replace `$json` and break both the AI Agent's
`{{ $json.messages[0].text.body }}` and Simple Memory's session key.

The outbound loggers run on the WhatsApp node's response, so `wa_message_id` is the
`wamid` Meta actually returned and `body` is the text actually put on the wire rather
than a reconstruction of it. Meta returns no timestamp on send, so the send time is
used.

`Find Conversation for Lead` → `Link Conversation to Lead` runs as a second branch off
`Create lead in NocoDB`, writing `client_id` and `commitment_token` onto the
conversation. It is a branch so that a failure there can never delay or block the
commitment ask.

Every logging node is `onError: continueRegularOutput`. Recording the conversation
must never be able to break the conversation.

## Two traps this cost us

Both were found only by looking at live rows, not by reading the workflow.

**A boolean tested as a string.** `Need New Conversation?` read
`needs_new_conversation` with the string operator "is not empty". `false` is the
non-empty text `"false"`, so every message took the create branch and opened its own
conversation. The operator must be boolean / is-true. `Lead Captured ?` in the
inbound workflow had it right all along.

**The NocoDB node's `sort` option is not applied.** `Find Open Conversation` asked
for `sort: -Id` with `limit: 1` and got back the OLDEST conversation for the number,
which pinned every message to the first conversation ever opened - and would have
opened a fresh one on every message once that row passed the idle window. The node
now returns every conversation for the phone number and `Resolve Session` picks the
newest in code. Do not reintroduce a sort here, and treat `sort` as unreliable in
any other NocoDB node in this project.

## Deduplication

Meta re-delivers a webhook when n8n is slow to answer 200. `Already Logged?` looks up
`wa_message_id` before inserting, following the `processed_emails` pattern in the
Commitment Gate.

That is a check-then-write, and two deliveries arriving together can both pass it. A
unique constraint on `Messages.wa_message_id` would close the window.

**It cannot be added on this instance.** Toggling "Unique values only" in the NocoDB
field editor (verified 14 September 2026, NocoDB 2026.04.5, Free Plan) answers:
"Enterprise Feature - Enter your license key to use unique constraint." The remaining
routes are a unique index applied directly to the database behind NocoDB, or a licence.

This also puts a question mark over `processed_emails.message_id`, which
`docs/commitment-gate-flow.md` describes as carrying a unique constraint. That claim
predates this finding and has not been re-verified against the live database.

Until one of those routes is taken, dedup rests on the lookup alone. The exposure is
small and bounded: Meta's retries arrive seconds apart, and because the transcript is
regenerated rather than appended, the worst case is one repeated line, not a corrupted
record.

## Deploying

1. `NOCODB_TOKEN=... node scripts/create-conversation-tables.mjs` — dry run, prints
   the columns it would create.
2. Re-run with `--commit`. It creates the tables and writes the real table IDs into
   the two workflow JSON files in place of `__CONVERSATIONS_TABLE_ID__` and
   `__MESSAGES_TABLE_ID__`.
3. Unique constraint on `Messages.wa_message_id` - blocked, see Deduplication above.
4. Import both workflows into n8n, then publish with
   `POST /rest/workflows/<id>/activate` and read back `activeVersion` to confirm —
   never the top-level draft `nodes` (`scripts/dev/README.md`).

The local stack seeds both tables already: `node scripts/dev/seed-nocodb.mjs`.

## What this does not cover

- **Chat after handoff.** Once the PIC takes over on the company admin number those
  messages never touch the Cloud API and cannot be recorded. The transcript ends at
  handoff. A Cloud API number cannot also be used in the WhatsApp Business app
  (`docs/archive/chatwoot-evaluation.md`).
- **Media files.** Only `media_id` is stored. Meta's media URLs expire, so an
  attachment will not be retrievable from the record later.
- **Two other outbound points.** `WhatsApp: Resend Please` in the Commitment Gate and
  `Confirm to Customer` in Assign Agent are not logged yet; both are small additions
  of the same `Log Outbound` node, pointing at the same sub-workflow.
- **AI memory.** `Simple Memory` is untouched and still volatile. This feature gives
  visibility into what the AI said, not a longer memory for it.
