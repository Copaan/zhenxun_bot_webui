const assert = require('node:assert/strict')
const fs = require('node:fs')
const path = require('node:path')
const vm = require('node:vm')
const { test } = require('node:test')
const babel = require('@babel/core')
const compiler = require('vue-template-compiler')
const source = compiler.parseComponent(fs.readFileSync(path.join(__dirname, '../src/views/protocol/ProtocolSetting.vue'), 'utf8')).script.content
function deferred() { let resolve; const promise = new Promise(done => { resolve = done }); return { promise, resolve } }
const tick = () => new Promise(done => setImmediate(done))
function component(qr = async () => 'data:image/png;base64,fixture') {
  const exports = {}
  const mocks = {
    qrcode: { toDataURL: qr },
    '@/utils/apply-result': { notifyRestartStatusChanged() {} },
    '@/utils/api-error': { apiErrorDetail: (error, fallback) => error.message || fallback },
  }
  const code = babel.transformSync(source, { babelrc: false, configFile: false, plugins: ['@babel/plugin-transform-modules-commonjs', 'babel-plugin-dynamic-import-node'] }).code
  const timers = new Map()
  vm.runInNewContext(code, { exports, require: name => mocks[name] || {}, window: { setTimeout: fn => { const id = timers.size + 1; timers.set(id, fn); return id }, clearTimeout: id => timers.delete(id) } })
  const options = exports.default
  const instance = options.data()
  Object.entries(options.methods).forEach(([name, method]) => { instance[name] = method.bind(instance) })
  instance.$root = { prefix: '/api' }
  instance.$message = { info() {} }
  instance.loadConfiguration = async () => {}
  instance.deleteRequest = async () => ({ suc: true, data: { status: 'cancelled' } })
  instance.timers = timers
  return instance
}
const started = id => ({ suc: true, data: { registration_id: id, qr_url: 'https://q.qq.com/fixture', expires_in: 600 } })
test('late creation after close is cancelled without reopening', async () => {
  const i = component(); const result = deferred(); const deleted = []
  i.postRequest = () => result.promise
  i.deleteRequest = async url => { deleted.push(url); return { data: { status: 'cancelled' } } }
  const starting = i.startRegistration(); await tick()
  await i.closeRegistration()
  result.resolve(started('old')); await starting
  assert.equal(i.registration.visible, false)
  assert.equal(i.registration.qrDataUrl, '')
  assert.equal(i.timers.size, 0)
  assert.ok(deleted.some(url => url.endsWith('/old')))
})
test('late QR rendering cannot replace a new session', async () => {
  const first = deferred(); let count = 0
  const i = component(() => ++count === 1 ? first.promise : Promise.resolve('new-qr'))
  let id = 0; i.postRequest = async () => started(String(++id))
  const old = i.startRegistration(); await tick()
  await i.closeRegistration(); await i.startRegistration()
  first.resolve('old-qr'); await old
  assert.equal(i.registration.registrationId, '2')
  assert.equal(i.registration.qrDataUrl, 'new-qr')
})
test('late poll error cannot damage a newer QR', async () => {
  const i = component(); i.postRequest = async () => started('first'); await i.startRegistration()
  const waiting = deferred(); i.postRequest = () => waiting.promise
  const poll = i.pollRegistration()
  await i.closeRegistration(); i.postRequest = async () => started('second'); await i.startRegistration()
  waiting.resolve({ suc: false, info: 'old failure' }); await poll
  assert.equal(i.registration.registrationId, 'second')
  assert.equal(i.registration.status, 'pending')
})
test('expiration clears QR and does not schedule more polling', async () => {
  const i = component(); i.postRequest = async () => started('first'); await i.startRegistration()
  i.registration.expiresAt = 1; await i.pollRegistration()
  assert.equal(i.registration.status, 'expired')
  assert.equal(i.registration.qrDataUrl, '')
  assert.equal(i.timers.size, 0)
})
test('duplicate poll is suppressed and successful result applied once', async () => {
  const i = component(); i.postRequest = async () => started('first'); await i.startRegistration()
  const result = deferred(); let calls = 0; let loads = 0
  i.loadConfiguration = async () => { loads++ }
  i.postRequest = () => { calls++; return result.promise }
  const first = i.pollRegistration(); await i.pollRegistration()
  result.resolve({ suc: true, data: { status: 'completed', revision: 'saved' } }); await first
  assert.equal(calls, 1); assert.equal(loads, 1)
  assert.equal(i.configuration.revision, 'saved')
  assert.equal(i.registration.registrationId, '')
})
test('cancel response reports a configuration already committed', async () => {
  const i = component(); i.postRequest = async () => started('first'); await i.startRegistration()
  i.deleteRequest = async () => ({ data: { status: 'completed', revision: 'saved' } })
  await i.closeRegistration()
  assert.equal(i.registration.visible, false)
  assert.equal(i.registration.status, 'completed')
  assert.equal(i.configuration.revision, 'saved')
})
test('authentication errors clear the displayed QR without creating a replacement', async () => {
  const i = component(); i.postRequest = async () => started('first'); await i.startRegistration()
  i.postRequest = async () => { throw Object.assign(Error('login expired'), { response: { status: 401 } }) }
  await i.pollRegistration()
  assert.equal(i.registration.status, 'error')
  assert.equal(i.registration.qrDataUrl, '')
  assert.equal(i.timers.size, 0)
})
