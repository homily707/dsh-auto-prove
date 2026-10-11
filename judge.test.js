import assert from 'node:assert/strict'
import { test } from 'node:test'
import { setTimeout as delay } from 'node:timers/promises'
import { Config, apply } from './index.js'
import { completionEndpoint, listJudgeProviders, reasoningBody, resolveJudgeSettings } from './judge-route.js'

function fixture(overrides = {}) {
  const profile = { api: 'openai-completions', baseURL: 'https://judge.test/v1/', apiKeyEnv: 'JUDGE_KEY', models: [{ id: 'glm-5.3', name: 'GLM' }] }
  const directory = [{ provider: 'local', settingsNs: 'custom-llm-row', settingsPath: ['providers', 'local'], declared: true }]
  const routes = new Map()
  const hooks = new Map()
  const service = {
    llm: {
      listProviders: () => [{ id: 'local', name: 'Local' }],
      listConfigurableProviders: () => directory,
      listModels: async () => profile.models,
    },
    settings: { describe: () => [{ ns: 'custom-llm-row', value: { providers: { local: profile } } }] },
    credentials: { resolve: async () => ({ value: 'stored-key' }) },
    permissionPresets: { current: () => 'auto-prove' },
    webServer: { register: ({ path, handler }) => { routes.set(path, handler); return () => routes.delete(path) } },
  }
  const ctx = {
    get: (key) => service[key],
    on: (event, handler) => { hooks.set(event, handler) },
    inject: (_names, callback) => callback(ctx),
    effect: (callback) => callback(),
    webServer: service.webServer,
    logger: { debug() {}, info() {}, warn() {} },
  }
  const config = Config({ judgeProvider: 'local', judgeModel: 'glm-5.3', ...overrides })
  const request = { callId: 'call', toolName: 'bash', agent: { session: {
    id: 'session', header: { cwd: '/workspace' }, snapshotEvents: () => [],
  } } }
  const route = (path) => new Promise((resolve) => {
    let status
    routes.get(path)({ method: 'GET' }, { writeHead(code) { status = code }, end(body) { resolve({ status, body: JSON.parse(body) }) } })
  })
  apply(ctx, config)
  return { profile, service, directory, ctx, config, request, route, approve: (next, signal) => hooks.get('approval/request')({ ...request, signal }, next) }
}

test('provider catalog contains only metadata and marks incompatible routes unavailable', async () => {
  const f = fixture()
  f.service.llm.listProviders = () => [{ id: 'local', name: 'Local' }, { id: 'account', name: 'Account' }]
  const providers = await listJudgeProviders(f.ctx)
  assert.deepEqual(providers[0], { id: 'local', name: 'Local', models: [{ id: 'glm-5.3', name: 'GLM' }] })
  assert.match(providers[1].unavailableReason, /未公开/)
  assert.equal(JSON.stringify(providers).includes('stored-key'), false)
  assert.equal(JSON.stringify(providers).includes('JUDGE_KEY'), false)
  f.profile.api = 'anthropic-messages'
  assert.match((await listJudgeProviders(f.ctx))[0].unavailableReason, /Chat Completions/)
})

test('resolves live provider URL and credential; missing keys do not become anonymous requests', async () => {
  const f = fixture()
  assert.equal((await resolveJudgeSettings(f.ctx, f.config)).apiKey, 'stored-key')
  f.profile.baseURL = 'https://other.test/gateway/v1?route=judge'
  f.service.credentials.resolve = async () => ({ value: 'rotated-key' })
  const changed = await resolveJudgeSettings(f.ctx, f.config)
  assert.equal(changed.judgeEndpoint, 'https://other.test/gateway/v1/chat/completions?route=judge')
  assert.equal(changed.apiKey, 'rotated-key')
  f.service.credentials.resolve = async () => undefined
  await assert.rejects(resolveJudgeSettings(f.ctx, f.config), /API key unavailable/)
  delete f.profile.apiKeyEnv
  assert.equal((await resolveJudgeSettings(f.ctx, f.config)).apiKey, undefined)
})

test('URL joining preserves base paths without doubling chat/completions', () => {
  for (const base of ['https://judge.test/v1', 'https://judge.test/v1/', 'https://judge.test/v1/chat/completions/']) {
    assert.equal(completionEndpoint(base), 'https://judge.test/v1/chat/completions')
  }
  assert.throws(() => completionEndpoint('https://user:secret@judge.test/v1'), /内嵌凭据/)
})

test('manual effort and explicit off use the configured wire format', () => {
  assert.deepEqual(reasoningBody('high'), { reasoning_effort: 'high' })
  assert.deepEqual(reasoningBody('custom-effort'), { reasoning_effort: 'custom-effort' })
  assert.deepEqual(reasoningBody(''), {})
  assert.deepEqual(reasoningBody('off'), { reasoning_effort: 'none' })
  assert.deepEqual(reasoningBody('none', {}, 'glm-5.3'), { thinking: { type: 'disabled' } })
  assert.deepEqual(reasoningBody('off', { compat: { thinkingFormat: 'qwen' } }), { enable_thinking: false })
  assert.deepEqual(reasoningBody('off', { compat: { thinkingFormat: 'openai' } }, 'glm-5.3'), { reasoning_effort: 'none' })
})

test('approval remains direct non-streaming JSON HTTP, with provider credentials and configured effort', async (t) => {
  const f = fixture({ judgeEffort: 'off' })
  const calls = []
  t.mock.method(globalThis, 'fetch', async (url, init) => {
    calls.push({ url, init })
    return Response.json({ choices: [{ message: { content: '{"risk":"low","decision":"allow"}' } }] })
  })
  assert.equal(await f.approve(() => assert.fail('must not fall back')), 'allowed-once')
  assert.equal(calls[0].url, 'https://judge.test/v1/chat/completions')
  assert.equal(calls[0].init.headers.authorization, 'Bearer stored-key')
  const body = JSON.parse(calls[0].init.body)
  assert.equal(body.model, 'glm-5.3')
  assert.equal(body.stream, false)
  assert.equal(body.temperature, 0)
  assert.deepEqual(body.response_format, { type: 'json_object' })
  assert.deepEqual(body.thinking, { type: 'disabled' })
  assert.equal('reasoning_effort' in body, false)
  const diagnostic = await f.route('/auto-prove/last-error')
  assert.equal(diagnostic.body.status, 'allowed')
  assert.equal(diagnostic.body.route.effort, 'off')
  assert.equal(JSON.stringify(diagnostic).includes('stored-key'), false)
})

test('removed provider/model, invalid response and HTTP failure each fall back once', async (t) => {
  for (const mode of ['provider', 'model', 'response', 'http']) {
    const f = fixture()
    let requests = 0
    let fallbacks = 0
    t.mock.method(globalThis, 'fetch', async () => {
      requests++
      return mode === 'http' ? new Response('', { status: 401 }) : Response.json({ choices: [] })
    })
    if (mode === 'provider') f.service.llm.listProviders = () => []
    if (mode === 'model') f.profile.models = []
    assert.equal(await f.approve(() => { fallbacks++; return 'human' }), 'human')
    assert.equal(fallbacks, 1)
    assert.equal(requests, ['provider', 'model'].includes(mode) ? 0 : 1)
    assert.equal((await f.route('/auto-prove/last-error')).body.status, 'fallback')
    t.mock.restoreAll()
  }
})

test('a valid deny still rejects without invoking the human fallback', async (t) => {
  const f = fixture({ judgeEffort: 'high' })
  t.mock.method(globalThis, 'fetch', async (_url, init) => {
    assert.equal(JSON.parse(init.body).reasoning_effort, 'high')
    return Response.json({ choices: [{ message: { content: '{"risk":"high","decision":"deny","reason":"unsafe"}' } }] })
  })
  assert.equal(await f.approve(() => assert.fail('deny must not fall back')), 'rejected')
  assert.equal((await f.route('/auto-prove/last-error')).body.status, 'rejected')
})

test('timeout and cancellation cover provider resolution and never issue a late judge request', async (t) => {
  t.mock.method(globalThis, 'fetch', () => assert.fail('no HTTP after timeout/cancellation'))
  const f = fixture({ judgeTimeoutMs: 5 })
  f.service.credentials.resolve = async () => { await delay(30); return { value: 'late-key' } }
  assert.equal(await f.approve(() => 'human'), 'human')
  const g = fixture()
  g.service.credentials.resolve = f.service.credentials.resolve
  const controller = new AbortController()
  const approval = g.approve(() => assert.fail('cancelled request must not ask a human'), controller.signal)
  controller.abort()
  assert.equal(await approval, 'cancelled')
  await delay(40)
})

test('legacy configuration remains usable until migration; empty provider disables it', async () => {
  const f = fixture({ judgeProvider: '__legacy__', judgeEndpoint: 'https://old.test/chat/completions', judgeApiKeyEnv: '', judgeModel: 'legacy-model' })
  delete f.service.llm
  assert.equal((await resolveJudgeSettings(f.ctx, f.config)).judgeEndpoint, 'https://old.test/chat/completions')
  const blank = fixture({ judgeProvider: '' })
  await assert.rejects(resolveJudgeSettings(blank.ctx, blank.config), /provider is not configured/)
})
