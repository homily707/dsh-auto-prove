# dsh-auto-prove

[DeepSeek Harness](https://github.com/deepseek-ai/deepseek-harness) 插件：新增 **Auto Prove（自动允许）** 权限模式。

## 行为

基座完全复用 Workspace Write（`sandbox: workspace-write` + `approval: ask`），只加一件事：

**每次需要人工确认的请求，先发给 LLM 判定。**

- 不拦截所有 tool 调用：插件只挂在 `approval/request` waterfall 上，只有原本会弹人工确认的请求（沙箱升级、越界写等）才进入判定。
- 判定逻辑复用 `dsh-experimental-auto-review`（vendored）：固定 `REVIEW_POLICY`、严格 risk/decision JSON 协议解析。
- 判定通道：复用已有 provider 的地址和 API Key，仍直接 `fetch` 调用 Chat Completions（非流式、`temperature: 0`、`response_format: json_object`）；Harness 的 LLM 服务只用于读取提供商和模型目录，不用于生成。判定上下文是紧凑快照：工具名、脱敏参数、审批原因、沙箱升级事实、工作区根目录和最近四条可信用户消息。
- 结果映射：`allow` → 自动放行（`allowed-once`）；`deny` → 直接拒绝（`rejected`）；判定失败 / 超时 / 解析异常 → 回落原有人工确认弹窗。

`tools/pre-execute` / `tools/result` 仅用于记录和清理 pending 调用的 name / arguments（判定上下文），不做任何拦截。记录监听器前置，确保下游 hook 请求审批时已经有调用上下文；权限识别只在审批入口进行。

## 盾牌图标

权限菜单行、访问模式触发按钮、设置页 Permission 行按钮、`/permission` 选项行上的盾牌图标复用 dsh-auto-mode 的视觉资产（同 SVG + CSS mask，client DOM 装饰），不依赖 auto-mode 运行时。

## 安装

```sh
dsh plugin --profile web add github:homily707/dsh-auto-prove
```

桌面端将 `web` 换成 `desktop`。安装后重启对应的 Harness 应用。

本地开发可先克隆仓库，再通过 `dsh plugin --profile <profile> add link:/path/to/dsh-auto-prove` 链接安装。

会话切换到 Auto Prove 模式（或 profile patch 中 `permission` 行 `config.defaultPreset: auto-prove`）后生效。

Host 使用真实的 `@deepseek-ai/schemastery` schema，依赖通过声明的 peer 由 Harness 解析。缺少依赖时会明确加载失败，不再使用无法通过 Cordis 校验的假 schema。权限菜单来自 bundle patch，菜单出现不等于 Host 审批监听器已加载；加载成功会记录 `auto-prove: approval reviewer registered`。

## 配置（设置页「自动允许」分区，volatile 字段持久化在 profile patch 的 `auto-prove` 行 config）

| 字段 | 默认 | 说明 |
| --- | --- | --- |
| `judgeProvider` | `__legacy__` | 已有 provider 下拉选择；空字符串禁用判定。默认哨兵仅用于旧配置迁移 |
| `judgeModel` | 空 | 所选 provider 的模型下拉选择；切换 provider 后清空，需重新选择 |
| `judgeEffort` | `low` | 手动输入 `low`、`high`、`max` 等接口支持的值；`off` / `none` 关闭思考；空字符串不发送思考参数 |
| `judgeTimeoutMs` | `30000` | 超时（毫秒）后回落人工 |

首版支持 provider 配置中明确声明 `api: openai-completions` 和 `baseURL` 的路由。其他协议、只使用适配器内置默认地址的路由、账号登录鉴权等不兼容项在列表中禁用并说明原因；可通过「刷新列表」读取最新提供商和模型。`baseURL` 保留原有路径并追加 `/chat/completions`，已有完整路径时不重复追加。

每次审批重新读取 provider 配置和 `credentials.resolve(apiKeyEnv)`，地址、密钥变更自动生效。缺失凭据服务时使用 Harness 启动环境；自定义路由没有密钥引用时允许无鉴权网关。密钥仅留在 Host，不进入列表、诊断或 auto-prove 设置。选中的 provider / 模型被删除、密钥缺失或接口失败时回落人工，不改用其他 provider 或旧端点。

effort 为手动输入，不受模型目录的 effort 枚举限制，接口不支持时按普通请求失败回落人工。一般接口将输入发送为 `reasoning_effort`，`off` / `none` 映射为 `none`；GLM / DeepSeek 模型使用 `thinking.type: disabled` 关闭思考。provider 或模型的 `compat.thinkingFormat` 优先于模型名称识别，支持 `openai`、`deepseek`、`zai`、`qwen`、`qwen-chat-template`、`openrouter`、`together`、`string-thinking`；其他格式会明确失败并回落人工。

旧字段 `judgeEndpoint` / `judgeApiKeyEnv`（默认均为空）继续保留，但不再显示为输入框。未选择 provider 时，已有旧配置继续生效；首次选择 provider 和模型并保存即完成迁移。全新安装没有旧端点和模型，因此仍需配置后才会判定。

设置页将本次编辑通过一次原子更新保存；服务端拒绝时保留草稿。关闭或卸载插件只释放插件自己的订阅和图标观察器，不销毁共享设置表单。

## 审批诊断

`GET /auto-prove/last-error` 保留原 URL，返回本插件最近一次真实审批状态更新（全局一条，含 sessionId / callId / toolName）：

- `idle`：监听器尚未收到审批请求，`ok: null`。
- `skipped`：会话及父会话均未选中目标 preset，附 `reason`，`ok: null`。
- `reviewing`：已进入审查流程，`ok: null`。
- `allowed` / `rejected`：LLM 已返回有效决定，附路由和风险；两者的 `ok` 都是 `true`，表示审查成功完成。
- `fallback`：权限识别、服务获取、快照或模型审查失败，附 `stage` / `error`，`ok: false`；随后交给人工审批。
- `cancelled`：原审批请求已取消，`ok: null`，不再转人工审批。

权限投影异常不再被吞掉；直接 HTTP 调用失败会记录状态码。诊断包含 provider / model / effort 和不含查询参数的端点地址。诊断路由只依赖 webServer，LLM 服务缺失时仍能读取状态。新请求会覆盖旧记录，不能把它当作审批历史。

`GET /auto-prove/providers` 返回已有 provider 及模型目录；不兼容项附 `unavailableReason`，不返回凭据。

`GET /auto-prove/selftest` 仅是模型探针，会发送当前会话上下文和合成动作到判定模型；它与真实审批共享快照、路由、超时和解析代码，但不检查权限选择或审批 waterfall，返回 `approvalHookChecked: false`。它不修改真实审批诊断记录，也不能用于证明审批钩子已生效。

## 与旧版（old-dsh-auto-prove）的差异

- 移除「额外可写路径」功能（全局白名单 / 每工作区配置 / fs 放行 / 设置页路径编辑）。
- 判定通道与旧版一致：直连 OpenAI 兼容端点 + `response_format: json_object`；判定提示词沿用 auto-review 的固定策略与严格解析协议，判定上下文是紧凑快照（工具名、脱敏参数、审批原因、沙箱升级事实、工作区根、最近四条可信用户消息），不再是 auto-review 的五段快照。

## 开发

需要 Node.js 22 或更高版本。安装依赖后运行后端回归测试：

```sh
npm install
npm test
```

当前对接的 Harness 接口以 `0.2.0-rc.2` 为基准。

## 许可证

[MIT](./LICENSE)。审查策略与决策解析包含来自 DeepSeek Harness 的代码，保留 DeepSeek 的版权声明。
