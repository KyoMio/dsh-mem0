/**
 * Plugin configuration: the volatile Config schema the Loader composes and
 * the official Plugins page edits (the row whose entry id is `dsh-mem0`).
 * Every field is volatile, so edits apply live — apply() re-syncs its
 * registrations on `loader/volatile-update` and the mem0 client reads each
 * field through `.get()` on every request. The apiKey carries role('secret'):
 * the literal never rides a form response, only a configured flag does.
 */

import type { Volatile } from '@deepseek-ai/cordis'
import z from '@deepseek-ai/schemastery'

/** Live plugin config as the Loader hands it to apply(): one volatile reference per field. */
export interface Config {
  /** Base URL of the self-hosted mem0 REST server (no trailing slash, no /v1). */
  baseUrl: Volatile<string>
  /** API key for auth: a per-user `m0sk_...` key, the legacy `ADMIN_API_KEY`, or a JWT. Absent when unset (the secret reports unconfigured). */
  apiKey: Volatile<string | undefined>
  /** How `apiKey` is sent. `jwt` sends `Authorization: Bearer`, the rest send `X-API-Key`. */
  authType: Volatile<'apiKey' | 'adminKey' | 'jwt' | 'none'>
  /** Default `user_id` used when a tool call does not specify one. */
  defaultUserId: Volatile<string>
  /** Default `agent_id` used when a tool call does not specify one. */
  defaultAgentId: Volatile<string>
  /** HTTP timeout per request, in milliseconds. */
  timeoutMs: Volatile<number>
  /** When true (default), a system-prompt section announces the plugin to agents. */
  announceToAgent: Volatile<boolean>
  /** Master switch for tools and the prompt section. */
  enabled: Volatile<boolean>
}

/** Schemastery schema; the Plugins-page form is generated from its volatile fields. */
export const Config = z.object({
  baseUrl: z.string().default('http://127.0.0.1:8888').volatile(),
  // role('secret'): redacted from every form response (the browser half only
  // ever sees a configured flag carried by the describe view's secrets
  // sidecar). No default: an absent key reports unconfigured, not "".
  apiKey: z.string().role('secret').volatile(),
  authType: z
    .union([z.const('apiKey'), z.const('adminKey'), z.const('jwt'), z.const('none')])
    .default('apiKey')
    .volatile(),
  defaultUserId: z.string().default('HeTony').volatile(),
  defaultAgentId: z.string().default('dsh-agent').volatile(),
  timeoutMs: z.number().default(15000).volatile(),
  announceToAgent: z.boolean().default(true).volatile(),
  enabled: z.boolean().default(true).volatile(),
})

/** Resolved runtime config (plain values, schema defaults applied). */
export interface Mem0Config {
  /** Base URL of the self-hosted mem0 REST server (no trailing slash, no /v1). */
  baseUrl?: string
  /** API key for auth: a per-user `m0sk_...` key, the legacy `ADMIN_API_KEY`, or a JWT. */
  apiKey?: string
  /** How `apiKey` is sent. `jwt` sends `Authorization: Bearer`, the rest send `X-API-Key`. */
  authType?: 'apiKey' | 'adminKey' | 'jwt' | 'none'
  /** Default `user_id` used when a tool call does not specify one. */
  defaultUserId?: string
  /** Default `agent_id` used when a tool call does not specify one. */
  defaultAgentId?: string
  /** HTTP timeout per request, in milliseconds. */
  timeoutMs?: number
  /** When true (default), a system-prompt section announces the plugin to agents. */
  announceToAgent?: boolean
  /** Master switch for tools and the prompt section. */
  enabled?: boolean
}

/** Schema defaults, re-read for hand-built test contexts (the loader applies them normally). */
export const DEFAULT_CONFIG: Required<Mem0Config> = {
  baseUrl: 'http://127.0.0.1:8888',
  apiKey: '',
  authType: 'apiKey',
  defaultUserId: 'HeTony',
  defaultAgentId: 'dsh-agent',
  timeoutMs: 15000,
  announceToAgent: true,
  enabled: true,
}

/** Normalize a partial config against the defaults. */
export function resolveConfig(input: Mem0Config | undefined): Required<Mem0Config> {
  const value = input ?? {}
  return {
    baseUrl: value.baseUrl ?? DEFAULT_CONFIG.baseUrl,
    apiKey: value.apiKey ?? DEFAULT_CONFIG.apiKey,
    authType: value.authType ?? DEFAULT_CONFIG.authType,
    defaultUserId: value.defaultUserId ?? DEFAULT_CONFIG.defaultUserId,
    defaultAgentId: value.defaultAgentId ?? DEFAULT_CONFIG.defaultAgentId,
    timeoutMs: value.timeoutMs ?? DEFAULT_CONFIG.timeoutMs,
    announceToAgent: value.announceToAgent ?? DEFAULT_CONFIG.announceToAgent,
    enabled: value.enabled ?? DEFAULT_CONFIG.enabled,
  }
}

/**
 * Snapshot the live references into a resolved config. Callers read per
 * operation (per request / per re-sync), so a settings edit applies without
 * a remount.
 * @param config - the volatile config the Loader handed to apply().
 * @returns the config with defaults applied.
 */
export function readLiveConfig(config: Config): Required<Mem0Config> {
  return resolveConfig({
    baseUrl: config.baseUrl.get(),
    apiKey: config.apiKey.get(),
    authType: config.authType.get(),
    defaultUserId: config.defaultUserId.get(),
    defaultAgentId: config.defaultAgentId.get(),
    timeoutMs: config.timeoutMs.get(),
    announceToAgent: config.announceToAgent.get(),
    enabled: config.enabled.get(),
  })
}
