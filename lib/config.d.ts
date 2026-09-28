/**
 * Plugin configuration: the volatile Config schema the Loader composes and
 * the official Plugins page edits (the row whose entry id is `dsh-mem0`).
 * Every field is volatile, so edits apply live — apply() re-syncs its
 * registrations on `loader/volatile-update` and the mem0 client reads each
 * field through `.get()` on every request. The apiKey carries role('secret'):
 * the literal never rides a form response, only a configured flag does.
 */
import type { Volatile } from '@deepseek-ai/cordis';
import z from '@deepseek-ai/schemastery';
/** Live plugin config as the Loader hands it to apply(): one volatile reference per field. */
export interface Config {
    /** Base URL of the self-hosted mem0 REST server (no trailing slash, no /v1). */
    baseUrl: Volatile<string>;
    /** API key for auth: a per-user `m0sk_...` key, the legacy `ADMIN_API_KEY`, or a JWT. Absent when unset (the secret reports unconfigured). */
    apiKey: Volatile<string | undefined>;
    /** How `apiKey` is sent. `jwt` sends `Authorization: Bearer`, the rest send `X-API-Key`. */
    authType: Volatile<'apiKey' | 'adminKey' | 'jwt' | 'none'>;
    /** Default `user_id` used when a tool call does not specify one. */
    defaultUserId: Volatile<string>;
    /** Default `agent_id` used when a tool call does not specify one. */
    defaultAgentId: Volatile<string>;
    /** HTTP timeout per request, in milliseconds. */
    timeoutMs: Volatile<number>;
    /** When true (default), a system-prompt section announces the plugin to agents. */
    announceToAgent: Volatile<boolean>;
    /** Master switch for tools and the prompt section. */
    enabled: Volatile<boolean>;
}
/** Schemastery schema; the Plugins-page form is generated from its volatile fields. */
export declare const Config: z<Schemastery.ObjectS<NoInfer<{
    baseUrl: z<string, string, "volatile-defined">;
    apiKey: z<string, string, "volatile">;
    authType: z<"apiKey" | "adminKey" | "jwt" | "none", "apiKey" | "adminKey" | "jwt" | "none", "volatile-defined">;
    defaultUserId: z<string, string, "volatile-defined">;
    defaultAgentId: z<string, string, "volatile-defined">;
    timeoutMs: z<number, number, "volatile-defined">;
    announceToAgent: z<boolean, boolean, "volatile-defined">;
    enabled: z<boolean, boolean, "volatile-defined">;
}>>, Schemastery.ObjectT<NoInfer<{
    baseUrl: z<string, string, "volatile-defined">;
    apiKey: z<string, string, "volatile">;
    authType: z<"apiKey" | "adminKey" | "jwt" | "none", "apiKey" | "adminKey" | "jwt" | "none", "volatile-defined">;
    defaultUserId: z<string, string, "volatile-defined">;
    defaultAgentId: z<string, string, "volatile-defined">;
    timeoutMs: z<number, number, "volatile-defined">;
    announceToAgent: z<boolean, boolean, "volatile-defined">;
    enabled: z<boolean, boolean, "volatile-defined">;
}>>, "plain">;
/** Resolved runtime config (plain values, schema defaults applied). */
export interface Mem0Config {
    /** Base URL of the self-hosted mem0 REST server (no trailing slash, no /v1). */
    baseUrl?: string;
    /** API key for auth: a per-user `m0sk_...` key, the legacy `ADMIN_API_KEY`, or a JWT. */
    apiKey?: string;
    /** How `apiKey` is sent. `jwt` sends `Authorization: Bearer`, the rest send `X-API-Key`. */
    authType?: 'apiKey' | 'adminKey' | 'jwt' | 'none';
    /** Default `user_id` used when a tool call does not specify one. */
    defaultUserId?: string;
    /** Default `agent_id` used when a tool call does not specify one. */
    defaultAgentId?: string;
    /** HTTP timeout per request, in milliseconds. */
    timeoutMs?: number;
    /** When true (default), a system-prompt section announces the plugin to agents. */
    announceToAgent?: boolean;
    /** Master switch for tools and the prompt section. */
    enabled?: boolean;
}
/** Schema defaults, re-read for hand-built test contexts (the loader applies them normally). */
export declare const DEFAULT_CONFIG: Required<Mem0Config>;
/** Normalize a partial config against the defaults. */
export declare function resolveConfig(input: Mem0Config | undefined): Required<Mem0Config>;
/**
 * Snapshot the live references into a resolved config. Callers read per
 * operation (per request / per re-sync), so a settings edit applies without
 * a remount.
 * @param config - the volatile config the Loader handed to apply().
 * @returns the config with defaults applied.
 */
export declare function readLiveConfig(config: Config): Required<Mem0Config>;
