const assert = require("node:assert/strict")
const fs = require("node:fs")
const path = require("node:path")
const vm = require("node:vm")
const { test } = require("node:test")
const babel = require("@babel/core")
const compiler = require("vue-template-compiler")
const axiosLibrary = require("axios")

const root = path.resolve(__dirname, "..")
const transformed = new Map()
const deferred = () => {
  let resolve, reject
  const promise = new Promise((yes, no) => { resolve = yes; reject = no })
  return { promise, resolve, reject }
}
const flush = async () => { for (let i = 0; i < 12; i++) await Promise.resolve() }

function harness() {
  const storage = new Map()
  const listeners = new Map()
  const timers = new Map()
  const intervals = new Map()
  let timerId = 0
  const calls = { requests: [], fetches: [], sockets: [], messages: [], tokens: [], expired: 0, reloads: 0 }
  const storageApi = { getItem: key => storage.get(key) || null,
    setItem: (key, value) => storage.set(key, value), removeItem: key => storage.delete(key) }
  const window = {
    location: { origin: "https://localhost:8443", protocol: "https:", hash: "", reload: () => calls.reloads++ },
    sessionStorage: storageApi,
    setTimeout: fn => { timers.set(++timerId, fn); return timerId },
    clearTimeout: id => timers.delete(id),
    setInterval: fn => { intervals.set(++timerId, fn); return timerId },
    clearInterval: id => intervals.delete(id),
    addEventListener: (name, fn) => { if (!listeners.has(name)) listeners.set(name, new Set()); listeners.get(name).add(fn) },
    removeEventListener: (name, fn) => listeners.get(name)?.delete(fn),
    dispatchEvent: event => { for (const fn of listeners.get(event.type) || []) fn(event) },
  }
  const axios = axiosLibrary.create()
  Object.assign(axios, { Cancel: axiosLibrary.Cancel, CancelToken: axiosLibrary.CancelToken, isCancel: axiosLibrary.isCancel })
  axios.defaults.adapter = config => {
    const pending = deferred()
    calls.requests.push({ config, ...pending })
    config.signal.addEventListener("abort", () => pending.reject(new axios.Cancel("aborted")), { once: true })
    return pending.promise
  }
  class WebSocket {
    static OPEN = 1
    constructor(url) { this.url = url; this.readyState = 0; this.sent = []; this.events = {}; calls.sockets.push(this) }
    addEventListener(name, fn) { this.events[name] = fn }
    send(payload) { this.sent.push(payload) }
    close() { this.readyState = 3; this.onclose?.({ code: 1000 }) }
    open() { this.readyState = 1; this.events.open?.(); this.onopen?.() }
  }
  const messageApi = Object.fromEntries(["error", "warning", "success", "info"].map(name => [name, value => calls.messages.push(value)]))
  messageApi.closeAll = () => {}
  const mocks = {
    axios, "element-ui": { Message: messageApi, Notification: messageApi },
    "@/utils/auth-token": { getAuthToken: () => "Bearer fixture", setAuthToken: token => calls.tokens.push(token), clearAuthToken() {} },
    "@/utils/auth-session": { handleAuthenticationExpired: () => calls.expired++, isLocalAuthRecoveryRequest: () => false },
    "@/utils/dirty-state": { clearAllDirtyStates() {}, hasDirtyState: () => false },
    "@/main": { $store: { state: {} } },
  }
  for (const name of ["components/account/AccountSecurityDialog", "components/system/NetworkStatus",
    "components/common/BotRequiredState", "components/store/PluginOperationDialog", "assets/image/logo.png",
    "utils/event-bus", "utils/utils"]) mocks[`@/${name}`] = {}
  const context = { window, localStorage: storageApi, sessionStorage: storageApi, URL, AbortController, WebSocket,
    console: { log() {}, debug() {} }, process: { env: { VUE_APP_WEBUI_REVISION: "fixture" } },
    document: { getElementsByClassName: () => [] },
    CustomEvent: class { constructor(type, options = {}) { this.type = type; this.detail = options.detail } },
    setTimeout: window.setTimeout, clearTimeout: window.clearTimeout, setInterval: window.setInterval, clearInterval: window.clearInterval,
    fetch: (url, options) => { const pending = deferred(); calls.fetches.push({ url, options, ...pending }); return pending.promise },
  }
  const modules = new Map()
  function load(relative) {
    if (modules.has(relative)) return modules.get(relative).exports
    if (!transformed.has(relative)) {
      let source = fs.readFileSync(path.join(root, relative), "utf8")
      if (relative.endsWith(".vue")) source = compiler.parseComponent(source).script.content
      transformed.set(relative, babel.transformSync(source, { babelrc: false, configFile: false,
        plugins: ["@babel/plugin-transform-modules-commonjs"] }).code)
    }
    const module = { exports: {} }
    modules.set(relative, module)
    const requireModule = name => {
      const file = name.startsWith("@/") ? `src/${name.slice(2)}` : path.posix.join(path.posix.dirname(relative), name)
      const alias = `@/${file.slice(4)}`
      return mocks[alias] || mocks[name] || load(path.posix.extname(file) ? file : `${file}.js`)
    }
    vm.runInNewContext(transformed.get(relative), { ...context, module, exports: module.exports, require: requireModule })
    return module.exports
  }
  const gate = load("src/utils/restart-network.js")
  const runTimers = () => { const pending = Array.from(timers.values()); timers.clear(); pending.forEach(fn => fn()) }
  return { load, gate, axios, calls, window, storage, timers, intervals, runTimers }
}

test("Axios freezes before adapter dispatch and suppresses shared messages", async () => {
  const h = harness()
  const api = h.load("src/utils/api.js")
  const messages = h.load("src/utils/message.js")
  h.gate.freezeBusinessNetwork()
  await assert.rejects(api.getRequest("/fixture"), h.axios.isCancel)
  messages.message.error("canceled")
  messages.notify.error("canceled")
  assert.equal(h.calls.requests.length, 0)
  assert.equal(h.calls.messages.length, 0)
})

test("freeze aborts every active Axios request without expiry or toast", async () => {
  const h = harness()
  const api = h.load("src/utils/api.js")
  const pending = [api.getRequest("/one"), api.postRequest("/two", {})]
  const checks = pending.map(request => assert.rejects(request, h.axios.isCancel))
  await flush()
  assert.equal(h.calls.requests.length, 2)
  h.gate.freezeBusinessNetwork()
  assert.ok(h.calls.requests.every(({ config }) => config.signal.aborted))
  await Promise.all(checks)
  assert.equal(h.calls.expired, 0)
  assert.equal(h.calls.messages.length, 0)
})

test("only expected recovery rejections are silent for fire-and-forget callers", async () => {
  const h = harness()
  const api = h.load("src/utils/api.js")
  h.gate.freezeBusinessNetwork()
  const cancellation = await api.getRequest("/fire-and-forget").catch(error => error)
  for (const [reason, expected] of [
    [cancellation, true], [new Error("restart_recovery"), false],
    [new h.axios.Cancel("caller cancellation"), false],
  ]) {
    let prevented = false
    h.window.dispatchEvent({ type: "unhandledrejection", reason, preventDefault: () => { prevented = true } })
    assert.equal(prevented, expected)
  }
})

test("caller AbortSignal and CancelToken cancellation remain compatible", async () => {
  for (const type of ["signal", "cancelToken"]) {
    const h = harness()
    const api = h.load("src/utils/api.js")
    const controller = new AbortController()
    const token = h.axios.CancelToken.source()
    const config = type === "signal" ? { signal: controller.signal } : { cancelToken: token.token }
    const pending = api.getRequest("/cancel", {}, config)
    const check = assert.rejects(pending, h.axios.isCancel)
    await flush()
    if (type === "signal") controller.abort()
    else {
      token.cancel("caller")
      h.calls.requests[0].resolve({ status: 200, data: {}, config: h.calls.requests[0].config })
    }
    await check
    assert.equal(h.calls.messages.length, 0)
  }
})

test("late responses and 401 errors from a previous epoch are silent after resume", async () => {
  for (const failure of [false, true]) {
    const h = harness()
    const api = h.load("src/utils/api.js")
    const pendingAdapter = deferred()
    let config
    h.axios.defaults.adapter = value => { config = value; return pendingAdapter.promise }
    const pending = api.getRequest("/late")
    const check = assert.rejects(pending, h.axios.isCancel)
    await flush()
    h.gate.freezeBusinessNetwork()
    h.gate.resumeBusinessNetwork()
    if (failure) pendingAdapter.reject({ config, response: { status: 401 } })
    else pendingAdapter.resolve({ config, status: 200, data: { stale: true } })
    await check
    assert.equal(h.calls.expired, 0)
    assert.equal(h.calls.messages.length, 0)
  }
})

test("completed Axios requests are released from freeze tracking", async () => {
  const h = harness()
  const api = h.load("src/utils/api.js")
  const pending = api.getRequest("/done")
  await flush()
  const request = h.calls.requests[0]
  request.resolve({ config: request.config, status: 200, data: { suc: true } })
  await pending
  h.gate.freezeBusinessNetwork()
  assert.equal(request.config.signal.aborted, false)
})

test("activity trailing renewal is cleared and recovery clicks cannot renew", async () => {
  const h = harness()
  h.load("src/utils/api.js")
  h.load("src/utils/session-activity.js").startSessionActivity()
  h.window.dispatchEvent({ type: "pointerdown" })
  await flush()
  assert.equal(h.calls.requests.length, 1)
  assert.equal(h.timers.size, 1)
  h.gate.freezeBusinessNetwork()
  assert.equal(h.timers.size, 0)
  for (const type of ["pointerdown", "touchstart", "keydown"]) h.window.dispatchEvent({ type })
  h.runTimers()
  await flush()
  assert.equal(h.calls.requests.length, 1)
  assert.equal(h.calls.tokens.length, 0)
  assert.equal(h.calls.expired, 0)
})

test("revision polling aborts on freeze and stale manifests cannot reload", async () => {
  const h = harness()
  h.load("src/utils/webui-revision.js").startWebuiRevisionPolling()
  assert.equal(h.calls.fetches.length, 1)
  h.gate.freezeBusinessNetwork()
  assert.equal(h.calls.fetches[0].options.signal.aborted, true)
  assert.equal(h.intervals.size, 0)
  h.gate.resumeBusinessNetwork()
  assert.equal(h.calls.fetches.length, 2)
  h.calls.fetches[0].resolve({ ok: true, json: async () => ({ revision: "obsolete" }) })
  h.calls.fetches[1].resolve({ ok: true, json: async () => ({ revision: "fixture" }) })
  await flush()
  assert.equal(h.calls.reloads, 0)
  for (const fn of h.intervals.values()) fn()
  assert.equal(h.calls.fetches.length, 3)
})

for (const channel of ["status", "log", "chat"]) {
  test(`${channel} socket stops heartbeat/reconnect and refuses reinit or late auth`, () => {
    const h = harness()
    const socket = h.load(`src/utils/websocket/${channel}-websocket.js`).default
    let messages = 0
    socket.initWebSocket(() => messages++)
    const first = h.calls.sockets[0]
    first.open()
    assert.equal(first.sent.length, 1)
    first.onclose({ code: 1006 })
    assert.equal(h.timers.size, 1)
    h.gate.freezeBusinessNetwork()
    assert.equal(h.timers.size, 0)
    assert.equal(h.intervals.size, 0)
    socket.initWebSocket(() => messages++)
    h.runTimers()
    assert.equal(h.calls.sockets.length, 1)
    h.gate.resumeBusinessNetwork()
    socket.initWebSocket(() => messages++)
    const connecting = h.calls.sockets[1]
    h.gate.freezeBusinessNetwork()
    assert.equal(connecting.readyState, 3)
    assert.equal(socket.ws, null)
    assert.equal(h.intervals.size, 0)
    h.gate.resumeBusinessNetwork()
    connecting.open()
    connecting.onmessage({ data: "{}" })
    assert.equal(connecting.sent.length, 0)
    assert.equal(messages, 0)
    assert.equal(h.calls.expired, 0)
  })
}

test("Home cancels its scheduled poll and cannot reschedule a stale in-flight poll", async () => {
  const h = harness()
  const component = h.load("src/views/Home.vue").default
  let requests = 0
  const pending = deferred()
  const instance = { startupPollTimer: null, startupStatus: { state: "warmup_ready" },
    $root: { prefix: "/zhenxun/api" }, getRequest: () => { requests++; return pending.promise },
    $store: { dispatch() {} } }
  for (const [name, method] of Object.entries(component.methods)) instance[name] = method.bind(instance)
  const stop = h.gate.onBusinessNetworkChange(instance.handleRecoveryNetwork)
  instance.startupPollTimer = h.window.setTimeout(instance.loadStartupStatus, 10000)
  h.gate.freezeBusinessNetwork()
  assert.equal(h.timers.size, 0)
  await instance.loadStartupStatus()
  await instance.loadRestartStatus()
  assert.equal(requests, 0)
  h.gate.resumeBusinessNetwork()
  assert.equal(requests, 2)
  h.gate.freezeBusinessNetwork()
  pending.resolve({ suc: true, data: { state: "failed", launcher_managed: true } })
  await flush()
  assert.equal(h.timers.size, 0)
  assert.equal(instance.startupStatus.state, "warmup_ready")
  stop()
})

test("persisted recovery freezes business startup before mounted hooks", async () => {
  const h = harness()
  h.storage.set("zhenxunRestartRecovery", JSON.stringify({
    bootId: "old", sourceOrigin: h.window.location.origin, sessionId: "saved",
    startedAt: Date.now(), expiresAt: Date.now() + 60000,
    accessUrls: ["http://localhost:8443"],
  }))
  h.load("src/utils/restart-recovery.js")
  assert.equal(h.gate.isBusinessNetworkFrozen(), true)
  const api = h.load("src/utils/api.js")
  h.load("src/utils/webui-revision.js").startWebuiRevisionPolling()
  h.load("src/utils/session-activity.js").startSessionActivity()
  h.window.dispatchEvent({ type: "pointerdown" })
  for (const channel of ["status", "log", "chat"]) h.load(`src/utils/websocket/${channel}-websocket.js`).default.initWebSocket(() => {})
  await assert.rejects(api.getRequest("/startup"), h.axios.isCancel)
  assert.equal(h.calls.requests.length + h.calls.fetches.length + h.calls.sockets.length, 0)
  assert.equal(h.timers.size + h.intervals.size, 0)
})
