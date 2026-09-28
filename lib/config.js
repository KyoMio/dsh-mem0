/**
 * Plugin configuration: the volatile Config schema the Loader composes and
 * the official Plugins page edits (the row whose entry id is `dsh-mem0`).
 * Every field is volatile, so edits apply live — apply() re-syncs its
 * registrations on `loader/volatile-update` and the mem0 client reads each
 * field through `.get()` on every request. The apiKey carries role('secret'):
 * the literal never rides a form response, only a configured flag does.
 */
import z from '@deepseek-ai/schemastery';
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
});
/** Schema defaults, re-read for hand-built test contexts (the loader applies them normally). */
export const DEFAULT_CONFIG = {
    baseUrl: 'http://127.0.0.1:8888',
    apiKey: '',
    authType: 'apiKey',
    defaultUserId: 'HeTony',
    defaultAgentId: 'dsh-agent',
    timeoutMs: 15000,
    announceToAgent: true,
    enabled: true,
};
/** Normalize a partial config against the defaults. */
export function resolveConfig(input) {
    const value = input ?? {};
    return {
        baseUrl: value.baseUrl ?? DEFAULT_CONFIG.baseUrl,
        apiKey: value.apiKey ?? DEFAULT_CONFIG.apiKey,
        authType: value.authType ?? DEFAULT_CONFIG.authType,
        defaultUserId: value.defaultUserId ?? DEFAULT_CONFIG.defaultUserId,
        defaultAgentId: value.defaultAgentId ?? DEFAULT_CONFIG.defaultAgentId,
        timeoutMs: value.timeoutMs ?? DEFAULT_CONFIG.timeoutMs,
        announceToAgent: value.announceToAgent ?? DEFAULT_CONFIG.announceToAgent,
        enabled: value.enabled ?? DEFAULT_CONFIG.enabled,
    };
}
/**
 * Snapshot the live references into a resolved config. Callers read per
 * operation (per request / per re-sync), so a settings edit applies without
 * a remount.
 * @param config - the volatile config the Loader handed to apply().
 * @returns the config with defaults applied.
 */
export function readLiveConfig(config) {
    return resolveConfig({
        baseUrl: config.baseUrl.get(),
        apiKey: config.apiKey.get(),
        authType: config.authType.get(),
        defaultUserId: config.defaultUserId.get(),
        defaultAgentId: config.defaultAgentId.get(),
        timeoutMs: config.timeoutMs.get(),
        announceToAgent: config.announceToAgent.get(),
        enabled: config.enabled.get(),
    });
}
