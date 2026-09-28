/**
 * Smoke test for the dsh-mem0 browser half (client/client.cjs).
 *
 * Loads the bundle the way the dsh client module loader does — a Node VM with
 * a stub window.__ModuleLoader__ — then drives the row-config page against an
 * in-memory fake of the shared configForms service (the describe mirror with
 * its secrets sidecar, and one ConfigForm over the fake document) and the
 * apply() slot registration against a stub client context. The staged form
 * model is a faithful port of ui-primitives' SettingsFormModel (the shipped
 * bundle imports the real one from the browser module table, which a Node VM
 * cannot load); the components are stubs. This is NOT a browser test: it
 * proves the bundle parses, registers under plugins.row.config, and that the
 * form stages/validates/writes without the GUI. Run with: node scripts/smoke-client.mjs
 */

import { readFileSync } from 'node:fs'
import vm from 'node:vm'
import assert from 'node:assert/strict'

const code = readFileSync(new URL('../client/client.cjs', import.meta.url), 'utf8')

let handoff
const sandbox = {
  window: { __ModuleLoader__: { load: (h) => { handoff = h } } },
  console,
}
vm.createContext(sandbox)
vm.runInContext(code, sandbox)
assert.ok(handoff, 'bundle must call window.__ModuleLoader__.load')
assert.equal(handoff.id, 'dsh-mem0', 'bundle id must be the package name')

/** Minimal observable store matching createSnapshotStore's contract. */
function snapshotStore(init) {
  let state = init
  const listeners = new Set()
  return {
    getSnapshot: () => state,
    subscribe: (fn) => { listeners.add(fn); return () => listeners.delete(fn) },
    set: (next) => { state = next; for (const fn of listeners) fn() },
  }
}

// ------------------------------------------------------ fake ui-primitives
// Port of the staged form model the shipped bundle imports from the browser
// module table (packages/client/ui-primitives/src/settings-form/form-model.ts
// at dsh 0.1.7): same specs, same plan/save semantics, only store plumbing
// swapped for the local snapshotStore.

function settingsNumberField(field) {
  return {
    field,
    format: (value) => (typeof value === 'number' ? String(value) : ''),
    parse: (text) => {
      const trimmed = text.trim()
      if (trimmed === '') return { kind: 'clear' }
      const parsed = Number(trimmed)
      return Number.isFinite(parsed) ? { kind: 'set', value: parsed } : undefined
    },
  }
}

function settingsTextField(field) {
  return {
    field,
    format: (value) => (typeof value === 'string' ? value : ''),
    parse: (text) => {
      const trimmed = text.trim()
      return trimmed === '' ? { kind: 'clear' } : { kind: 'set', value: trimmed }
    },
  }
}

class SettingsFormModel {
  constructor(scope, specs, secrets = []) {
    this.scope = scope
    this.specs = new Map(specs.map((spec) => [spec.field, spec]))
    this.secretSpecs = new Map(secrets.map((spec) => [spec.field, spec]))
    this.staged = new Map()
    this.listeners = new Set()
    this.baseline = undefined
    this.saving = false
    this.failed = false
    this.unsubscribe = scope.subscribe(() => this.publish())
  }

  bind(project) {
    const store = snapshotStore(project())
    this.listeners.add(() => { store.set(project()) })
    return store
  }

  shell() {
    const snapshot = this.scope.getSnapshot()
    const plan = this.plan()
    return {
      available: snapshot.status === 'ready',
      writable: snapshot.writable,
      dirty: plan.length > 0,
      invalid: plan.some((item) => item.run === undefined && item.op === undefined),
      saving: this.saving,
      failed: this.failed,
    }
  }

  field(field) {
    const staged = this.staged.get(field)
    if (this.secretSpecs.has(field)) return { text: staged?.text ?? '', overridden: false, invalid: false }
    const spec = this.spec(field)
    if (staged === undefined) {
      return { text: spec.format(this.sectionValue(field)), overridden: this.stored(field), invalid: false }
    }
    const write = staged.clear ? { kind: 'clear' } : spec.parse(staged.text)
    return { text: staged.text, overridden: write?.kind === 'set', invalid: write === undefined }
  }

  actions() {
    return {
      edit: (field, text) => { this.stage(field, { text, clear: false }) },
      resetField: (field) => { this.stage(field, { text: this.spec(field).format(this.baseValue(field)), clear: true }) },
      save: () => { void this.save() },
      discard: () => {
        if (this.staged.size === 0 && !this.failed) return
        this.staged.clear()
        this.baseline = undefined
        this.failed = false
        this.publish()
      },
    }
  }

  async save() {
    const plan = this.plan()
    if (!plan.length || this.saving || !this.scope.getSnapshot().writable
      || plan.some((item) => item.run === undefined && item.op === undefined)) return
    this.saving = true
    this.failed = false
    this.publish()
    try {
      const ops = plan.flatMap((item) => (item.op === undefined ? [] : [item.op]))
      let landed = !ops.length || await this.scope.mutate(ops, this.baseline?.revision)
      if (!landed) { this.failed = true; return }
      for (const item of plan) if (item.run) landed = await item.run() && landed
      if (landed) { this.staged.clear(); this.baseline = undefined }
      this.failed = !landed
    } catch {
      this.failed = true
    } finally {
      this.saving = false
      this.publish()
    }
  }

  dispose() { this.unsubscribe(); this.listeners.clear() }

  plan() {
    const plan = []
    for (const [field, staged] of this.staged) {
      const secret = this.secretSpecs.get(field)
      if (secret !== undefined) {
        const value = staged.text.trim()
        if (value !== '') plan.push({ field, run: () => secret.write(value) })
        continue
      }
      const spec = this.spec(field)
      if (staged.clear) {
        if (this.stored(field)) plan.push({ field, op: { op: 'unset', path: [field] } })
        continue
      }
      if (staged.text === spec.format(this.sectionValue(field))) continue
      const write = spec.parse(staged.text)
      if (write === undefined) plan.push({ field })
      else if (write.kind === 'clear') plan.push({ field, op: { op: 'unset', path: [field] } })
      else plan.push({ field, op: { op: 'set', path: [field], value: write.value } })
    }
    return plan
  }

  stage(field, edit) {
    this.baseline ??= this.scope.getSnapshot()
    this.staged.set(field, edit)
    this.failed = false
    this.publish()
  }

  spec(field) {
    const spec = this.specs.get(field)
    if (spec === undefined) throw new Error(`plugin card has no field ${field}`)
    return spec
  }

  snapshotOf() { return this.scope.getSnapshot() }

  sectionValue(field) { return (this.snapshotOf().value)?.[field] }

  baseValue(field) { return (this.snapshotOf().base)?.[field] }

  userLayer() { return this.snapshotOf().user }

  stored(field) {
    const user = this.userLayer()
    return user !== undefined && Object.hasOwn(user, field)
  }

  publish() { for (const listener of this.listeners) listener() }
}

/** Stub React: captures the element tree without rendering (elements are [type, props, ...children] arrays). */
const h = (...args) => args
const reactStub = { createElement: h, useState: (v) => [v, () => {}], Fragment: 'Fragment' }

/** Stub shared components: identities to assert on in the captured tree. */
const stubs = {
  SettingsForm: (props, ...children) => ['SettingsForm', props, ...children],
  SettingsValueField: (props, ...children) => ['SettingsValueField', props, ...children],
  SettingsSecretField: (props, ...children) => ['SettingsSecretField', props, ...children],
}

const factoryExports = handoff.factory((spec) => {
  switch (spec) {
    case 'react':
      return reactStub
    case '@deepseek-ai/dsh-client-ui-primitives':
      return {
        SettingsForm: stubs.SettingsForm,
        SettingsValueField: stubs.SettingsValueField,
        SettingsSecretField: stubs.SettingsSecretField,
        SettingsFormModel,
        settingsNumberField,
        settingsTextField,
      }
    default:
      throw new Error(`smoke: unexpected require "${spec}"`)
  }
})

assert.equal(typeof factoryExports.apply, 'function', 'bundle must export apply')
assert.deepEqual([...factoryExports.inject], ['slots', 'locale', 'configForms'])

// ---------------------------------------------------- fake configForms service

const NS = 'dsh-mem0'
const DEFAULTS = {
  baseUrl: 'http://127.0.0.1:8888',
  authType: 'apiKey',
  defaultUserId: 'HeTony',
  defaultAgentId: 'dsh-agent',
  timeoutMs: 15000,
  announceToAgent: true,
  enabled: true,
}

/**
 * In-memory settings document for the `dsh-mem0` entry: a raw user section
 * resolved over the schema defaults, REDACTED the way the Host's describe
 * view redacts it (apiKey removed; a secrets sidecar carries the configured
 * flag), plus the whileServed follow the real service implements.
 */
function fakeConfigForms() {
  let user = {}
  let revision = 0
  let serving = true
  const writes = []

  const redact = (section) => {
    const clone = { ...(section ?? {}) }
    delete clone.apiKey
    return clone
  }
  const resolved = () => ({ ...DEFAULTS, ...user })
  const scopeSnapshot = () => ({
    status: serving ? 'ready' : 'unavailable',
    value: serving ? redact(resolved()) : undefined,
    base: redact(DEFAULTS),
    user: redact(user),
    revision,
    writable: true,
    mode: 'host',
  })
  const mirrorView = () => ({
    namespaces: serving
      ? [{
          ns: NS,
          autoGenerate: true,
          schema: {},
          value: redact(resolved()),
          base: redact(DEFAULTS),
          user: redact(user),
          applies: 'live',
          secrets: [{ path: ['apiKey'], set: user.apiKey !== undefined }],
          revision,
        }]
      : [],
    writable: true,
    hasDocument: true,
  })

  const scopeStore = snapshotStore(scopeSnapshot())
  const mirrorStore = snapshotStore({ status: 'ready', view: mirrorView(), error: null })
  const rederive = () => { scopeStore.set(scopeSnapshot()); mirrorStore.set({ status: 'ready', view: mirrorView(), error: null }) }

  const applyOp = (op) => {
    writes.push(op)
    if (op.op === 'set') user = { ...user, [op.path[0]]: op.value }
    else {
      const next = { ...user }
      delete next[op.path[0]]
      user = next
    }
    revision += 1
    rederive()
  }

  const form = {
    getSnapshot: () => scopeStore.getSnapshot(),
    subscribe: (fn) => scopeStore.subscribe(fn),
    async set(field, value) { applyOp({ op: 'set', path: [field], value }); return true },
    async unset(field) { applyOp({ op: 'unset', path: [field] }); return true },
    async mutate(ops, _expectedRevision) { for (const op of ops) applyOp(op); return true },
  }

  const mirror = {
    getSnapshot: () => mirrorStore.getSnapshot(),
    subscribe: (fn) => mirrorStore.subscribe(fn),
    ensure: async () => {},
    acceptView: () => {},
  }

  /** whileServed: register once the namespace is served, withdraw when it is not. */
  const whileServed = (namespaces, register) => {
    let off
    const sync = () => {
      const served = mirror.getSnapshot().view.namespaces.some((row) => namespaces.includes(row.ns))
      if (served && off === undefined) off = register(new Set([NS]))
      else if (!served && off !== undefined) { off(); off = undefined }
    }
    const unsubscribe = mirror.subscribe(sync)
    sync()
    return () => { unsubscribe(); off?.(); off = undefined }
  }

  return {
    writes,
    form,
    mirror,
    stopServing: () => { serving = false; rederive() },
    get: (id) => { assert.equal(id, NS, 'configForms.get must address the dsh-mem0 entry'); return form },
    describe: () => mirror,
    whileServed,
  }
}

// ---------------------------------------------------------------- apply path

const configForms = fakeConfigForms()
const localeRegs = []
const slotInjects = []
const slotRegs = []
const stubCtx = {
  effect: (fn) => { const dispose = fn(); return () => dispose?.() },
  locale: {
    register: (ns, dicts) => { localeRegs.push([ns, dicts]); return () => {} },
  },
  configForms,
  slots: {
    inject: (key, factory) => {
      const dispose = factory()
      slotInjects.push(key)
      return () => { const i = slotInjects.lastIndexOf(key); if (i >= 0) slotInjects.splice(i, 1) }
    },
    register: (options, component) => { slotRegs.push([options, component]); return () => {} },
  },
}
factoryExports.apply(stubCtx)

assert.deepEqual(localeRegs.map(([ns]) => ns), ['dsh-mem0'], 'locale dictionaries registered')
assert.equal(slotRegs.length, 1, 'one row-config page registered')
const [pageOptions, PageComponent] = slotRegs[0]
assert.equal(pageOptions.name, 'plugins.row.config')
assert.equal(pageOptions.key, 'dsh-mem0#dsh-mem0', 'keyed by <package name>#<row id>')
assert.equal(pageOptions.locale, 'dsh-mem0')
assert.equal(typeof pageOptions.inject, 'function')
assert.equal(typeof PageComponent, 'function')

// ---------------------------------------------------------------- form model

const rawFace = pageOptions.inject()
const face = { ...rawFace }
for (const [name, source] of Object.entries(rawFace.hooks)) {
  const hookName = `use${name[0].toUpperCase()}${name.slice(1)}`
  face[hookName] = (selector) => selector(source.getSnapshot())
}
delete face.hooks

const state0 = face.useMem0Config((s) => s)
assert.equal(state0.available, true, 'form reports ready from the shared form')
assert.equal(state0.writable, true)
assert.equal(state0.dirty, false)
assert.equal(state0.baseUrl.text, 'http://127.0.0.1:8888')
assert.equal(state0.authType.text, 'apiKey')
assert.equal(state0.timeoutMs.text, '15000')
assert.equal(state0.announceToAgent.text, 'true')
assert.equal(state0.enabled.text, 'true')
assert.equal(state0.apiKey.text, '', 'secret draft starts blank')
assert.equal(state0.apiKey.configured, false, 'absent apiKey reports unconfigured')

// Stage an edit and verify the draft + override mark.
face.edit('baseUrl', 'http://192.0.2.1:59888')
const state1 = face.useMem0Config((s) => s)
assert.equal(state1.dirty, true)
assert.equal(state1.baseUrl.text, 'http://192.0.2.1:59888')
assert.equal(state1.baseUrl.overridden, true)

// Typing the same value back is not dirty and shows no override badge.
face.edit('baseUrl', 'http://127.0.0.1:8888')
assert.equal(face.useMem0Config((s) => s).dirty, false, 'same value is not an edit')
face.discard()

// Invalid number blocks the save.
face.edit('timeoutMs', 'abc')
assert.equal(face.useMem0Config((s) => s).invalid, true)
assert.equal(configForms.writes.length, 0, 'no writes before a valid save')

// Fix the number, toggle a boolean (staged as draft text), set the secret; save.
face.edit('timeoutMs', '30000')
face.edit('announceToAgent', 'false')
face.edit('apiKey', 'm0sk_smoke')
await face.save()
await new Promise((resolve) => setTimeout(resolve, 10))
const state3 = face.useMem0Config((s) => s)
assert.equal(state3.dirty, false, 'staged edits cleared after a landed save')
assert.deepEqual(
  configForms.writes,
  [
    { op: 'set', path: ['timeoutMs'], value: 30000 },
    { op: 'set', path: ['announceToAgent'], value: false },
    { op: 'set', path: ['apiKey'], value: 'm0sk_smoke' },
  ],
  'save writes the staged ops (in staging order) then the secret',
)
assert.equal(state3.apiKey.configured, true, 'saved key reports configured')
assert.equal(state3.timeoutMs.text, '30000', 'read-back reflects the save')

// A blank secret draft writes nothing.
face.edit('apiKey', '   ')
await face.save()
assert.equal(configForms.writes.length, 3, 'blank secret staged no write')

// Reset-to-default unsets the override. The shared model's badge previews the
// save, so a staged clear carries no "overridden" mark (it would REMOVE the
// user-layer entry); the save itself lands as an unset.
face.resetField('timeoutMs')
const state4 = face.useMem0Config((s) => s)
assert.equal(state4.timeoutMs.text, '15000', 'reset shows the composition default')
assert.equal(state4.timeoutMs.overridden, false, 'a staged clear previews the removal, not an override')
await face.save()
await new Promise((resolve) => setTimeout(resolve, 10))
assert.deepEqual(configForms.writes.at(-1), { op: 'unset', path: ['timeoutMs'] }, 'reset lands as an unset')
assert.equal(face.useMem0Config((s) => s).timeoutMs.text, '15000', 'cleared field reads the default')

// Discard drops drafts without writing.
face.edit('baseUrl', 'http://example.com')
assert.equal(face.useMem0Config((s) => s).dirty, true)
face.discard()
assert.equal(face.useMem0Config((s) => s).dirty, false)
assert.equal(configForms.writes.at(-1).op, 'unset', 'discard performed no write')

// A boolean draft equal to the current value is not an edit.
face.edit('enabled', 'true')
assert.equal(face.useMem0Config((s) => s).dirty, false, 'toggling to the current value is not an edit')

// ------------------------------------------------------------------- render

// Render the page body once to catch component-shape errors (stub React
// captures the element tree as [type, props, ...children] arrays).
const rendered = PageComponent({ t: (key) => key, view: 'page', ...face })
assert.ok(rendered !== null && rendered !== undefined, 'page component renders')
assert.equal(rendered[0], stubs.SettingsForm, 'page renders through the shared SettingsForm chrome')
assert.equal(rendered[1].state.available, true)
assert.equal(rendered[1].labels.save, 'save')
assert.equal(rendered.length - 2, 8, 'eight fields inside the form')

/** Whether the captured tree carries an element matching predicate(type, props). */
function treeHas(node, predicate) {
  if (!Array.isArray(node)) return false
  const [type, props, ...children] = node
  if (predicate(type, props)) return true
  return children.some((child) => treeHas(child, predicate))
}

assert.ok(treeHas(rendered, (type) => type === stubs.SettingsValueField), 'shared value fields render')
assert.ok(treeHas(rendered, (type) => type === stubs.SettingsSecretField), 'shared secret field renders')

// The custom controls (auth-type select, boolean switches) are bundle-internal
// component functions; the capturing createElement never invokes them, so call
// each captured element's type directly. Children order: baseUrl, apiKey,
// authType, defaultUserId, defaultAgentId, timeoutMs, announceToAgent, enabled.
const fields = rendered.slice(2)
const invoke = ([type, props]) => type(props)
const authTree = invoke(fields[2])
assert.ok(treeHas(authTree, (type) => type === 'select'), 'the auth-type control renders a select')
assert.equal(authTree[1].className, 'mem0-field', 'custom control carries its field chrome')
const announceTree = invoke(fields[6])
const enabledTree = invoke(fields[7])
for (const tree of [announceTree, enabledTree]) {
  assert.equal(
    treeHas(tree, (type, props) => type === 'input' && props.type === 'checkbox'),
    true,
    'the boolean switches render as checkboxes',
  )
}

// The summary view answers with the one-liner (hooks still run before the branch).
assert.equal(PageComponent({ t: (key) => key, view: 'summary', ...face }), 'summary')

// --------------------------------------------------------- whileServed fence

configForms.stopServing()
await new Promise((resolve) => setTimeout(resolve, 10))
assert.equal(face.useMem0Config((s) => s).available, false, 'withdrawn namespace reports unavailable')
assert.equal(slotInjects.length, 0, 'the row-config registration withdrew with the namespace')

console.log('smoke-client: ok — bundle loads, row-config page registers, shared form stages/saves/discards correctly')
