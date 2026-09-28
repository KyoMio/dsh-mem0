/**
 * dsh-mem0: self-hosted mem0 memory operations for dsh.
 *
 * Host-side cordis plugin. Mounts a mem0 REST client configured through the
 * plugin's volatile Config (edited on the official Plugins page; the profile
 * entry id `dsh-mem0` addresses the form), registers the mem0_* agent tools,
 * and announces itself to agents via a system-prompt section. Config edits
 * apply live: the client reads every field through .get() per request, and
 * the tool/announcement registrations re-sync on loader/volatile-update.
 */
import type { Context } from '@deepseek-ai/cordis';
import { Config } from './config.js';
/** Stable cordis plugin name. */
export declare const name = "mem0";
/** Services required before the mem0 surfaces can mount. */
export declare const inject: string[];
/** Plugin configuration schema (volatile fields; the Plugins-page form derives from it). */
export { Config } from './config.js';
/** Model-facing announcement: plugin presence, capabilities, and limits. */
export declare const MEM0_GUIDANCE: string;
/**
 * Mount the mem0 client, tools, and announcement.
 * @param ctx - host plugin context carrying tools/systemPrompt.
 * @param config - live plugin config (volatile references, one per field).
 */
export declare function apply(ctx: Context, config: Config): void;
