const assert = require('node:assert/strict')
const fs = require('node:fs')
const path = require('node:path')
const vm = require('node:vm')
const { test } = require('node:test')
const babel = require('@babel/core')
const { sha256 } = require('js-sha256')
const compiler = require('vue-template-compiler')
const root = path.resolve(__dirname, '..')

function load(source, mocks) {
  const module = { exports: {} }
  const code = babel.transformSync(source, { babelrc: false, configFile: false, plugins: ['@babel/plugin-transform-modules-commonjs'] }).code
  vm.runInNewContext(code, { module, exports: module.exports, require: name => mocks[name], AbortController, ArrayBuffer, setTimeout, clearTimeout })
  return module.exports
}
const service = load(fs.readFileSync(path.join(root, 'src/utils/migration.js'), 'utf8'), {
  axios: {}, './api': {}, 'js-sha256': { sha256 },
})
function file(bytes) { return { name: 'old.zx', size: bytes.length, slice: (a, b) => new Blob([bytes.subarray(a, b)]) } }

test('sequential chunks hash once despite retry; no whole-file arrayBuffer', async () => {
  const bytes = Buffer.alloc(service.CHUNK_SIZE + 3, 31)
  const offsets = []; let seal; let attempts = 0
  await service.uploadMigration(file(bytes), { request: async (url, options) => {
    if (url === '/uploads') return { id: 'one', total: bytes.length, stage: 'uploading' }
    if (url.endsWith('/chunks')) {
      offsets.push(options.params.offset)
      assert.equal(options.params.sha256, sha256(options.data))
      if (++attempts === 1) throw Error('network')
      return {}
    }
    seal = options.data.sha256
    return { stage: 'sealed' }
  } })
  assert.deepEqual(offsets, [0, 0, service.CHUNK_SIZE])
  assert.equal(seal, sha256(bytes))
})

test('409 is not retried and staged upload identity is retained', async () => {
  let attempts = 0, identity
  await assert.rejects(service.uploadMigration(file(Buffer.from('data')), {
    onCreated: value => { identity = value }, request: async (url) => {
      if (url === '/uploads') return { id: 'one', total: 4, stage: 'uploading' }
      attempts++; throw Object.assign(Error('conflict'), { response: { status: 409 } })
    },
  }), /conflict/)
  assert.equal(identity, 'one'); assert.equal(attempts, 1)
})

test('sealed resume verifies entire selected file without uploading again', async () => {
  const requests = []
  await assert.rejects(service.uploadMigration(file(Buffer.from('different')), {
    uploadId: 'one', request: async url => {
      requests.push(url)
      return { id: 'one', total: 9, stage: 'sealed', sha256: sha256('old-value') }
    },
  }), /file_changed/)
  assert.deepEqual(requests, ['/uploads/one'])
})

function component(request, login = async () => {}) {
  const source = compiler.parseComponent(fs.readFileSync(path.join(root, 'src/views/about/MigrationPanel.vue'), 'utf8')).script.content
  const options = load(source, {
    '@/utils/migration': { ...service, migrationRequest: request, migrationLogin: login },
    '@/utils/dirty-state': { clearDirtyState() {}, setDirtyState() {} },
  }).default
  const instance = { ...options.data(), capability: { restore: false, upload: true }, sequence: 0, readSequence: 0 }
  for (const [name, fn] of Object.entries(options.methods)) instance[name] = fn.bind(instance)
  return instance
}

test('late inspection cannot overwrite a newer selection', async () => {
  let resolve
  const i = component(() => new Promise(done => { resolve = done }))
  i.discoveredPath = 'old.zx'
  const operation = i.inspect(1)
  i.clearSelection(); i.discoveredPath = 'new.zx'
  resolve({ package_id: 'old' }); await operation
  assert.equal(i.inspection, null); assert.equal(i.discoveredPath, 'new.zx')
})

test('failed inspection preserves package and password draft', async () => {
  const i = component(async () => { throw Object.assign(Error('changed'), { response: { status: 409, data: { detail: 'migration_archive_changed' } } }) })
  i.discoveredPath = 'old.zx'; i.password = 'private'
  await i.inspect(1)
  assert.equal(i.discoveredPath, 'old.zx'); assert.equal(i.password, 'private')
  assert.equal(i.error, 'migration_archive_changed'); assert.equal(i.busy, false)
})

test('maintenance blocks inspection without clearing the draft', async () => {
  const i = component(() => assert.fail('maintenance must not dispatch inspection'))
  i.capability = { maintenance: true, upload: false }
  i.discoveredPath = 'old.zx'; i.password = 'private'
  await i.inspect(1)
  assert.equal(i.discoveredPath, 'old.zx'); assert.equal(i.password, 'private')
  assert.equal(i.busy, false)
})

test('recovery credentials encode special characters and IPv6 without changing target', () => {
  const database = service.recoveryDatabase({ credentials_required: true, engine: 'postgres', target: { host: '::1', port: 5432, database: 'target' } }, 'limited@role', 'secret:/?#')
  const parsed = new URL(database.target_url)
  assert.equal(parsed.hostname, '[::1]')
  assert.equal(decodeURIComponent(parsed.username), 'limited@role')
  assert.equal(decodeURIComponent(parsed.password), 'secret:/?#')
  assert.equal(parsed.pathname, '/target')
  assert.equal(JSON.stringify(service.recoveryDatabase({ credentials_required: false }, '', '')), '{}')
})

test('failed reauthorization preserves credentials and confirmation; success clears them', async () => {
  let fail = true
  const i = component(async () => {
    if (fail) throw Object.assign(Error('conflict'), { response: { status: 409, data: { detail: 'migration_database_target_changed' } } })
    return { credentials_received: true }
  })
  i.refresh = async () => {}
  i.recoveryRequirements = { task_id: 'one', credentials_required: false }
  i.recoveryConfirmed = true; i.recoveryPassword = 'private'; i.recoveryVisible = true
  await i.reauthorize()
  assert.equal(i.recoveryPassword, 'private'); assert.equal(i.recoveryConfirmed, true)
  assert.equal(i.recoveryError, 'migration_database_target_changed')
  fail = false; await i.reauthorize()
  assert.equal(i.recoveryPassword, ''); assert.equal(i.recoveryConfirmed, false)
  assert.equal(i.recoveryVisible, false)
})

function wizard(request, login = async () => {}) {
  const source = compiler.parseComponent(fs.readFileSync(path.join(root, 'src/views/about/MigrationRestoreWizard.vue'), 'utf8')).script.content
  const options = load(source, {
    '@/utils/migration': { ...service, migrationRequest: request, migrationLogin: login },
    '@/utils/dirty-state': { clearDirtyState() {}, setDirtyState() {} },
  }).default
  const instance = { ...options.data(), uploadId: 'upload', sequence: 0, available: true, engine: 'sqlite', external: false, inspection: { database: { engine: 'sqlite', path: 'data/db/old.db' } }, $emit() {} }
  Object.assign(instance.draft, { username: 'admin', password: 'private', confirmedName: 'target.db' })
  for (const [name, fn] of Object.entries(options.methods)) instance[name] = fn.bind(instance)
  return instance
}

test('restore wizard preserves the entire draft on 409 and does not retry confirmation', async () => {
  let calls = 0
  const i = wizard(async () => { calls++; throw Object.assign(Error('changed'), { response: { status: 409, data: { detail: 'migration_target_changed' } } }) })
  i.step = 3; i.preflight = { id: 'approved' }; i.replacementConfirmed = true
  const before = JSON.stringify(i.draft)
  await i.confirm()
  assert.equal(calls, 1); assert.equal(JSON.stringify(i.draft), before)
  assert.equal(i.preflight.id, 'approved'); assert.equal(i.error, 'migration_target_changed')
  assert.equal(i.busy, false)
})

test('restore wizard suppresses duplicate submission and late detail responses', async () => {
  let resolve; let calls = 0
  const i = wizard(() => { calls++; return new Promise(done => { resolve = done }) })
  i.step = 3; i.preflight = { id: 'approved' }; i.replacementConfirmed = true
  const first = i.confirm(); await i.confirm()
  assert.equal(calls, 1)
  i.sequence++; resolve({ id: 'old-task' }); await first
  i.busy = false
  const detail = i.loadDetails(1); i.preflight = { id: 'new-approval' }
  resolve({ items: [{ path: 'old-path' }], total: 1 }); await detail
  assert.equal(i.details.items.length, 0)
})

test('restore wizard sends confirmed target connection and separates candidate credentials', () => {
  const i = wizard(() => {})
  i.external = true; i.engine = 'postgres'
  Object.assign(i.draft.target, { host: '127.0.0.1', port: 5432, database: 'target', username: 'target-role', password: 'target-secret' })
  Object.assign(i.draft.candidate, { host: '127.0.0.1', port: 5432, database: 'candidate', username: 'candidate-role', password: 'candidate-secret' })
  const value = i.privateInput()
  assert.equal(value.configuration.DB_URL, value.database.target_url)
  assert.equal(new URL(value.database.candidate_url).pathname, '/candidate')
  assert.notEqual(new URL(value.database.candidate_url).username, new URL(value.database.target_url).username)
  assert.equal(value.administrator.password, 'private')
})

test('401 preserves restore draft; local login invalidates session-bound plans only', async () => {
  const events = []; let logins = 0
  const i = wizard(async () => { throw Object.assign(Error('expired'), { response: { status: 401 } }) }, async (name, password) => {
    assert.equal(name, 'current-admin'); assert.equal(password, 'current-secret'); logins++
  })
  i.$emit = name => events.push(name)
  i.preflight = { id: 'old-session' }; i.registeredId = 'old-upload'; i.step = 3; i.replacementConfirmed = true
  const draft = JSON.stringify(i.draft)
  await i.confirm()
  assert.equal(i.authRequired, true); assert.equal(JSON.stringify(i.draft), draft)
  i.loginUsername = 'current-admin'; i.loginPassword = 'current-secret'
  await i.login()
  assert.equal(logins, 1); assert.equal(i.authRequired, false); assert.equal(i.loginPassword, '')
  assert.equal(i.preflight, null); assert.equal(i.registeredId, null); assert.equal(i.step, 1)
  assert.equal(JSON.stringify(i.draft), draft); assert.deepEqual(events, ['reauthenticated'])
})

test('reauthentication and source reinspection block confirmation', async () => {
  const i = wizard(() => assert.fail('stale session must not submit'))
  i.preflight = { id: 'old' }; i.replacementConfirmed = true; i.authRequired = true
  await i.confirm(); await i.next()
  i.authRequired = false; i.sourceBusy = true
  await i.confirm(); await i.next()
})
