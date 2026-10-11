/** Provider configuration is read on the Host; credentials never enter the catalog. */
export const LEGACY_PROVIDER = '__legacy__'

function services(ctx) {
  const llm = ctx.get('llm')
  const settings = ctx.get('settings')
  if (!llm || !settings) throw new Error('auto-prove: provider settings service unavailable')
  return { llm, settings }
}

/** Keep the provider's base path (including /v1) and any gateway query string. */
export function completionEndpoint(baseURL) {
  let url
  try { url = new URL(baseURL) } catch { throw new Error('提供商的 API 地址无效。') }
  if (!['http:', 'https:'].includes(url.protocol) || url.username || url.password || url.hash) {
    throw new Error('提供商的 API 地址必须是无内嵌凭据的 HTTP(S) 地址。')
  }
  url.pathname = url.pathname.replace(/\/+$/, '')
  if (!url.pathname.endsWith('/chat/completions')) url.pathname += '/chat/completions'
  return url.href
}

function providerProfile(entry, descriptors) {
  if (!entry) throw new Error('该提供商未公开可复用的配置。')
  const namespace = descriptors.find((row) => row.ns === entry.settingsNs)
  const profile = entry.settingsPath.reduce((value, key) => value?.[key], namespace?.value)
  if (!profile || profile.api !== 'openai-completions') {
    throw new Error('仅支持配置为 OpenAI Chat Completions 协议的提供商。')
  }
  if (typeof profile.baseURL !== 'string' || !profile.baseURL.trim()) {
    throw new Error('请先在提供商设置中填写 API 地址。')
  }
  // Built-in routes may rely on OAuth or provider-native auth discovery. A
  // declared custom route with no credential reference is an unauthenticated gateway.
  if (!profile.apiKeyEnv && !entry.declared) {
    throw new Error('该提供商未配置可复用的 API Key 引用，暂不支持账号登录鉴权。')
  }
  completionEndpoint(profile.baseURL)
  return profile
}

export async function listJudgeProviders(ctx) {
  const { llm, settings } = services(ctx)
  const entries = llm.listConfigurableProviders()
  const descriptors = settings.describe()
  return Promise.all(llm.listProviders().map(async ({ id, name }) => {
    try {
      providerProfile(entries.find((entry) => entry.provider === id), descriptors)
    } catch (error) {
      return { id, name, models: [], unavailableReason: error.message }
    }
    try {
      const models = (await llm.listModels(id)).map(({ id, name }) => ({ id, name }))
      return { id, name, models, ...(models.length ? {} : { unavailableReason: '该提供商没有可选模型。' }) }
    } catch {
      return { id, name, models: [], unavailableReason: '无法读取该提供商的模型列表。' }
    }
  }))
}

async function resolveKey(ctx, ref) {
  if (!ref) return undefined
  const credentials = ctx.get('credentials')
  const environment = ctx.get('launchEnvironment')
  const key = credentials
    ? (await credentials.resolve(ref))?.value
    : environment ? environment.get(ref)?.value : process.env[ref]
  if (typeof key !== 'string' || !key.trim() || /[^\x20-\x7e]/.test(key.trim())) {
    throw new Error(`auto-prove: API key unavailable or invalid for ${ref}`)
  }
  return key.trim()
}

/** Manual efforts go to reasoning_effort; off/none explicitly disable thinking. */
export function reasoningBody(effort, profile = {}, model = '') {
  if (!effort) return {}
  const off = effort === 'off' || effort === 'none'
  const configuredModel = profile.models?.find((entry) => entry.id === model) ?? profile.modelOverrides?.[model]
  const compat = { ...profile.compat, ...configuredModel?.compat }
  const format = compat.thinkingFormat ?? (
    /^(glm|deepseek)[-/.]/i.test(model) ? 'deepseek' : 'openai'
  )
  const enabledEffort = { reasoning_effort: effort }
  switch (format) {
    case 'deepseek':
    case 'zai':
      return { thinking: { type: off ? 'disabled' : 'enabled' }, ...off ? {} : enabledEffort }
    case 'qwen':
      return { enable_thinking: !off, ...off ? {} : enabledEffort }
    case 'qwen-chat-template':
      return { chat_template_kwargs: { enable_thinking: !off, preserve_thinking: true }, ...off ? {} : enabledEffort }
    case 'openrouter':
      return { reasoning: { effort: off ? 'none' : effort } }
    case 'together':
      return { reasoning: { enabled: !off }, ...off ? {} : enabledEffort }
    case 'string-thinking':
      return { thinking: off ? 'none' : effort }
    case 'openai':
      return { reasoning_effort: off ? 'none' : effort }
    default:
      throw new Error(`auto-prove: unsupported thinking format: ${format}`)
  }
}

export async function resolveJudgeSettings(ctx, config) {
  const judgeProvider = config.judgeProvider.get().trim()
  const judgeModel = config.judgeModel.get().trim()
  const judgeEffort = config.judgeEffort.get().trim()
  if (!judgeModel) throw new Error('auto-prove: judge model is not configured')
  if (judgeProvider === LEGACY_PROVIDER) {
    const judgeEndpoint = config.judgeEndpoint.get().trim()
    if (!judgeEndpoint) throw new Error('auto-prove: judge endpoint is not configured')
    const ref = config.judgeApiKeyEnv.get().trim()
    return {
      judgeProvider, judgeModel, judgeEffort, judgeEndpoint,
      // Preserve the old environment-only, optional-header behavior until migration.
      apiKey: ref ? process.env[ref] : undefined,
      reasoning: reasoningBody(judgeEffort, {}, judgeModel),
    }
  }
  if (!judgeProvider) throw new Error('auto-prove: judge provider is not configured')
  const { llm, settings } = services(ctx)
  if (!llm.listProviders().some((entry) => entry.id === judgeProvider)) {
    throw new Error('auto-prove: selected provider is no longer available')
  }
  const entry = llm.listConfigurableProviders().find((entry) => entry.provider === judgeProvider)
  const profile = providerProfile(entry, settings.describe())
  const models = await llm.listModels(judgeProvider)
  if (!models.some((entry) => entry.id === judgeModel)) {
    throw new Error('auto-prove: selected model is no longer available from this provider')
  }
  return {
    judgeProvider, judgeModel, judgeEffort,
    judgeEndpoint: completionEndpoint(profile.baseURL),
    apiKey: await resolveKey(ctx, profile.apiKeyEnv),
    reasoning: reasoningBody(judgeEffort, profile, judgeModel),
  }
}

/** Diagnostic routes must never expose the resolved credential or URL query. */
export function diagnosticRoute(settings) {
  const url = new URL(settings.judgeEndpoint)
  return {
    provider: settings.judgeProvider,
    endpoint: `${url.origin}${url.pathname}`,
    model: settings.judgeModel,
    effort: settings.judgeEffort,
  }
}
