/**
 * dsh-mem0 — browser half.
 *
 * Registers this plugin's configuration page on the official Plugins page:
 * the dsh-mem0 row gains a Configure control that opens the form. Reads and
 * revision-fenced writes ride the shared `configForms` service (the Host
 * derives the form from the plugin's volatile Config schema), so this half
 * owns no transport of its own. The API key never rides a response:
 * role('secret') keeps the literal Host-side; the describe view's secrets
 * sidecar carries only a configured flag.
 *
 * The staged form model and the field chrome come from the platform's
 * ui-primitives (SettingsFormModel / SettingsForm / SettingsValueField /
 * SettingsSecretField); only the auth-type select and the boolean switches
 * are drawn here.
 *
 * This file is the shipped bundle artifact: the dsh client module loader
 * serves it at /plugins/dsh-mem0/client.js and calls
 * window.__ModuleLoader__.load({ id, factory }). It is plain JavaScript on
 * purpose — the package builds with tsc only (no bundler), and the loader
 * accepts any file that registers itself in this format.
 *
 * Export discipline mirrors the host half: the /client surface carries only
 * the plugin contract (apply / inject); everything else stays internal.
 */

window.__ModuleLoader__.load({
  id: 'dsh-mem0',
  factory: (require) => {
    var module = { exports: {} }
    var exports = module.exports
    Object.defineProperty(exports, Symbol.toStringTag, { value: 'Module' })

    const React = require('react')
    const {
      SettingsForm,
      SettingsFormModel,
      SettingsSecretField,
      SettingsValueField,
      settingsNumberField,
      settingsTextField,
    } = require('@deepseek-ai/dsh-client-ui-primitives')

    const h = React.createElement

    /** Settings namespace (= profile entry id) this page edits (spelled, not imported — a client bundle must not depend on a Host package). */
    const NS = 'dsh-mem0'

    /** `plugins.row.config` key: `<package name>#<row id>` as cordis.patch.yml declares the row. */
    const ROW_KEY = 'dsh-mem0#dsh-mem0'

    /** The auth-type choices the Config union accepts, in render order. */
    const AUTH_TYPES = ['apiKey', 'adminKey', 'jwt', 'none']

    // ---------------------------------------------------------------- locale

    const zh = {
      summary: '自托管 mem0 REST 服务地址、认证与默认标识符。',
      unavailable: '本部署没有向此客户端开放这项配置。',
      readOnly: '本部署的设置为只读。',
      saveFailed: '本部署没有接受这些值，已保留供你修改。',
      save: '保存',
      saving: '保存中…',
      overridden: '已覆盖',
      reset: '恢复默认',
      invalidNumber: '请填数字；留空表示使用默认值。',
      baseUrl: '服务地址（baseUrl）',
      baseUrlHint: 'mem0 REST 服务地址，无尾斜杠、无 /v1。',
      apiKey: 'API Key',
      apiKeyHint: '留空表示保持当前密钥。',
      apiKeySet: '已配置',
      apiKeyUnset: '未配置',
      authType: '认证方式（authType）',
      authTypeHint: 'apiKey / adminKey / jwt / none。',
      defaultUserId: '默认 user_id',
      defaultUserIdHint: '工具未指定 user_id 时的默认归属。',
      defaultAgentId: '默认 agent_id',
      defaultAgentIdHint: '工具未指定 agent_id 时的默认归属（写入时生效）。',
      timeoutMs: '单请求超时（毫秒）',
      timeoutMsHint: '单个 mem0 请求允许运行多久，超时即终止。',
      announceToAgent: '向 Agent 宣告能力',
      announceToAgentHint: '是否在系统提示中宣告 mem0_* 工具。',
      enabled: '启用',
      enabledHint: '总开关；关闭后不再注册工具与宣告。',
    }

    const en = {
      summary: 'Server, auth, and default identifiers for the self-hosted mem0 memory store.',
      unavailable: 'This deployment does not serve this configuration to the client.',
      readOnly: 'This deployment stores settings read-only.',
      saveFailed: 'The deployment did not accept these values; they were left for you to correct.',
      save: 'Save',
      saving: 'Saving…',
      overridden: 'Overridden',
      reset: 'Reset to default',
      invalidNumber: 'Enter a number, or leave blank to use the default.',
      baseUrl: 'Server URL (baseUrl)',
      baseUrlHint: 'mem0 REST endpoint, no trailing slash, no /v1.',
      apiKey: 'API key',
      apiKeyHint: 'Leave blank to keep the current key.',
      apiKeySet: 'A key is configured.',
      apiKeyUnset: 'No key is configured.',
      authType: 'Auth type (authType)',
      authTypeHint: 'apiKey / adminKey / jwt / none.',
      defaultUserId: 'Default user_id',
      defaultUserIdHint: 'Owner used when a tool call does not specify one.',
      defaultAgentId: 'Default agent_id',
      defaultAgentIdHint: 'Agent used for writes when a tool call does not specify one.',
      timeoutMs: 'Request timeout (ms)',
      timeoutMsHint: 'How long one mem0 request may run before it is terminated.',
      announceToAgent: 'Announce to agents',
      announceToAgentHint: 'Whether the mem0_* tools are announced in the system prompt.',
      enabled: 'Enabled',
      enabledHint: 'Master switch; when off, tools and the announcement are not registered.',
    }

    // ------------------------------------------------------------- controller

    /** A one-of field: only the declared choices parse; the control renders a select. */
    function oneOfField(field, options) {
      return {
        field,
        format: (value) => (typeof value === 'string' && options.includes(value) ? value : options[0]),
        parse: (text) => (options.includes(text) ? { kind: 'set', value: text } : undefined),
      }
    }

    /**
     * A boolean field staged as 'true'/'false' draft text (the shared model
     * stages text); the control renders a checkbox.
     */
    function boolField(field) {
      return {
        field,
        format: (value) => (value === true ? 'true' : 'false'),
        parse: (text) =>
          text === 'true'
            ? { kind: 'set', value: true }
            : text === 'false'
              ? { kind: 'set', value: false }
              : undefined,
      }
    }

    /**
     * Bridges the `dsh-mem0` entry's shared configuration form onto the
     * staged form the page renders. The apiKey is a write-only secret: its
     * draft starts blank, a blank draft writes nothing, and the configured
     * badge comes from the describe view's secrets sidecar.
     */
    class Mem0ConfigController {
      /** @param configForms - the settings domain's shared form service. */
      constructor(configForms) {
        this.scope = configForms.get(NS)
        this.describe = configForms.describe()
        this.form = new SettingsFormModel(
          this.scope,
          [
            settingsTextField('baseUrl'),
            oneOfField('authType', AUTH_TYPES),
            settingsTextField('defaultUserId'),
            settingsTextField('defaultAgentId'),
            settingsNumberField('timeoutMs'),
            boolField('announceToAgent'),
            boolField('enabled'),
          ],
          [{ field: 'apiKey', write: (text) => this.scope.set('apiKey', text) }],
        )
        this.store = this.form.bind(() => this.projection())
        this.offDescribe = this.describe.subscribe(() => this.publish())
      }

      /** Whether the Host reports a stored apiKey; the literal never rides. */
      apiKeyConfigured() {
        const namespaces = this.describe.getSnapshot().view?.namespaces ?? []
        const row = namespaces.find((candidate) => candidate.ns === NS)
        return (row?.secrets ?? []).some(
          (secret) => secret.path.length === 1 && secret.path[0] === 'apiKey' && secret.set,
        )
      }

      /** The projection the page's component renders. */
      projection() {
        return {
          ...this.form.shell(),
          baseUrl: this.form.field('baseUrl'),
          apiKey: { ...this.form.field('apiKey'), configured: this.apiKeyConfigured() },
          authType: this.form.field('authType'),
          defaultUserId: this.form.field('defaultUserId'),
          defaultAgentId: this.form.field('defaultAgentId'),
          timeoutMs: this.form.field('timeoutMs'),
          announceToAgent: this.form.field('announceToAgent'),
          enabled: this.form.field('enabled'),
        }
      }

      /** The face the row-config slot registration injects. */
      inject() {
        return { hooks: { mem0Config: this.store }, ...this.form.actions() }
      }

      publish() {
        this.store.set(this.projection())
      }

      /** Release the form and describe subscriptions. */
      dispose() {
        this.offDescribe()
        this.form.dispose()
      }
    }

    // ----------------------------------------------------------------- styles

    /** Field chrome for the controls drawn here (the shared fields bring their own). */
    const PAGE_CSS =
      '.mem0-field{margin:0 0 12px}' +
      '.mem0-field-head{justify-content:space-between;align-items:baseline;gap:8px;display:flex}' +
      '.mem0-field-label{color:var(--dsw-alias-label-primary);font-size:13px;font-weight:600;line-height:1.5}' +
      '.mem0-field-badges{align-items:center;gap:8px;display:flex}' +
      '.mem0-field-badge{color:var(--dsw-alias-label-tertiary,var(--dsw-alias-label-secondary));background:var(--dsw-alias-bg-module-platform,var(--dsw-alias-bg-layer-1));border-radius:999px;padding:1px 8px;font-size:11px;line-height:17px}' +
      '.mem0-field-reset{appearance:none;font:inherit;cursor:pointer;border:0;background:0 0;color:var(--dsw-alias-link-primary,var(--dsw-alias-brand-primary));font-size:12px;padding:0}' +
      '.mem0-field-reset:disabled{color:var(--dsw-alias-label-tertiary,var(--dsw-alias-label-secondary));cursor:default}' +
      '.mem0-field-input{box-sizing:border-box;width:100%;font:inherit;color:var(--dsw-alias-label-primary);background:var(--dsw-alias-bg-layer-1);border:1px solid var(--dsw-alias-border-l2);border-radius:6px;margin-top:6px;padding:6px 10px;font-size:13px;line-height:1.5}' +
      '.mem0-field-input:focus-visible{outline:2px solid var(--dsw-alias-brand-primary);outline-offset:-1px}' +
      '.mem0-field-hint{color:var(--dsw-alias-label-tertiary,var(--dsw-alias-label-secondary));margin:4px 0 0;font-size:12px;line-height:1.5}' +
      '.mem0-field-check{display:flex;align-items:center;gap:8px;margin-top:6px}'

    if (typeof document !== 'undefined' && document.querySelector('style[data-plugin-css="dsh-mem0/config.css"]') === null) {
      const tag = document.createElement('style')
      tag.dataset.plugin = 'dsh-mem0'
      tag.dataset.pluginCss = 'dsh-mem0/config.css'
      tag.textContent = PAGE_CSS
      document.head.appendChild(tag)
    }

    // ------------------------------------------------------------- component

    /** The auth-type select (the shared fields have no one-of control). */
    function AuthTypeField(props) {
      return h(
        'div',
        { className: 'mem0-field' },
        h(
          'div',
          { className: 'mem0-field-head' },
          h('label', { className: 'mem0-field-label', htmlFor: props.id }, props.label),
          props.overridden
            ? h(
                'span',
                { className: 'mem0-field-badges' },
                h('span', { className: 'mem0-field-badge' }, props.overriddenLabel),
                h(
                  'button',
                  { type: 'button', className: 'mem0-field-reset', disabled: props.disabled, onClick: props.onReset },
                  props.resetLabel,
                ),
              )
            : null,
        ),
        h(
          'select',
          {
            id: props.id,
            className: 'mem0-field-input',
            value: props.text,
            disabled: props.disabled,
            onChange: (event) => props.onPick(event.target.value),
          },
          props.options.map((option) => h('option', { key: option, value: option }, option)),
        ),
        h('p', { className: 'mem0-field-hint' }, props.hint),
      )
    }

    /** One boolean switch staged as 'true'/'false' draft text. */
    function BoolField(props) {
      return h(
        'div',
        { className: 'mem0-field' },
        h(
          'div',
          { className: 'mem0-field-head' },
          h('label', { className: 'mem0-field-label', htmlFor: props.id }, props.label),
          props.overridden
            ? h(
                'span',
                { className: 'mem0-field-badges' },
                h('span', { className: 'mem0-field-badge' }, props.overriddenLabel),
                h(
                  'button',
                  { type: 'button', className: 'mem0-field-reset', disabled: props.disabled, onClick: props.onReset },
                  props.resetLabel,
                ),
              )
            : null,
        ),
        h(
          'span',
          { className: 'mem0-field-check' },
          h('input', {
            id: props.id,
            type: 'checkbox',
            checked: props.text === 'true',
            disabled: props.disabled,
            onChange: (event) => props.onToggle(event.target.checked ? 'true' : 'false'),
          }),
          h('span', { className: 'mem0-field-hint' }, props.hint),
        ),
      )
    }

    /** The dsh-mem0 configuration page: the row's Configure form. */
    function Mem0RowConfig(props) {
      const { t } = props
      const state = props.useMem0Config((snapshot) => snapshot)
      if (props.view === 'summary') return t('summary')
      const disabled = !state.writable
      return h(
        SettingsForm,
        {
          labels: {
            unavailable: t('unavailable'),
            readOnly: t('readOnly'),
            saveFailed: t('saveFailed'),
            save: t('save'),
            saving: t('saving'),
          },
          state,
          onSave: props.save,
          onDiscard: props.discard,
        },
        h(SettingsValueField, {
          id: 'mem0-config-base-url',
          label: t('baseUrl'),
          hint: t('baseUrlHint'),
          overriddenLabel: t('overridden'),
          resetLabel: t('reset'),
          invalidLabel: t('invalidNumber'),
          disabled,
          ...state.baseUrl,
          onEdit: (text) => props.edit('baseUrl', text),
          onReset: () => props.resetField('baseUrl'),
        }),
        h(SettingsSecretField, {
          id: 'mem0-config-api-key',
          label: t('apiKey'),
          hint: t('apiKeyHint'),
          stateLabel: state.apiKey.configured ? t('apiKeySet') : t('apiKeyUnset'),
          configured: state.apiKey.configured,
          disabled,
          text: state.apiKey.text,
          onEdit: (text) => props.edit('apiKey', text),
        }),
        h(AuthTypeField, {
          id: 'mem0-config-auth-type',
          label: t('authType'),
          hint: t('authTypeHint'),
          overriddenLabel: t('overridden'),
          resetLabel: t('reset'),
          options: AUTH_TYPES,
          disabled,
          ...state.authType,
          onPick: (value) => props.edit('authType', value),
          onReset: () => props.resetField('authType'),
        }),
        h(SettingsValueField, {
          id: 'mem0-config-default-user',
          label: t('defaultUserId'),
          hint: t('defaultUserIdHint'),
          overriddenLabel: t('overridden'),
          resetLabel: t('reset'),
          invalidLabel: t('invalidNumber'),
          disabled,
          ...state.defaultUserId,
          onEdit: (text) => props.edit('defaultUserId', text),
          onReset: () => props.resetField('defaultUserId'),
        }),
        h(SettingsValueField, {
          id: 'mem0-config-default-agent',
          label: t('defaultAgentId'),
          hint: t('defaultAgentIdHint'),
          overriddenLabel: t('overridden'),
          resetLabel: t('reset'),
          invalidLabel: t('invalidNumber'),
          disabled,
          ...state.defaultAgentId,
          onEdit: (text) => props.edit('defaultAgentId', text),
          onReset: () => props.resetField('defaultAgentId'),
        }),
        h(SettingsValueField, {
          id: 'mem0-config-timeout',
          label: t('timeoutMs'),
          hint: t('timeoutMsHint'),
          overriddenLabel: t('overridden'),
          resetLabel: t('reset'),
          invalidLabel: t('invalidNumber'),
          numeric: true,
          disabled,
          ...state.timeoutMs,
          onEdit: (text) => props.edit('timeoutMs', text),
          onReset: () => props.resetField('timeoutMs'),
        }),
        h(BoolField, {
          id: 'mem0-config-announce',
          label: t('announceToAgent'),
          hint: t('announceToAgentHint'),
          overriddenLabel: t('overridden'),
          resetLabel: t('reset'),
          disabled,
          ...state.announceToAgent,
          onToggle: (text) => props.edit('announceToAgent', text),
          onReset: () => props.resetField('announceToAgent'),
        }),
        h(BoolField, {
          id: 'mem0-config-enabled',
          label: t('enabled'),
          hint: t('enabledHint'),
          overriddenLabel: t('overridden'),
          resetLabel: t('reset'),
          disabled,
          ...state.enabled,
          onToggle: (text) => props.edit('enabled', text),
          onReset: () => props.resetField('enabled'),
        }),
      )
    }

    // ------------------------------------------------------------------ apply

    /** Required services: slots + locale for the page, configForms for the shared entry form. */
    const inject = ['slots', 'locale', 'configForms']

    /**
     * Mount the dsh-mem0 configuration page. Failure policy mirrors the other
     * external browser plugins: a mount problem is logged, never thrown — the
     * web shell fails the whole boot when a plugin apply throws.
     * @param ctx - the browser plugin context.
     */
    function apply(ctx) {
      try {
        ctx.effect(() => ctx.locale.register(NS, { zh, en }), 'dsh-mem0: page dictionaries')
        const controller = new Mem0ConfigController(ctx.configForms)
        ctx.effect(() => () => controller.dispose(), 'dsh-mem0: config form')
        // The Configure control exists exactly while the Host serves the
        // namespace (whileServed also waits out the describe mirror's first
        // read, so the page never flashes its unavailable line).
        ctx.effect(
          () =>
            ctx.configForms.whileServed([NS], () =>
              ctx.slots.inject('plugins.row.config', () =>
                ctx.slots.register(
                  {
                    name: 'plugins.row.config',
                    key: ROW_KEY,
                    locale: NS,
                    inject: () => controller.inject(),
                  },
                  Mem0RowConfig,
                ),
              ),
            ),
          'dsh-mem0: row config page',
        )
      } catch (error) {
        console.warn('[dsh-mem0] config page failed to mount:', error)
      }
    }

    exports.apply = apply
    exports.inject = inject
    return module.exports
  },
})
