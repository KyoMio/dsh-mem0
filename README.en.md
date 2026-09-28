# dsh-mem0

[中文](README.md) | English

A hot-pluggable [dsh](https://github.com/deepseek-ai/deepseek-harness) (DeepSeek
Harness) plugin for reading and writing memories on a
[self-hosted mem0](https://github.com/mem0ai/mem0) instance: the host Agent
talks to your own mem0 REST server directly through the `mem0_*` tools (new
OSS build, `mem0/mem0-api-server`, dashboard included, `X-API-Key` auth,
endpoints have no `/v1` prefix).

Mounted via `dsh plugin add link:<this-directory>` — no dsh source changes.
No sidebar UI, but it does ship a browser half: a Configure configuration page
on the `dsh-mem0` row of the Plugins page (Web sidebar → Plugins) that edits
the settings below. **Requires DSH ≥ 0.1.7-rc.2** (configuration is the
plugin's volatile `Config` schema, edited through the official Plugins-page
form).

## Tools

| Tool | Endpoint | Description |
|---|---|---|
| `mem0_add` | `POST /memories` | Store memories (a string or a message array; attributed by `defaultUserId` / `defaultAgentId`) |
| `mem0_search` | `POST /search` | Semantic search with relevance scores |
| `mem0_get` | `GET /memories` / `GET /memories/{id}` | List (filtered by identifiers) or fetch one |
| `mem0_update` | `PUT /memories/{id}` | Update a memory's text / metadata / expiration |
| `mem0_delete` | `DELETE /memories/{id}` / `DELETE /memories` | Delete one; bulk delete needs `confirm: "DELETE ALL"` + admin |
| `mem0_history` | `GET /memories/{id}/history` | Edit history of one memory |
| `mem0_reset` | `POST /reset` | Wipe everything (needs `confirm: "RESET"` + admin) |
| `mem0_status` | `GET /auth/setup-status` + `GET /configure` | Health / auth / configuration check (never prints the apiKey) |

## Install

```sh
# Option 1: straight from GitHub (no publish step, recommended for users)
dsh plugin --profile web add github:orangeshinee/dsh-mem0

# Option 1 (pinned version): v* tag on GitHub Releases, built by CI
dsh plugin --profile web add github:orangeshinee/dsh-mem0#v0.1.2

# Option 2: from npm after publishing (maintainer runs npm publish once)
npm publish   # maintainer
dsh plugin --profile web add dsh-mem0

# Option 3: local development (link style)
dsh plugin --profile web add link:$(pwd)

# Restart dsh web after installing
```

The `@deepseek-ai/*` packages whose instances must be shared with the host
(cordis / schemastery / dsh-*) are declared in `peerDependencies`: profiles
default to `autoInstallPeers:false`, so `dsh plugin add` does not install
them — dsh's dependency-resolution layer supplies the running installation's
own copies at runtime.

## Release

Pushing a `v*` tag triggers CI (`.github/workflows/release.yml`) to build and
publish a GitHub Release automatically: `pnpm build` → three offline smoke tests
→ the `npm pack` artifact (`dsh-mem0-<version>.tgz`) is attached to the
Release, with auto-generated changelog.

```sh
git tag v0.1.2 && git push origin v0.1.2
```

The tag version must equal the `version` in `package.json` (CI fails
otherwise). If the repository has an `NPM_TOKEN` secret set, the same run also
publishes to npm (`npm publish`); without it that step is skipped and the
GitHub Release still happens.

## Configuration

Plugins page (Web sidebar → Plugins) → the installed `dsh-mem0` package →
the `dsh-mem0` row → **Configure** (or edit the row's config section in the
profile directly):

| Key | Default | Description |
|---|---|---|
| `baseUrl` | `http://127.0.0.1:8888` | Self-hosted mem0 address (no trailing slash, no `/v1`) |
| `apiKey` | empty | `m0sk_...` from the dashboard's API Keys, the legacy `ADMIN_API_KEY`, or a JWT |
| `authType` | `apiKey` | `apiKey` / `adminKey` / `jwt` / `none` |
| `defaultUserId` | `HeTony` | Owner used when a tool call does not specify `user_id` |
| `defaultAgentId` | `dsh-agent` | Agent used when a tool call does not specify `agent_id` |
| `timeoutMs` | `15000` | Per-request timeout |
| `announceToAgent` | `true` | Announce the plugin to agents in the system prompt |
| `enabled` | `true` | Master switch |

The configuration is the plugin's volatile `Config` schema (`src/config.ts`),
edited by the official Plugins-page form and persisted through the active
profile; changes to `baseUrl` / `apiKey` / the default identifiers apply
immediately, no restart needed.

> On its first start, dsh 0.1.7 imports each section of the legacy
> `~/.dsh/settings.yaml` once into the plugin row whose **entry id equals the
> section name** — this plugin's entry id is `dsh-mem0` (`cordis.patch.yml`),
> so the eight fields above carry over as-is; the file is then renamed to
> `settings.yaml.imported`.
>
> `apiKey` is marked `role('secret')` in the schema: form responses carry only
> a "configured / not configured" flag, the key literal never reaches the
> browser; saving with the field blank keeps the current key. The configuration
> page is rendered by the browser half (`client/client.cjs`) in the Plugins
> page's `plugins.row.config` slot, reading and writing through the shared
> `configForms` service. After changing host-side code (`src/`) you must
> `pnpm build` and restart dsh web; a change to `client/client.cjs` alone only
> needs a page refresh.

## Development

```sh
pnpm typecheck   # tsc --noEmit
pnpm build       # outputs lib/ (ESM, sources in src/)
```

The build output is multi-file ESM (`tsc`); runtime dependencies
(`@deepseek-ai/dsh-*`) resolve from the host profile's `node_modules`.

For agent-oriented development notes (code map, platform traps, security red
lines), see [AGENTS.md](AGENTS.md).

## License

[MIT](LICENSE)
