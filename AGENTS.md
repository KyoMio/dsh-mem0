# AGENTS.md — dsh-mem0 开发须知

> 给 AI agent（和人类协作者）的项目内指南。README 讲「怎么用」，本文件讲「怎么改」：
> 代码地图、构建/验证闭环、以及几条违反就会白费功夫的平台陷阱。改动前先读完「平台陷阱」。

## 这是什么

dsh 的热插拔插件：宿主 Agent 通过 `mem0_*` 工具读写自托管 mem0 REST 服务，并在官方
插件页（`dsh-mem0` 行的 Configure）提供配置表单。**需要 DSH ≥ 0.1.7-rc.2**。
**硬约束：不修改 dsh/harness 源码**，一切能力都从本包内实现。

## 代码地图

| 路径 | 职责 | 半边 |
|---|---|---|
| `src/index.ts` | 插件入口：注册工具 + 系统提示段 + volatile `Config` 导出 | 宿主 |
| `src/config.ts` | volatile `Config` schema（schemastery，全字段 `.volatile()`，apiKey `role('secret')`） | 宿主 |
| `src/mem0-client.ts` | mem0 REST 客户端（每次请求读实时配置） | 宿主 |
| `src/tools.ts` | 8 个 `mem0_*` 工具定义 | 宿主 |
| `client/client.cjs` | 浏览器半边：插件页 `dsh-mem0` 行的 Configure 配置页（**手写纯 JS bundle，非构建产物**） | 浏览器 |
| `cordis.patch.yml` | 把插件行插入 web profile 清单（**条目 id 必须是 `dsh-mem0`**，见平台陷阱 1） | 装配 |
| `scripts/smoke-client.mjs` | 浏览器半边冒烟（VM + 假 configForms + 移植的表单模型） | 测试 |
| `scripts/smoke.mjs` / `load-test.mjs` / `migrate-user-id.mjs` | 真机 E2E / apply 冒烟（含 volatile 重同步）/ 数据迁移（凭据走环境变量，见安全红线） | 测试 |
| `scripts/smoke-tools.mjs` | 工具输出 schema 冒烟：真实服务器形状载荷必须通过 | 测试 |
| `lib/` | `pnpm build` 的 tsc 产物，**纳入 git**（link 挂载直接加载它） | 产物 |

## 构建与验证（每次改动必跑）

```sh
pnpm build          # tsc 输出 lib/ + 类型检查（必须通过）
pnpm smoke:client   # 浏览器半边：bundle 加载 + plugins.row.config 注册 + 表单暂存/保存/放弃
pnpm smoke:apply    # 宿主 apply 冒烟：8 工具 + 提示段注册 + volatile 更新重同步（scripts/load-test.mjs）
pnpm smoke:tools    # 工具输出 schema 冒烟：真实服务器形状载荷必须通过（scripts/smoke-tools.mjs）
```

- 改了 `src/**` → `pnpm build`，且 **dsh web 进程要重启**才生效（宿主代码启动时加载）。
- 只改了 `client/client.cjs` → 刷新页面即生效（该文件按请求现读，rev 仅作缓存破坏）。
- 改了 `package.json` 的 `dsh.client` 声明或 `cordis.patch.yml` → 同样需要重启（启动时编排清单）。
- 冒烟测试用假对象/VM，不碰真实 mem0 数据；`scripts/smoke.mjs` 才打真实实例（用独立
  `dsh-mem0-test` 用户并自清理）。

## 发布（Release）

- 打 `v*` 标签触发 `.github/workflows/release.yml`：`pnpm build` → 三项离线冒烟 →
  lib/ 新鲜度守卫（构建后工作树必须干净）→ 标签版本必须等于 `package.json` 的
  `version` → `npm pack` 产物挂 GitHub Release；设置了 `NPM_TOKEN` secret 时同步
  `npm publish`（未设置则跳过）。
- 流程：先 `git push` main（确保 lib/ 是最新），再 `git tag v0.1.0 && git push origin
  v0.1.0`。标签版本与 package.json 不一致会在 CI 失败。
- 使用者可装指定版本：`dsh plugin add github:orangeshinee/dsh-mem0#v0.1.0`（dsh 对
  git 源是 clone 整个仓库 + 跑 prepare 脚本；本插件无 prepare、lib/ 已入库，clone 即用）。

## 架构：两个半边 + 一个共享表单

- **宿主半边**（`src/`）导出 schemastery 的 `Config`（全字段 `.volatile()`），注册 8 个工具、
  系统提示段。`apply(ctx, config)` 拿到的是每字段一个 `Volatile` 引用：工具经
  `readLiveConfig(config)` 每次请求读实时值，`enabled` / `announceToAgent` 开关在
  `loader/volatile-update` 事件里重同步注册——配置改动即时生效，无需重启或重挂载。
- **浏览器半边**（`client/client.cjs`）只做一件事：在官方插件页注册 `plugins.row.config`
  （key `dsh-mem0#dsh-mem0`），把 `dsh-mem0` 行的 Configure 页渲染出来。表单模型与字段
  控件复用平台种子模块 `@deepseek-ai/dsh-client-ui-primitives`（`SettingsFormModel` /
  `SettingsForm` / `SettingsValueField` / `SettingsSecretField`），只有 authType 下拉与
  布尔开关是自绘的。
- **配置通道**：卡片读写走共享的 `configForms` 服务（`inject` 里声明）——Host 从插件的
  volatile `Config` 派生表单描述，读写都是带 revision 栅栏的官方路径，插件不再有自有路由。
  apiKey 的「已配置」标记来自 describe 视图的 `secrets` 边车（`SettingsSecretView[]`）。

## 平台陷阱（最重要，违反必踩坑）

1. **插件行条目 id 必须是 `dsh-mem0`**（`cordis.patch.yml`）。官方插件页按 profile
   条目 id 寻址插件的配置表单（settings 服务以条目 id 为命名空间）；0.1.7 首次启动还会把
   旧 `~/.dsh/settings.yaml` 的每个段一次性导入到**条目 id 与段名相同**的插件行——段名
   `dsh-mem0` 里的 8 个字段（baseUrl / apiKey / authType / defaultUserId /
   defaultAgentId / timeoutMs / announceToAgent / enabled）必须被 `Config` 接住，
   否则该段只会留在改名后的 `settings.yaml.imported` 里。改 `Config` 字段名时同步核这条。
2. **表单只暴露 volatile 字段**。settings 服务只把 `Config` 里 `.volatile()` 的字段编入
   表单；要官方表单能编辑就必须 volatile，要在配置层固定的字段不要 volatile。secret 字段
   **不要带 `.default('')`**：redaction 以「值是否 undefined」判定已配置，空串默认值会把
   「未配置」误报成「已配置」（上游惯例见 web-search-deepseek 的 apiKey）。
3. **`role('secret')` 的脱敏边界**。`apiKey` 在 schema 上标记 secret；describe 视图从
   value/base/user 三层剥离它，只给 `secrets:[{path,set}]` 标记。脱敏 walker 只沿
   object/dict/array 容器走——secret 放在 union/transform 里会被原样下发。新增敏感字段时
   保持 plain 字段 + `role('secret')`。
4. **客户端 bundle 格式**。`client/client.cjs` 是 `window.__ModuleLoader__.load({ id:
   'dsh-mem0', factory })` 格式的手写纯 JS（无 TS/JSX/import），factory 返回
   `{ apply, inject }`。只能 `require` 平台种子表里的模块：`react`、
   `@deepseek-ai/dsh-client-store`、`@deepseek-ai/dsh-client-ui-slots`、
   `@deepseek-ai/dsh-client-ui-primitives`、`@deepseek-ai/cordis` 等
   （`packages/client/web/src/platform.ts` 的 `PLATFORM_MODULES`）。浏览器半边
   `inject = ['slots', 'locale', 'configForms']`；`configForms` 是
   `@deepseek-ai/dsh-client-ui-settings` 浏览器端声明的服务。改它时保持该格式，别引入
   打包器依赖；超出种子表的 require 需要在 `package.json` 的 `dsh.client.external` 里
   声明并由动态行供给。
5. **浏览器端插槽契约跟随 dsh 版本**。配置页挂 `plugins.row.config`（keyed by
   `<包名>#<行id>`，行页由它获得 Configure 控件）；官方设置页的
   `settings.plugin.item` 插槽与 `installSettingsSection` 在 0.1.7 已删，别再引用。
   `client.cjs` 顶部的 require 与 `inject` 列表是冒烟的断言面，改动的回归保障是
   `pnpm smoke:client`。
6. **宿主侧不再碰 `webServer`/`settings` 服务**。配置读写全部经由 Loader 的 volatile
   引用与 `loader/volatile-update` 事件（类型来自 `@deepseek-ai/cordis-plugin-loader`
   的 type-only import，peer 里声明为 optional——插件也要能在无 Loader 的组合里跑）。
   如果将来要新增宿主路由：未声明在 `inject` 里的服务用 `ctx.get(name, false)`（loose）
   取，属性访问会直接抛错；执行写入的端点必须保持 loopback-only 围栏。

## mem0 服务端怪癖（写客户端时别踩）

- OSS 构建端点**无 `/v1` 前缀**（那是托管平台才有）；路径直接挂在 `baseUrl` 下。
- 服务端**默认把中文事实翻译成英文存储** → 中文语义搜索命中率低；提示词与测试里都建议
  英文关键词复搜。
- **搜索必须按标识符范围**（`user_id` 等），无过滤全局搜索被拒（400）。
- `GET /memories/{id}/history` 返回**裸数组**（不是 `{results:[]}`）。
- 批量删除 / reset 需要 admin 角色 + 明确 confirm 词。
- `mem0_get all=true` 跨标识符列举需要 admin key。
- **`POST /memories` 返回 `{"results":[]}` 不是失败**。服务端在事实抽取没产出、或判定该
  内容与既有记忆重复时，返回 **HTTP 200 + 空 results**。工具据此报 `created: 0`（正常
  分支，不是 `error`）——agent 看到 `added 0 memory/memories` 应理解为「没提取出新事实/
  判定重复」，别当写入失败重试。实测：同一正文连发两次，第二次即空；换全新正文即入库
  （与是否携带 `agent_id` 无关）。
- **`POST /search` 的 `limit` 被忽略**，要限条数得用 `top_k`（客户端发的就是 `top_k`，
  别改成 `limit`）。
- **首调用冷启动很慢**：mem0 依赖链（DeepSeek LLM / SiliconFlow embedder）冷启动时首次
  写入实测 76s 后 502、首次搜索 31s，热态分别 ~3s / ~0.4s。默认 `timeoutMs: 15000` 会
  在这种冷启动下误报超时——重试即可；要避免噪音可调大 `timeoutMs`。
- **序列化行（`_serialize_memory`）形状**：恒有 `hash` / `attributed_to`，新行有 `role`，
  `expiration_date` 常以 null 存在，且 `metadata` / `run_id` / `agent_id` / `created_at` /
  `updated_at` 在旧行上可能是 null。**工具输出 schema 必须容忍这些**（`MEMORY_ROW_SCHEMA`：
  `additionalProperties:true` + 可空字段用 `oneOf:[{type:'x'},{type:'null'}]`）——严格 schema
  会让整个读路径被 harness 的输出校验拦死（ToolOutputError「invalid output」）。回归保障：
  `pnpm smoke:tools`。注意 dsh-tools 的 JSON Schema 子集**不支持 `type` 数组**（如
  `['string','null']`），可空必须用 oneOf。
- **`score` 的形状在两条读路径上不同**：`GET /memories/{id}` **恒带 `score: null`**，
  而 `GET /memories`（列表）**完全没有该键**。所以「`score !== undefined`」不足以判可
  渲染——必须 `typeof score === 'number'`，否则按 id 读取会崩在
  render（`Cannot read properties of null (reading 'toFixed')`，表现为
  `ToolOutputError: output.render failed`）。schema 侧对应
  `score: oneOf:[number, null]`。回归保障：`pnpm smoke:tools`（该用例既验 schema
  **也真正调用 render**，因为 schema 通过而 render 崩也曾是一类漏网 bug）。

## 安全红线

- **凭据一律从环境变量读取，禁止硬编码**。真机脚本 `scripts/smoke.mjs` 和
  `migrate-user-id.mjs` 需要 `MEM0_API_KEY` + `MEM0_BASE_URL`（缺失即退出并提示）；
  `migrate-user-id.mjs` 是**重建+删除**的破坏性脚本，还额外要求 `MIGRATE_CONFIRM=yes`
  才执行。本地可用 `.env` 存放这些值（已在 `.gitignore`），**任何密钥都不进 git**。
- **历史密钥已清除**：2026-08 用 `git filter-repo` 重写过全部历史（旧 apiKey 与内网地址
  已替换为 `***REMOVED***`，reflog/gc 已深度清理）。旧密钥仍视为可能泄露——不要复用到别处，
  尽快在 mem0 dashboard 轮换。
- 破坏性工具（删除/清空）先展示目标再执行，工具描述里已写明 confirm 要求，别弱化。
- 工具输出不含 apiKey（`mem0_status` 只报认证状态）；表单响应也只携带 apiKey 的
  「已配置」标记（`role('secret')` 脱敏）。
- profile 的 `cordis.patch.yml` config 段里 apiKey 是明文（dsh 配置层的设计）；文件
  本身含密钥时注意权限与备份。

## 约定

- **`lib/` 提交进 git**：link 挂载直接跑它，克隆仓库即可用；改 `src/` 后必须 `pnpm build`
  并连同 `lib/` 一起提交，否则线上跑的是旧码。
- **依赖声明（0.1.7 规则）**：凡是运行时要和宿主共用实例的 `@deepseek-ai/*` 包
  （cordis、schemastery、dsh-*）都写进 `peerDependencies`（`dsh-*` 用 `^0.1.7-rc.2`，
  cordis / schemastery / cordis-plugin-loader 用 `*`），同一个包同时保留在
  `devDependencies` 供编译与独立测试。profile 默认 `autoInstallPeers:false` 不会安装
  peer，运行时由 dsh 的依赖解析层（拦截层 / link 根的 peer 占位）供给宿主自己的副本——
  所以**不要**把这类包写进 `dependencies`（会装出第二份实例）。type-only 的包
  （dsh-tools / dsh-util-values）只进 devDependencies；cordis-plugin-loader
  也只 type-only，但按上游惯例以 optional peer 声明（`ctx.on('loader/volatile-update')`
  的语义依赖，无 Loader 的组合里插件也要能跑）。**凡是 harness bundle 行的包（如
  `@deepseek-ai/dsh-tools` 的 `tools` 行）绝不能做依赖**：两份模块会产生两个
  `TOOL_RUNTIME_SCHEDULER` Symbol，每次工具调用报
  "Cannot read properties of undefined (reading 'prepare')"。这类包只能 `import type`
  （tools 定义已改为手写 JSON Schema，零运行时导入）。新增运行时导入时保持这条规则，并
  确认版本在 npm registry 可获取。
- 工具的注册与释放都挂在 `ctx.effect` 上（可逆副作用），新增面同样处理；`ctx.on` 的
  事件监听随插件上下文生命周期释放。
- 提示词文案（`MEM0_GUIDANCE`）是中文，面向模型；改配置默认值时同步改 README 表格。
- 宿主 `src/` 用 TS（`strict`）；浏览器 `client/client.cjs` 是纯 JS 且不参与类型检查——它的
  回归保障是 `pnpm smoke:client`，别绕过。
