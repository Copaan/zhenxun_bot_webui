const assert = require('node:assert/strict')
const fs = require('node:fs')
const path = require('node:path')
const vm = require('node:vm')
const { test } = require('node:test')
const babel = require('@babel/core')
const compiler = require('vue-template-compiler')
const root = path.resolve(__dirname, '..')
function load(source, mocks = {}) {
  const module = { exports: {} }
  const code = babel.transformSync(source, { babelrc: false, configFile: false, plugins: ['@babel/plugin-transform-modules-commonjs'] }).code
  vm.runInNewContext(code, { module, exports: module.exports, require: name => mocks[name], localStorage: { getItem: () => null }, setTimeout, clearTimeout })
  return module.exports
}
const routing = load(fs.readFileSync(path.join(root, 'src/utils/ai-routing.js'), 'utf8'))
function component(name) {
  const source = compiler.parseComponent(fs.readFileSync(path.join(root, name), 'utf8')).script.content
  const options = load(source, {
    '@/utils/ai-routing': routing,
    '@/utils/dirty-state': { clearDirtyState() {}, setDirtyState() {} },
    '@/utils/api-error': { apiErrorDetail: error => error.message, apiErrorIssues: () => [] },
    '@/utils/local-login': { localLogin: async () => {} },
  }).default
  const instance = { ...options.data(), $set: (o, k, v) => { o[k] = v }, $nextTick: f => f(), $message: { error() {}, success() {}, warning() {} } }
  for (const [key, fn] of Object.entries(options.methods)) instance[key] = fn.bind(instance)
  return instance
}
test('deletion recursively clears newly empty ancestors and their defaults', () => {
  const row = (name, ...targets) => ({ name, targets: targets.map(value => ({ value })) })
  const result = routing.removeRoutingGroup([row('leaf', 'P/model'), row('parent', 'leaf'), row('valid', 'parent', 'P/model'), row('draft')], { chat: 'parent', tts: null }, 'leaf')
  assert.deepEqual(Array.from(result.removed), ['leaf', 'parent'])
  assert.deepEqual(Array.from(result.tasks), ['chat'])
  assert.equal(result.rows[0].targets[0].value, 'P/model')
  assert.equal(result.rows[1].name, 'draft')
})
test('401 keeps unsaved model choices and supports local relogin', async () => {
  const i = component('src/views/ai/AIConfiguration.vue')
  i.sectionDrafts.default_models = { chat: 'Test/draft', embedding: null }
  i.putRequest = async () => { throw Object.assign(Error('expired'), { response: { status: 401 } }) }
  await assert.rejects(i.aiPut('/config', {}), /expired/)
  assert.equal(i.sessionExpired, true)
  i.loginPassword = 'private'
  await i.relogin()
  assert.equal(i.sectionDrafts.default_models.chat, 'Test/draft')
  assert.equal(i.loginPassword, '')
  assert.equal(i.sessionExpired, false)
})
test('late response from prior login cannot overwrite draft', async () => {
  const i = component('src/views/ai/AIConfiguration.vue')
  let resolve
  i.putRequest = () => new Promise(done => { resolve = done })
  const pending = i.aiPut('/config', {})
  i.aiEpoch++
  resolve({ suc: true })
  await assert.rejects(pending, /响应已过期/)
})
test('409 preserves route and default drafts', async () => {
  const i = component('src/views/ai/AIConfiguration.vue')
  i.sectionDrafts.default_models.chat = 'Test/draft'
  i.groupRows = [{ name: 'draft', targets: [{ value: 'Test/draft' }] }]
  i.putRequest = async () => { throw Object.assign(Error('conflict'), { response: { status: 409 } }) }
  await assert.rejects(i.aiPut('/config', {}), /conflict/)
  assert.equal(i.groupRows[0].name, 'draft')
  assert.equal(i.sectionDrafts.default_models.chat, 'Test/draft')
})
test('store defaults to automatic and reflects disabled parent', () => {
  const i = component('src/components/store/StoreTemplate.vue')
  assert.equal(i.downloadSource, 'auto')
  i.chatSwitches = { chatinter: false }
  assert.equal(i.chatEnabled({ runtime_module: 'zhenxun.plugins.chatinter.child' }), false)
  assert.equal(i.chatEnabled({ module: 'other' }), true)
})
test('stale switch refresh cannot replace a newer result', async () => {
  const i = component('src/components/store/StoreTemplate.vue')
  i.$root = { prefix: '/api' }
  const pending = []
  i.getRequest = () => new Promise(resolve => pending.push(resolve))
  const old = i.loadChatSwitches()
  const current = i.loadChatSwitches()
  assert.equal(i.switchLoading, true)
  pending[1]({ suc: true, data: { switches: { chatinter: false }, revision: 'new' } })
  await current
  pending[0]({ suc: true, data: { switches: { chatinter: true }, revision: 'old' } })
  await old
  assert.equal(i.switchRevision, 'new')
  assert.equal(i.chatSwitches.chatinter, false)
  assert.equal(i.switchLoading, false)
})
