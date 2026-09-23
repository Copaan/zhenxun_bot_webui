const { defineConfig } = require("@vue/cli-service")
const { execFileSync } = require("child_process")
const fs = require("fs")
const path = require("path")
const { buildRevision } = require("./scripts/build-revision")
const pkg = JSON.parse(fs.readFileSync(path.join(__dirname, "package.json"), "utf8"))

let commit = "unknown"
try {
  commit = execFileSync("git", ["rev-parse", "--short=12", "HEAD"], {
    cwd: __dirname,
    encoding: "utf8",
    stdio: ["ignore", "pipe", "ignore"],
  }).trim()
} catch (error) {
  // Source archives do not always include Git metadata.
}
process.env.VUE_APP_WEBUI_REVISION = buildRevision(pkg.version, commit)
const managedDev = process.env.WEBUI_DEV_MANAGED === "1" && process.env.NODE_ENV !== "production"
const devPrefix = "/__webui_dev__/"
module.exports = defineConfig({
  productionSourceMap: false,
  publicPath: managedDev ? devPrefix : "/",
  devServer: {
    host: process.env.WEBUI_DEV_HOST || "127.0.0.1",
    port: Number(process.env.WEBUI_DEV_PORT || 8081),
    ...(managedDev ? {
      hot: true,
      client: {
        webSocketURL: { protocol: "auto:", hostname: "0.0.0.0", port: 0, pathname: `${devPrefix}ws` },
        webSocketTransport: require.resolve("./src/utils/webui-dev-client"),
        overlay: { errors: true, warnings: false },
      },
      webSocketServer: { type: "ws", options: { path: `${devPrefix}ws` } },
      setupMiddlewares: require("./scripts/webui-dev-middleware"),
    } : { proxy: {
      "/zhenxun": {
        target: process.env.WEBUI_DEV_BACKEND || "http://127.0.0.1:8080",
        changeOrigin: false,
        ws: true,
      },
    } }),
  },
  css: {
    loaderOptions: {
      postcss: {
        postcssOptions: {
          plugins: [require("tailwindcss"), require("autoprefixer")],
        },
      },
    },
  },
  chainWebpack: (config) => {
    config.entry("maintenance").add(path.join(__dirname, "src/migration-maintenance.js"))
    config.plugin("html-maintenance").use(require("html-webpack-plugin"), [{
      template: path.join(__dirname, "public/index.html"),
      filename: "maintenance.html",
      title: "真寻 · 迁移维护",
      templateParameters: { BASE_URL: "/" },
      chunks: ["chunk-vendors", "maintenance"],
      inject: true,
    }])
    config.plugin("html").tap((args) => {
      args[0].title = "真寻酱的后台捏"
      args[0].chunks = ["chunk-vendors", "app"]
      return args
    })

    // 清除默认的 svg 规则
    config.module.rule("svg").uses.clear()

    // 添加新的 svg 规则
    config.module
      .rule("svg")
      .exclude.add(path.join(__dirname, "src/assets/icons/svg"))
      .end()

    config.module
      .rule("icons")
      .test(/\.svg$/)
      .include.add(path.join(__dirname, "src/assets/icons/svg"))
      .end()
      .use("svg-sprite-loader")
      .loader("svg-sprite-loader")
      .options({
        symbolId: "icon-[name]",
      })
      .end()
      .use("svgo-loader")
      .loader("svgo-loader")
      .options({
        plugins: [
          {
            name: "preset-default",
            params: {
              overrides: {
                removeViewBox: false,
              },
            },
          },
          {
            name: "removeAttrs",
            params: {
              attrs: "(stroke|fill)",
            },
          },
        ],
      })
  },
})
