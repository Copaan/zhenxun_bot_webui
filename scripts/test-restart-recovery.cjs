const assert = require("node:assert/strict")
const fs = require("node:fs")
const path = require("node:path")
const vm = require("node:vm")
const { test } = require("node:test")
const babel = require("@babel/core")
const compiler = require("vue-template-compiler")
const Vue = require("vue")

const root = path.resolve(__dirname, "..")
const sources = new Map()
function loadSource(relative) {
  if (!sources.has(relative)) {
    let source = fs.readFileSync(path.join(root, relative), "utf8")
    if (relative.endsWith(".vue")) source = compiler.parseComponent(source).script.content
    sources.set(relative, babel.transformSync(source, {
      babelrc: false, configFile: false,
      plugins: ["@babel/plugin-transform-modules-commonjs"],
    }).code)
  }
  return sources.get(relative)
}

function harness(origin = "https://localhost:8443", extraMocks = {}) {
  const storage = new Map()
  const calls = { closed: 0, authCleared: 0, fetch: 0, reload: 0, replaced: [], events: [] }
  const window = {
    location: { origin, protocol: new URL(origin).protocol, hash: "",
      replace: url => calls.replaced.push(url), reload: () => calls.reload++ },
    sessionStorage: { getItem: key => storage.get(key) || null,
      setItem: (key, value) => storage.set(key, value), removeItem: key => storage.delete(key) },
    crypto: { randomUUID: (() => { let id = 0; return () => `session-${++id}` })() },
    dispatchEvent: event => calls.events.push(event),
    removeEventListener() {},
    setTimeout, clearTimeout,
    history: { replaceState() {} },
  }
  const modules = {}
  const context = { window, URL, AbortController, console,
    CustomEvent: class { constructor(type, options) { this.type = type; this.detail = options.detail } },
    fetch: async () => { calls.fetch++; return { ok: true, json: async () => ({ suc: true, data: { boot_id: "new" } }) } },
  }
  const mocks = {
    ...extraMocks,
    "@/utils/auth-session": { clearAuthenticationState: () => {
      calls.authCleared++
      storage.delete("authToken")
    } },
  }
  for (const name of ["status", "log", "chat"]) {
    mocks[`@/utils/websocket/${name}-websocket`] = { closeWebSocket: () => calls.closed++ }
  }
  function load(relative) {
    if (modules[relative]) return modules[relative]
    const module = { exports: {} }
    const requireModule = name => mocks[name] || load(name.startsWith("@/")
      ? `src/${name.slice(2)}.js`
      : path.posix.join(path.posix.dirname(relative), `${name}.js`))
    vm.runInNewContext(loadSource(relative), { ...context, module, exports: module.exports, require: requireModule })
    modules[relative] = module.exports
    return module.exports
  }
  const recovery = load("src/utils/restart-recovery.js")
  function overlay() {
    const component = load("src/components/system/RestartRecoveryOverlay.vue").default
    const instance = component.data()
    for (const [name, method] of Object.entries(component.methods)) instance[name] = method.bind(instance)
    for (const [name, getter] of Object.entries(component.computed)) {
      Object.defineProperty(instance, name, { get: getter.bind(instance) })
    }
    return instance
  }
  return { recovery, load, overlay, storage, calls, window }
}

const start = (h, extra = {}) => h.recovery.startRestartRecovery({
  bootId: "old", accessUrls: [h.window.location.origin], ...extra,
})

test("restart reply targets supersede saved addresses, including an empty target list", async () => {
  for (const targets of [["http://localhost:8443"], []]) {
    const h = harness()
    const flow = h.load("src/utils/restart-flow.js")
    await flow.requestRestartWithRecovery({ $loading: () => ({ close() {} }) }, {
      request: async () => ({ suc: true, data: { boot_id: "old", access_urls: targets } }),
      recovery: { accessUrls: ["https://localhost:8443"], accessTargets: [{ url: "https://localhost:8443" }], preferredUrl: "https://localhost:8443" },
    })
    assert.deepEqual(Array.from(h.recovery.restartRecoveryState().accessUrls), targets)
  }
})

test("target_access fields are authoritative and recovery options are optional", async () => {
  const h = harness()
  await h.load("src/utils/restart-flow.js").requestRestartWithRecovery({ $loading: () => ({ close() {} }) }, {
    request: async () => ({ suc: true, data: { boot_id: "old", target_access_urls: ["http://localhost:8080"], access_urls: ["https://localhost:8443"] } }),
  })
  assert.deepEqual(Array.from(h.recovery.restartRecoveryState().accessUrls), ["http://localhost:8080"])
})

test("expired, future and foreign-origin sessions are discarded", () => {
  for (const changes of [
    { startedAt: Date.now() - 300001 }, { startedAt: Date.now() + 10000 },
    { sourceOrigin: "https://other:8443" }, { expiresAt: Date.now() - 1 },
  ]) {
    const h = harness()
    const state = start(h)
    h.storage.set("zhenxunRestartRecovery", JSON.stringify({ ...state, ...changes }))
    assert.equal(h.recovery.restartRecoveryState(), null)
    assert.equal(h.storage.has("zhenxunRestartRecovery"), false)
  }
})

test("reauth navigation clears saved recovery", () => {
  const h = harness()
  start(h)
  h.window.location.hash = "#/?reauth=1&redirect=%2Fdashboard"
  assert.equal(h.recovery.restartRecoveryState(), null)
  assert.equal(h.storage.has("zhenxunRestartRecovery"), false)
})

test("superseded sessions cannot consume probe results", () => {
  const h = harness()
  const previous = start(h)
  const current = start(h)
  assert.equal(h.recovery.recoverySessionIsCurrent(previous), false)
  assert.equal(h.recovery.recoverySessionIsCurrent(current), true)
})

test("status correlation rejects old workers, failures and pending verification", () => {
  const h = harness()
  const state = start(h, { launcherBootId: "launcher", restartId: "restart" })
  const data = { boot_id: "new", launcher_boot_id: "launcher", restart_id: "restart" }
  assert.equal(h.recovery.recoveryStatusMatches(state, { suc: true, data }), true)
  for (const change of [{ boot_id: "old" }, { launcher_boot_id: "other" }, { restart_id: "other" }, { transaction_verification_pending: true }]) {
    assert.equal(h.recovery.recoveryStatusMatches(state, { data: { ...data, ...change } }), false)
  }
  assert.equal(h.recovery.recoveryStatusMatches(state, { suc: false, data }), false)
})

test("HTTPS to HTTP exposes manual recovery immediately and makes no probes", async () => {
  const h = harness()
  const state = start(h, { accessUrls: ["http://localhost:8443"] })
  const component = h.load("src/components/system/RestartRecoveryOverlay.vue").default
  const overlay = h.overlay()
  overlay.begin(state)
  assert.equal(component.computed.insecureTargets.call(overlay), true)
  assert.equal(component.computed.manualRequired.call(overlay), true)
  assert.equal(h.calls.closed, 3)
  assert.equal(h.calls.fetch, 0)
  assert.equal(await overlay.readStatus("https://localhost:8443"), null)
  assert.equal(h.calls.fetch, 0)
  assert.equal(h.load("src/utils/restart-network.js").isBusinessNetworkFrozen(), true)
})

test("eligible overlay probes bypass the business freeze without credentials", async () => {
  const h = harness()
  const overlay = h.overlay()
  overlay.state = start(h)
  assert.equal(h.load("src/utils/restart-network.js").isBusinessNetworkFrozen(), true)
  assert.ok(await overlay.readStatus(h.window.location.origin))
  assert.equal(h.calls.fetch, 1)
})

function renderedDismissButtons(h, state, timedOut) {
  const relative = "src/components/system/RestartRecoveryOverlay.vue"
  const parsed = compiler.parseComponent(fs.readFileSync(path.join(root, relative), "utf8"))
  const component = h.load(relative).default
  const instance = new Vue({
    ...component,
    ...compiler.compileToFunctions(parsed.template.content),
    data: () => ({ ...component.data(), visible: true, state, timedOut }),
  })
  const matching = []
  const visit = vnode => {
    if (vnode.data?.on?.click === instance.dismiss) matching.push(vnode)
    for (const child of vnode.children || []) visit(child)
  }
  visit(instance._render())
  instance.$destroy()
  return matching
}

test("manual HTTP recovery cannot dismiss or resume the old HTTPS network", () => {
  for (const timedOut of [false, true]) {
    const h = harness()
    const state = start(h, { accessUrls: ["http://localhost:8443"] })
    const overlay = h.overlay()
    overlay.begin(state)
    overlay.timedOut = timedOut
    assert.equal(renderedDismissButtons(h, state, timedOut).length, 0)
    overlay.dismiss()
    assert.equal(overlay.visible, true)
    assert.equal(h.load("src/utils/restart-network.js").isBusinessNetworkFrozen(), true)
    assert.equal(h.recovery.restartRecoveryState().sessionId, state.sessionId)
    assert.equal(h.calls.fetch, 0)
    overlay.finish(state.accessUrls[0], true)
    assert.equal(h.recovery.restartRecoveryState(), null)
    assert.equal(h.calls.authCleared, 1)
    assert.match(h.calls.replaced[0], /^http:\/\/localhost:8443\/.*reauth=1/)
    assert.equal(h.load("src/utils/restart-network.js").isBusinessNetworkFrozen(), true)
  }
})

test("automatic probe timeout still offers dismiss and resumes business traffic", () => {
  const h = harness()
  const state = start(h)
  const overlay = h.overlay()
  Object.assign(overlay, { state, visible: true, timedOut: true })
  assert.equal(renderedDismissButtons(h, state, true).length, 1)
  overlay.dismiss()
  assert.equal(overlay.visible, false)
  assert.equal(h.recovery.restartRecoveryState(), null)
  assert.equal(h.load("src/utils/restart-network.js").isBusinessNetworkFrozen(), false)
})

test("HTTPS probing excludes the same switched HTTP listener", () => {
  const h = harness()
  const state = start(h, { accessUrls: ["https://localhost:8443", "http://localhost:8443", "https://localhost:9443"] })
  assert.deepEqual(Array.from(h.recovery.recoveryProbeTargets(state)), ["https://localhost:9443"])
})

test("manual navigation clears recovery and auth, including same origin", () => {
  for (const target of ["http://localhost:8443", "https://localhost:8443"]) {
    const h = harness()
    h.storage.set("authToken", "secret")
    const state = start(h, { accessUrls: [target], setup: true })
    for (const key of ["zhenxunSetupToken", "zhenxunSetupRestartReceipt", "zhenxunSetupRestartTargets"]) h.storage.set(key, "secret")
    const overlay = h.overlay()
    overlay.state = state
    overlay.finish(target, true)
    assert.equal(h.calls.authCleared, 1)
    assert.equal(h.calls.reload, 0)
    assert.equal(h.storage.size, 0)
    assert.match(h.calls.replaced[0], /reauth=1/)
    assert.ok(!h.calls.replaced[0].includes("secret"))
    assert.equal(h.load("src/utils/restart-network.js").isBusinessNetworkFrozen(), true)
  }
})

test("dismiss during wait cancels the next request", async () => {
  const h = harness()
  const overlay = h.overlay()
  overlay.state = start(h)
  const polling = overlay.poll(overlay.runId)
  overlay.dismiss()
  await polling
  assert.equal(h.calls.fetch, 0)
  assert.equal(h.load("src/utils/restart-network.js").isBusinessNetworkFrozen(), false)
})

test("dismiss cancels in-flight probes and cannot navigate from their result", async () => {
  const h = harness()
  const overlay = h.overlay()
  overlay.state = start(h)
  overlay.waitForPoll = async () => {}
  let resolve
  let notifyStarted
  const started = new Promise(done => { notifyStarted = done })
  overlay.readStatus = async () => new Promise(done => { resolve = done; notifyStarted() })
  const polling = overlay.poll(overlay.runId)
  await started
  const controller = new AbortController()
  overlay._statusController = controller
  overlay.dismiss()
  assert.equal(controller.signal.aborted, true)
  resolve({ suc: true, data: { boot_id: "new" } })
  await polling
  assert.equal(h.calls.replaced.length, 0)
  assert.equal(h.calls.reload, 0)
})

test("wildcards and credentials are rejected and IPv6 loopback stays local", () => {
  const h = harness("https://[::1]:8443")
  const state = start(h, { accessUrls: ["http://[::]:80", "http://0.0.0.0", "http://user:secret@localhost", "https://[::1]:8443"] })
  assert.equal(state.preferredKind, "local")
  assert.deepEqual(Array.from(state.accessUrls), ["https://[::1]:8443"])
})

test("unadvertised stored fallbacks are ignored", () => {
  const h = harness()
  const state = start(h)
  h.storage.set("zhenxunRestartRecovery", JSON.stringify({ ...state, fallbackUrls: ["https://localhost:9999"] }))
  assert.deepEqual(Array.from(h.recovery.restartRecoveryState().fallbackUrls), [])
})

test("HTTP diagnostics retain labels and unknown error codes", () => {
  const h = harness()
  const labels = h.load("src/utils/http-diagnostics.js")
  assert.notEqual(labels.httpModeLabel("redirect"), "redirect")
  assert.notEqual(labels.httpErrorLabel("address_in_use"), "address_in_use")
  assert.notEqual(labels.httpErrorLabel("address_unavailable"), "address_unavailable")
  assert.equal(labels.httpErrorLabel("future_error"), "future_error")
})

for (const [relative, method] of [
  ["src/views/Home.vue", "restartWorker"],
  ["src/components/store/NoneBotStore.vue", "repairEnvironment"],
]) {
  test(`${method} propagates correlation and authoritative targets`, async () => {
    const mocks = {
      "@/utils/dirty-state": { hasDirtyState: () => false },
      "@/utils/apply-result": { notifyRestartStatusChanged() {} },
    }
    for (const name of [
      "components/account/AccountSecurityDialog", "components/system/NetworkStatus",
      "components/common/BotRequiredState", "components/store/PluginOperationDialog",
      "assets/image/logo.png", "utils/event-bus", "utils/api", "utils/utils",
      "utils/http-diagnostics",
    ]) mocks[`@/${name}`] = {}
    const h = harness("https://localhost:8443", mocks)
    const component = h.load(relative).default
    const data = {
      boot_id: "old", launcher_boot_id: "launcher", restart_id: "restart",
      target_access_urls: ["http://localhost:8443"],
      target_access_targets: [{ url: "http://localhost:8443" }],
      access_urls: ["https://localhost:8443"],
      access_targets: [{ url: "https://localhost:8443" }],
    }
    const instance = {
      restartAvailable: true, restartLoading: false, repairing: false,
      environment: { repairable: true, fingerprint: "fixture" },
      $root: { prefix: "/zhenxun/api" }, $route: { path: "/dashboard" },
      $confirm: async () => true, $cuteConfirm: async () => true,
      $message: { error: message => assert.fail(message) },
      postRequest: async () => ({ suc: true, data }),
    }
    await component.methods[method].call(instance)
    const state = h.recovery.restartRecoveryState()
    assert.equal(state.launcherBootId, "launcher")
    assert.equal(state.restartId, "restart")
    assert.deepEqual(Array.from(state.accessUrls), ["http://localhost:8443"])
    assert.equal(h.recovery.recoveryStatusMatches(state, { data: { boot_id: "new" } }), false)
  })
}

test("affected Vue templates compile", () => {
  for (const relative of ["src/components/system/RestartRecoveryOverlay.vue", "src/components/system/NetworkStatus.vue", "src/views/Home.vue", "src/components/store/NoneBotStore.vue"]) {
    const parsed = compiler.parseComponent(fs.readFileSync(path.join(root, relative), "utf8"))
    const result = compiler.compile(parsed.template.content)
    assert.deepEqual(result.errors, [], relative)
  }
})
