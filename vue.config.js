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
module.exports = defineConfig({
  productionSourceMap: false,
  publicPath: "/",
  devServer: {
    host: process.env.WEBUI_DEV_HOST || "127.0.0.1",
    port: Number(process.env.WEBUI_DEV_PORT || 8081),
    // 压缩会缓冲 AI 控制台的流式响应
    compress: false,
    proxy: {
      "/zhenxun": {
        // 后端开启 HTTPS 时设为 https://127.0.0.1:8080，开发代理接受自签证书
        target: process.env.WEBUI_DEV_BACKEND || "http://127.0.0.1:8080",
        changeOrigin: false,
        secure: false,
        ws: true,
      },
    },
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
