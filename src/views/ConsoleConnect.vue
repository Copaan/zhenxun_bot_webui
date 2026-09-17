<template>
  <main class="connect-shell">
    <section class="connect-panel">
      <img :src="logoUrl" alt="真寻" class="connect-logo" />
      <span class="connect-kicker">ZHENXUN WEBUI</span>
      <h1>{{ title }}</h1>
      <p>{{ message }}</p>
      <i v-if="connecting" class="el-icon-loading connect-icon" />
      <i v-else class="el-icon-warning-outline connect-icon error" />
      <div v-if="!connecting" class="connect-actions">
        <el-button type="primary" @click="goToLogin">使用密码登录</el-button>
        <el-button @click="retry">重新尝试</el-button>
      </div>
    </section>
  </main>
</template>

<script>
import logoUrl from "@/assets/image/logo.png"
import {
  clearCookie,
  setCookie,
  syncApiWithBrowserLocation,
} from "@/utils/api"

const SETUP_TOKEN_KEY = "zhenxunSetupToken"
const RESTART_RECEIPT_KEY = "zhenxunSetupRestartReceipt"

export default {
  name: "ConsoleConnect",
  data() {
    return {
      logoUrl,
      connecting: true,
      title: "正在建立安全连接",
      message: "正在验证本次启动的控制台连接链接。",
      connectionCode: "",
    }
  },
  async mounted() {
    // Console links are issued by the worker serving this page. A saved API
    // address may point at an older worker after a port or host migration.
    syncApiWithBrowserLocation()
    this.connectionCode = String(this.$route.query.code || "")
    try {
      await this.$router.replace({ path: "/connect" })
    } catch (error) {
      if (error.name !== "NavigationDuplicated") throw error
    }
    await this.connect()
  },
  methods: {
    clearSetupState() {
      window.sessionStorage.removeItem(SETUP_TOKEN_KEY)
      window.sessionStorage.removeItem(RESTART_RECEIPT_KEY)
    },
    async connect() {
      this.connecting = true
      if (!this.connectionCode) {
        this.fail("连接链接缺少授权信息，请使用当前启动控制台中的完整链接。")
        return
      }
      try {
        const response = await this.postRequest(
          `${this.$root.prefix}/auth/console-connect`,
          { code: this.connectionCode },
          { suppressErrorToast: true }
        )
        const payload = response && response.data
        if (!payload || typeof payload.mode !== "string") {
          this.fail("服务器返回了无法识别的连接状态。")
          return
        }
        if (payload.mode === "setup") {
          if (!payload.setup_token) {
            this.fail("服务器返回的首次配置凭据无效。")
            return
          }
          clearCookie("tokenStr")
          window.sessionStorage.removeItem("isAuthenticated")
          this.clearSetupState()
          window.sessionStorage.setItem(
            SETUP_TOKEN_KEY,
            payload.setup_token
          )
          await this.$router.replace("/configure")
          return
        }
        if (payload.mode === "login") {
          if (!payload.access_token || !payload.token_type) {
            this.fail("服务器返回的登录凭据无效。")
            return
          }
          this.clearSetupState()
          clearCookie("tokenStr")
          setCookie(
            "tokenStr",
            `${payload.token_type} ${payload.access_token}`
          )
          window.sessionStorage.setItem("isAuthenticated", true)
          await this.$router.replace("/home")
          this.$message.success(response.info || "连接成功")
          return
        }
        this.fail("服务器返回了无法识别的连接状态。")
      } catch (error) {
        const detail =
          error.response && error.response.data && error.response.data.detail
        this.fail(detail || "无法连接到真寻，请检查服务状态。")
      }
    },
    fail(message) {
      this.connecting = false
      this.title = "连接链接不可用"
      this.message = message
    },
    retry() {
      this.connect()
    },
    goToLogin() {
      this.$router.replace("/")
    },
  },
}
</script>

<style scoped>
.connect-shell {
  display: grid;
  min-height: 100%;
  padding: 24px;
  place-items: center;
  background: linear-gradient(145deg, #f7f8fb 0%, #fff4f7 100%);
}
.connect-panel {
  width: min(520px, 100%);
  padding: 52px 46px;
  text-align: center;
  background: #fff;
  border: 1px solid #e7e9ee;
  border-radius: 8px;
  box-shadow: 0 18px 54px rgba(61, 66, 84, 0.1);
}
.connect-logo { width: 112px; height: 64px; object-fit: contain; }
.connect-kicker { display: block; margin-top: 18px; color: #d85f82; font-size: 12px; font-weight: 700; }
h1 { margin-top: 10px; color: #30333a; font-size: 25px; }
p { margin-top: 12px; color: #727782; line-height: 1.7; }
.connect-icon { display: block; margin-top: 30px; color: #d85f82; font-size: 34px; }
.connect-icon.error { color: #d97706; }
.connect-actions { display: flex; justify-content: center; gap: 10px; margin-top: 30px; }
@media (max-width: 520px) {
  .connect-shell { padding: 0; background: #fff; }
  .connect-panel { min-height: 100vh; padding: 72px 22px; border: 0; box-shadow: none; }
  .connect-actions { flex-direction: column; }
  .connect-actions .el-button { width: 100%; margin-left: 0; }
}
</style>
