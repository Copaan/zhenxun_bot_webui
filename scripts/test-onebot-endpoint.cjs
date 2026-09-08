const assert = require('node:assert/strict')
const fs = require('node:fs')
const path = require('node:path')
const vm = require('node:vm')
const { test } = require('node:test')
const babel = require('@babel/core')
const compiler = require('vue-template-compiler')

const root = path.resolve(__dirname, '..')
const component = compiler.parseComponent(fs.readFileSync(path.join(root, 'src/views/protocol/ProtocolSetting.vue'), 'utf8'))
const code = babel.transformSync(component.script.content, {
  babelrc: false, configFile: false, plugins: ['@babel/plugin-transform-modules-commonjs'],
}).code
function harness() {
  const dirty = new Map()
  const errors = []
  const mocks = {
    '@/utils/dirty-state': { setDirtyState: (key, value) => dirty.set(key, value), clearDirtyState: key => dirty.delete(key) },
    '@/utils/api-error': { apiErrorDetail: (_error, fallback) => fallback },
    '@/utils/apply-result': { handleApplyResult: async () => {} },
  }
  const module = { exports: {} }
  vm.runInNewContext(code, { module, exports: module.exports, require: name => mocks[name] || {} })
  const options = module.exports.default
  const instance = { ...options.data(), $root: { prefix: '/api' }, $message: { error: e => errors.push(e) } }
  for (const [name, fn] of Object.entries(options.methods)) instance[name] = fn.bind(instance)
  for (const [name, fn] of Object.entries(options.computed)) Object.defineProperty(instance, name, { get: () => fn.call(instance) })
  instance.originalProtocol = instance.protocolSnapshot()
  instance.configuration.revision = 'first'
  return { instance, errors, dirty, options }
}
const pending = () => {
  let resolve, reject
  const promise = new Promise((a, b) => { resolve = a; reject = b })
  return { promise, resolve, reject }
}
const status = host => ({ suc: true, data: { onebot_endpoint: { url: `wss://${host}:8766/onebot/v11/ws`, code: 'tls_certificate_identity_ok', host_source: 'configured' } } })

test('configuration endpoint is never a fallback for unconfirmed runtime', () => {
  const { instance: i } = harness()
  i.configuration.onebot.endpoint = status('old.example.com').data.onebot_endpoint
  assert.equal(i.endpoint.url, undefined)
  assert.equal(i.canCopyEndpoint, false)
})
test('newest status wins even if older request finishes last', async () => {
  const { instance: i } = harness()
  const old = pending(), current = pending()
  i.getRequest = () => old.promise
  const a = i.loadStatus()
  i.getRequest = () => current.promise
  const b = i.loadStatus()
  current.resolve(status('new.example.com')); await b
  old.resolve(status('old.example.com')); await a
  assert.match(i.endpoint.url, /new\.example/)
})
test('failed status becomes unconfirmed, then a later refresh recovers', async () => {
  const { instance: i } = harness()
  i.getRequest = async () => status('new.example.com')
  await i.loadStatus()
  i.getRequest = async () => { throw Error('network') }
  await i.loadStatus()
  assert.equal(i.canCopyEndpoint, false)
  i.getRequest = async () => status('new.example.com')
  await i.loadStatus()
  assert.equal(i.canCopyEndpoint, true)
})
test('save updates only target address and prevents duplicate submission', async () => {
  const { instance: i } = harness()
  i.statusConfirmed = true; i.status = status('old.example.com').data
  i.onebotHost = 'new.example.com'
  const saved = pending(); let calls = 0
  i.putRequest = () => { calls++; return saved.promise }
  const save = i.saveConfiguration()
  await i.saveConfiguration()
  assert.equal(calls, 1)
  saved.resolve({ suc: true, data: { revision: 'second', onebot: { configured_endpoint: { url: 'wss://new.example.com:8766/onebot/v11/ws', pending_restart: true } } } })
  await save
  assert.equal(i.savedEndpoint.pending_restart, true)
  assert.match(i.endpoint.url, /old\.example/)
  assert.equal(i.protocolDirty, false)
})
for (const failure of ['409', 'network', 'apply_failed', 'failed_result']) test(`${failure} preserves draft`, async () => {
  const { instance: i } = harness()
  i.onebotHost = 'new.example.com'
  i.putRequest = async () => { if (failure === 'failed_result') return { suc: true, data: { apply_mode: 'failed' } }; if (failure === 'apply_failed') return { suc: false }; throw Error(failure) }
  await i.saveConfiguration()
  assert.equal(i.onebotHost, 'new.example.com')
  assert.equal(i.protocolDirty, true)
  assert.equal(i.configuration.revision, 'first')
})
test('an edit during save remains dirty', async () => {
  const { instance: i } = harness()
  const saved = pending()
  i.onebotHost = 'submitted.example.com'
  i.putRequest = () => saved.promise
  const save = i.saveConfiguration()
  i.onebotHost = 'later.example.com'
  saved.resolve({ suc: true, data: { revision: 'second' } }); await save
  assert.equal(i.protocolDirty, true)
})
test('late configuration cannot replace a changed draft', async () => {
  const { instance: i } = harness()
  const loaded = pending()
  i.getRequest = () => loaded.promise
  const load = i.loadConfiguration()
  i.onebotHost = 'draft.example.com'
  loaded.resolve({ suc: true, data: {} }); await load
  assert.equal(i.onebotHost, 'draft.example.com')
})
test('latest configuration request wins', async () => {
  const { instance: i } = harness()
  const old = pending()
  i.getRequest = () => old.promise
  const load = i.loadConfiguration()
  i.getRequest = async () => ({ suc: true, data: { revision: 'new', onebot: { reverse_ws_host: 'new.example.com' }, qq: {} } })
  await i.loadConfiguration()
  old.resolve({ suc: true, data: {} }); await load
  assert.equal(i.onebotHost, 'new.example.com')
  assert.equal(i.configuration.revision, 'new')
})
test('mismatch, expired and unreadable certificates disable copy', () => {
  const { instance: i } = harness()
  i.statusConfirmed = true
  for (const code of ['tls_certificate_name_mismatch', 'tls_certificate_time_invalid', 'tls_certificate_unavailable']) {
    i.status.onebot_endpoint = { url: 'wss://example.com:8766/onebot/v11/ws', code }
    assert.equal(i.canCopyEndpoint, false)
    assert.ok(i.onebotEndpointWarning)
  }
})

if (process.argv.includes('--serve')) {
  const http = require('node:http')
  const sass = require('sass')
  const css = sass.compileString(component.styles[0].content, { logger: sass.Logger.silent }).css
  const mocks = `const require = name => ({
    '@/utils/dirty-state': { setDirtyState() {}, clearDirtyState() {} },
    '@/utils/api-error': { apiErrorDetail: (error, fallback) => fallback },
    '@/utils/apply-result': { handleApplyResult: async () => {} },
  }[name] || {}); const module = { exports: {} }; const exports = module.exports;`
  const script = `${mocks}\n${code}\nconst options = module.exports.default;
    options.template = ${JSON.stringify(component.template.content)};
    const endpoint = { url: 'wss://127.0.0.1:8766/onebot/v11/ws', code: 'tls_certificate_name_mismatch', host_source: 'page_host', certificate_wildcards: ['*.example.org'], certificate_candidates: [
      { connection_host: 'bot.example.com', url: 'wss://bot.example.com:8766/onebot/v11/ws', certificate_valid_now: true, certificate_name_match: true },
      { connection_host: 'a-very-long-domain-name-for-responsive-testing.example.com', url: 'wss://a-very-long-domain-name-for-responsive-testing.example.com:8766/onebot/v11/ws', certificate_valid_now: true, certificate_name_match: true },
    ] };
    window.fixtureCalls = []; window.failSave = false;
    Vue.prototype.getRequest = async path => { window.fixtureCalls.push({ method: 'GET', path }); return { suc: true, data: path.endsWith('/status') ? { onebot_endpoint: endpoint, connections: [], qq_bots: [] } : { revision: 'one', onebot: { reverse_ws_host: '', configured_endpoint: { url: endpoint.url, pending_restart: false } }, qq: { enabled: false, bots: [] } } } };
    Vue.prototype.putRequest = async (path, payload) => { window.fixtureCalls.push({ method: 'PUT', path, payload }); if (window.failSave) throw Error('409'); return { suc: true, data: { revision: 'two', onebot: { configured_endpoint: { url: 'wss://' + payload.onebot_reverse_ws_host + ':8766/onebot/v11/ws', pending_restart: true } } } } };
    const data = options.data; options.data = function() { return { ...data(), selectedPlatform: 'onebot_v11' } };
    new Vue({ el: '#app', data: { prefix: '/api' }, render: h => h(options) });`
  const server = http.createServer((req, res) => {
    const routes = { '/vue.js': 'node_modules/vue/dist/vue.js', '/element.js': 'node_modules/element-ui/lib/index.js', '/element.css': 'node_modules/element-ui/lib/theme-chalk/index.css', '/fonts/element-icons.woff': 'node_modules/element-ui/lib/theme-chalk/fonts/element-icons.woff', '/fonts/element-icons.ttf': 'node_modules/element-ui/lib/theme-chalk/fonts/element-icons.ttf' }
    if (routes[req.url]) { res.setHeader('Content-Type', req.url.endsWith('.css') ? 'text/css' : req.url.endsWith('.js') ? 'application/javascript' : 'application/octet-stream'); res.end(fs.readFileSync(path.join(root, routes[req.url]))); return }
    if (req.url === '/component.js') { res.setHeader('Content-Type', 'application/javascript'); res.end(script); return }
    res.setHeader('Content-Type', 'text/html; charset=utf-8')
    res.end(`<!doctype html><html><head><meta name="viewport" content="width=device-width,initial-scale=1"><link rel="stylesheet" href="/element.css"><style>:root { --text-color: #303133; --text-color-secondary:#606266; --border-color-light:#dcdfe6; --bg-color:#fff; --bg-color-secondary:#fafafa; --primary-color:#087f96; } * { box-sizing:border-box; } body { margin:0; font-family: sans-serif; } #app { max-width:1100px; margin:auto; } ${css}</style></head><body><div id="app"></div><script src="/vue.js"></script><script src="/element.js"></script><script src="/component.js"></script></body></html>`)
  })
  server.listen(0, '127.0.0.1', () => console.log('BROWSER_FIXTURE_URL=http://127.0.0.1:' + server.address().port))
  const close = () => server.close(() => process.exit(0))
  process.on('SIGINT', close); process.on('SIGTERM', close)
  process.stdin.resume(); process.stdin.on('data', close)
}
