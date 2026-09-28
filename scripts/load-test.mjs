/**
 * Load test: run the plugin's apply() against a minimal mock host context
 * and verify the expected tools + prompt section are registered without
 * throwing, and that a loader/volatile-update (a Plugins-page config edit)
 * re-syncs the registrations. No network and no real cordis runtime needed.
 */
import { apply } from '../lib/index.js'

const registeredTools = []
const sections = []
const listeners = []
let effectsActive = 0

const ctx = {
  fiber: { state: 'active' },
  effect: (fn, label) => {
    const disposer = fn()
    effectsActive += 1
    return () => { if (typeof disposer === 'function') disposer(); effectsActive -= 1 }
  },
  on: (event, handler) => {
    listeners.push([event, handler])
    return () => { const i = listeners.lastIndexOf([event, handler]); if (i >= 0) listeners.splice(i, 1) }
  },
  systemPrompt: {
    section: (spec) => {
      sections.push(spec)
      return () => { const i = sections.lastIndexOf(spec); if (i >= 0) sections.splice(i, 1) }
    },
  },
  tools: {
    register: (tool) => {
      registeredTools.push(tool.name)
      return () => { const i = registeredTools.lastIndexOf(tool.name); if (i >= 0) registeredTools.splice(i, 1) }
    },
  },
}

/** A hand-built volatile config: plain { get } references the Loader hands apply(). */
const stored = {
  baseUrl: 'http://x',
  apiKey: '',
  authType: 'apiKey',
  defaultUserId: 'Tony',
  defaultAgentId: 'dsh-agent',
  timeoutMs: 1000,
  announceToAgent: true,
  enabled: true,
}
const config = Object.fromEntries(
  Object.entries(stored).map(([field, value]) => [field, { get: () => stored[field] ?? value }]),
)

apply(ctx, config)

const expected = ['mem0_add', 'mem0_search', 'mem0_get', 'mem0_update', 'mem0_delete', 'mem0_history', 'mem0_reset', 'mem0_status']
const missing = expected.filter((n) => !registeredTools.includes(n))
console.log('registered tools:', registeredTools.join(', '))
console.log('prompt sections:', sections.map((s) => `${s.name}@${s.order}`).join(', '))
console.log('listeners:', listeners.map(([event]) => event).join(', '))
console.log('effects active:', effectsActive)
if (missing.length > 0) { console.error('MISSING:', missing.join(', ')); process.exit(1) }
if (sections.length !== 1 || sections[0].name !== 'plugin:dsh-mem0') { console.error('section mismatch'); process.exit(1) }
if (listeners.length !== 1 || listeners[0][0] !== 'loader/volatile-update') { console.error('volatile-update listener missing'); process.exit(1) }

// A volatile update re-syncs: enabled=false withdraws tools + announcement.
stored.enabled = false
listeners[0][1]()
if (registeredTools.length !== 0 || sections.length !== 0) {
  console.error('disable did not withdraw tools/section:', registeredTools, sections)
  process.exit(1)
}

// And announceToAgent=false re-syncs to tools without the announcement.
stored.enabled = true
stored.announceToAgent = false
listeners[0][1]()
if (registeredTools.join(',') !== expected.join(',') || sections.length !== 0) {
  console.error('re-sync without announcement mismatch:', registeredTools, sections)
  process.exit(1)
}

console.log('OK: all 8 tools + announcement section registered, volatile updates re-sync')
