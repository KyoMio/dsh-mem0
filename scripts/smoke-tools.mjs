/**
 * Output-schema regression for the tool definitions (lib/tools.js).
 *
 * Guards the bug where the declared output schemas rejected rows the mem0
 * OSS server actually returns: `_serialize_memory` emits hash / attributed_to
 * / role / expiration_date and null metadata / run_id / agent_id, which a
 * strict `additionalProperties:false` schema turns into ToolOutputError
 * ("invalid output") for every list/search call.
 *
 * Validates realistic server payloads against each tool's output.schema using
 * the harness's own validator (devDependency, test-only import). Run with:
 * node scripts/smoke-tools.mjs
 */

import assert from 'node:assert/strict'
import { validateJsonSchemaValue } from '@deepseek-ai/dsh-tools'
import {
  mem0GetTool,
  mem0SearchTool,
  mem0HistoryTool,
  mem0AddTool,
  mem0StatusTool,
} from '../lib/tools.js'
import { Mem0Client } from '../lib/mem0-client.js'

/** No-op client: the output schemas are validated without executing. */
const client = {}
const config = () => ({})

/** Assert a value passes the tool's output schema (zero violations). */
function passes(tool, value, label) {
  const violations = validateJsonSchemaValue(tool.output.schema, value, '')
  assert.deepEqual(
    violations,
    [],
    `${label}: schema rejected a server-shaped payload: ${violations.join('; ')}`,
  )
}

// A row exactly as the OSS server serializes it (observed on the real build).
const FULL_ROW = {
  id: 'b3e1f2a4-0000-0000-0000-000000000001',
  memory: 'the user prefers tea over coffee',
  hash: 'a1b2c3d4e5f6g7h8',
  attributed_to: 'HeTony',
  role: 'user',
  user_id: 'HeTony',
  agent_id: null,
  run_id: null,
  metadata: null,
  created_at: '2026-08-01T10:00:00Z',
  updated_at: '2026-08-01T10:00:00Z',
  expiration_date: null,
}

// An older row: fewer fields, null identifiers.
const OLD_ROW = {
  id: 'c9d8e7f6-0000-0000-0000-000000000002',
  memory: 'legacy memory without ownership',
  hash: 'z9y8x7w6',
  user_id: null,
  agent_id: null,
  run_id: null,
  metadata: null,
}

// mem0_get (list mode): rows carry every extra field the server emits.
passes(mem0GetTool(client, config), {
  ok: true,
  count: 2,
  results: [FULL_ROW, OLD_ROW],
}, 'mem0_get list')

// mem0_get (single): the `memory` field is an open schema.
passes(mem0GetTool(client, config), {
  ok: true,
  memory: FULL_ROW,
}, 'mem0_get single')

// Observed on the real build: GET /memories/{id} always carries `score: null`,
// while GET /memories (list) omits the key entirely. Both must pass the schema
// AND survive the renderer — a render-time `.toFixed()` on null crashed
// mem0_get-by-id with "output.render failed: Cannot read properties of null".
const SCORED_ROW = {
  ...FULL_ROW,
  metadata: null,
  score: null,
  created_at: '2026-08-02T19:52:17.493099+08:00',
  updated_at: '2026-08-02T19:52:17.493099+08:00',
}

passes(mem0GetTool(client, config), {
  ok: true,
  memory: SCORED_ROW,
}, 'mem0_get single (score: null)')

passes(mem0GetTool(client, config), {
  ok: true,
  count: 1,
  results: [SCORED_ROW],
}, 'mem0_get list (score: null)')

/** Render a tool output and return the joined text (throws on a renderer bug). */
function renderText(tool, args, value) {
  const blocks = tool.output.render(args, value)
  return blocks.map((block) => block.text).join('')
}

const singleRow = SCORED_ROW
const getTool = mem0GetTool(client, config)
const singleText = renderText(getTool, { id: singleRow.id }, { ok: true, memory: singleRow })
assert.ok(
  singleText.includes(singleRow.memory) && !singleText.includes('score'),
  `mem0_get single render must show the memory and no score badge, got: ${singleText}`,
)
assert.ok(
  !renderText(getTool, {}, { ok: true, count: 1, results: [singleRow] }).includes('score'),
  'mem0_get list render must not print a score badge for a null score',
)

const searchTool = mem0SearchTool(client, config)
assert.ok(
  renderText(searchTool, { query: 'tea' }, { ok: true, count: 1, results: [{ ...FULL_ROW, score: 0.8123 }] })
    .includes('[score 0.812]'),
  'mem0_search render must still format a numeric score',
)

// mem0_search: results add a score and still carry the full row.
passes(mem0SearchTool(client, config), {
  ok: true,
  count: 1,
  results: [{ ...FULL_ROW, score: 0.8123 }],
}, 'mem0_search')

// mem0_history: entries include actor_id / role and nulls.
passes(mem0HistoryTool(client), {
  ok: true,
  id: 'b3e1f2a4-0000-0000-0000-000000000001',
  history: [
    {
      id: 'h1',
      memory_id: 'b3e1f2a4-0000-0000-0000-000000000001',
      old_memory: null,
      new_memory: 'the user prefers tea over coffee',
      event: 'ADD',
      created_at: '2026-08-01T10:00:00Z',
      updated_at: null,
      is_deleted: false,
      actor_id: null,
      role: null,
    },
  ],
}, 'mem0_history')

// mem0_add: the trimmed {id, memory} results still pass.
passes(mem0AddTool(client, config), {
  ok: true,
  created: 1,
  results: [{ id: 'new-id', memory: 'a fact' }],
}, 'mem0_add')

// mem0_status: the standard status shape passes.
passes(mem0StatusTool(client), {
  ok: true,
  reachable: true,
  authenticated: true,
  setupStatus: { needsSetup: false },
  authError: '',
  configure: { vector_store: 'pgvector' },
}, 'mem0_status')

console.log('smoke-tools: ok — output schemas accept real server payloads (extra fields, nulls, score)')
