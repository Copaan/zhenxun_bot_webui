const crypto = require("crypto")

module.exports = function setupManagedDev(middlewares, server) {
  let state = { state: "compiling", errors: [] }
  const compiler = server.compiler
  compiler.hooks.invalid.tap("ZhenxunDevState", () => { state = { state: "compiling", errors: [] } })
  compiler.hooks.done.tap("ZhenxunDevState", (stats) => {
    state = {
      state: stats.hasErrors() ? "error" : "ready",
      errors: stats.hasErrors() ? stats.toJson({ all: false, errors: true }).errors.map((error) => error.message || String(error)) : [],
    }
  })
  compiler.hooks.failed.tap("ZhenxunDevState", (error) => {
    state = { state: "error", errors: [error.message] }
  })
  function authorized(request) {
    const expected = Buffer.from(process.env.WEBUI_DEV_TOKEN || "")
    const actual = Buffer.from(request.headers["x-zhenxun-dev-token"] || "")
    return expected.length > 0 && expected.length === actual.length && crypto.timingSafeEqual(expected, actual)
  }
  server.options.webSocketServer.options.verifyClient = (info) => authorized(info.req)
  if (process.platform === "win32") process.once("SIGBREAK", () => process.emit("SIGTERM"))
  // The listener is loopback-only; the launcher gateway is its only HTTP client.
  middlewares.unshift({ name: "zhenxun-managed-dev", middleware(request, response, next) {
    if (!authorized(request)) {
      response.statusCode = 403
      response.end("Launcher gateway required")
      return
    }
    if (request.url.split("?")[0] === "/__webui_dev__/status") {
      response.setHeader("Content-Type", "application/json")
      response.setHeader("Cache-Control", "no-store")
      response.end(JSON.stringify(state))
      return
    }
    next()
  } })
  return middlewares
}
