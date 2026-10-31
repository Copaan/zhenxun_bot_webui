<template>
  <div class="login-page">
    <div class="login-card">
      <img
        :src="logoUrl"
        alt="Logo"
        class="login-logo"
        :class="{ 'animate-pulse': loading }"
      />

      <el-form
        @submit.native.prevent
        v-loading="loading"
        element-loading-text="正在登录..."
        element-loading-spinner="el-icon-loading"
        element-loading-custom-class="rounded-lg"
        :rules="rules"
        ref="loginForm"
        :model="loginForm"
        label-position="top"
        class="login-form"
      >
        <el-form-item prop="username" label="账号">
          <el-input
            v-model="loginForm.username"
            placeholder="请输入用户名"
            prefix-icon="el-icon-user"
            autocomplete="username"
          />
        </el-form-item>

        <el-form-item prop="password" label="密码">
          <el-input
            v-model="loginForm.password"
            placeholder="请输入密码"
            prefix-icon="el-icon-lock"
            type="password"
            show-password
            autocomplete="current-password"
          />
        </el-form-item>

        <div class="login-actions">
          <CuteButton
            type="secondary"
            icon="server"
            @click="changeApi"
            iconColor="var(--button-icon-color-default)"
          >
            地址设置
          </CuteButton>
          <CuteButton
            type="primary"
            icon="login"
            @click="submitLogin"
            :loading="loading"
            iconColor="var(--button-icon-color-primary)"
          >
            登录
          </CuteButton>
        </div>
      </el-form>

      <div
        id="forgetPwd"
        class="mt-4 text-center relative"
        style="height: 40px"
        @mouseenter="startButtonDance"
      >
        <el-button
          type="text"
          class="absolute transition-all duration-300 ease-out"
          :class="{
            'cursor-not-allowed': isButtonMoving,
            'cursor-pointer': !isButtonMoving,
          }"
          :style="{
            ...buttonPosition,
            color: isButtonMoving
              ? 'var(--danger-color)'
              : 'var(--primary-color)',
          }"
          @click="handleForgetPassword"
        >
          忘记密码
          <transition name="el-zoom-in-top">
            <p
              v-if="showTaunt"
              class="ml-2 text-xs"
              :style="{
                color: isButtonMoving
                  ? 'var(--danger-color)'
                  : 'var(--primary-color-light)',
              }"
            >
              {{ currentTaunt }}
            </p>
          </transition>
        </el-button>
      </div>
    </div>

    <!-- 添加了键盘提示 -->
    <transition name="el-fade-in">
      <div
        v-if="showKeyboardHint"
        class="fixed bottom-4 left-1/2 transform -translate-x-1/2 px-4 py-2 rounded-full shadow-md text-sm flex items-center"
        :style="{
          backgroundColor: 'var(--bg-color-secondary)',
          color: 'var(--text-color)',
        }"
      >
        <kbd
          class="px-2 py-1 rounded mr-2"
          :style="{ backgroundColor: 'var(--bg-color-hover)' }"
          >Enter</kbd
        >
        <span>快速登录</span>
      </div>
    </transition>
  </div>
</template>

<script>
import qs from "qs"
import logoUrl from "@/assets/image/logo.png"
import { syncApiWithBrowserLocation } from "@/utils/api"
import { establishSession } from "@/utils/auth-session"
import { clearAuthenticationState } from "@/utils/auth-session"
import CuteButton from "@/components/ui/CuteButton.vue"

export default {
  name: "MainLogin",
  components: { CuteButton },
  data() {
    const validateName = (rules, value, callback) => {
      if (!value) {
        callback(new Error("账号不能为空哦~"))
      } else {
        callback()
      }
    }
    const validatePwd = (rules, value, callback) => {
      if (!value) {
        callback(new Error("密码不能为空哦~"))
      } else {
        callback()
      }
    }
    return {
      logoUrl,
      loginForm: {
        username: "",
        password: "",
      },
      rules: {
        username: [{ validator: validateName, trigger: "blur" }],
        password: [{ validator: validatePwd, trigger: "blur" }],
      },
      loading: false,
      showKeyboardHint: false,

      // 忘记密码按钮相关状态
      isButtonMoving: false,
      showTaunt: false,
      currentTaunt: "",
      buttonPosition: {
        left: "50%",
        top: "0",
        transform: "translateX(-50%)",
      },
      taunts: [
        "哈哈，抓不到我吧！",
        "别试了，你点不到的~",
        "这么容易忘记密码？",
        "管理员联系方式？想得美！",
        "再试一次？再试也点不到！",
        "你的鼠标速度太慢啦！",
        "这就是你忘记密码的惩罚！",
        "点不到点不到~",
        "密码都记不住，还想点我？",
        "放弃吧，你抓不到我的！",
      ],
      danceInterval: null,
    }
  },
  methods: {
    async checkFirstRun() {
      try {
        const response = await this.getRequest(
          `${this.$root.prefix}/configure/status`
        )
        const state = response && response.data && response.data.state
        if (["unconfigured", "partial", "restart_pending"].includes(state)) {
          this.$router.replace("/configure")
        }
      } catch (error) {
        // Login remains available when an older backend has no setup status route.
      }
    },
    async submitLogin() {
      try {
        const valid = await new Promise((resolve) => {
          this.$refs.loginForm.validate((isValid) => resolve(isValid))
        })
        if (!valid) return

        this.loading = true
        const response = await this.postRequest(
          `${this.$root.prefix}/login`,
          qs.stringify({
            username: this.loginForm.username,
            password: this.loginForm.password,
          }),
          { headers: { "Content-Type": "application/x-www-form-urlencoded" } }
        )

        if (response.suc) {
          if (response.warning) {
            this.$message.warning(response.warning)
          } else {
            this.$message.success({
              message: response.info,
              duration: 1500,
              showClose: true,
            })

            establishSession(`${response.data.token_type} ${response.data.access_token}`)
            if (response.data.transport_warning) {
              this.$message.warning({ message: response.data.transport_warning, duration: 8000, showClose: true })
            }

            const requestedPath = String(this.$route.query.redirect || "")
            const path = requestedPath.startsWith("/") && !requestedPath.startsWith("//")
              ? requestedPath
              : "/home"
            this.$router.replace(
              path === "/" ? "/home" : path
            )
          }
        } else {
          this.$message.error({
            message: response.info,
            duration: 2000,
            showClose: true,
          })
        }
      } catch (error) {
        console.error("登录错误:", error)
        this.$message.error("登录过程中发生错误")
      } finally {
        this.loading = false
      }
    },

    changeApi() {
      this.$router.replace("/myapi")
    },

    // 忘记密码按钮相关方法
    startButtonDance() {
      if (this.isButtonMoving) return

      this.isButtonMoving = true
      this.showTaunt = true
      this.currentTaunt =
        this.taunts[Math.floor(Math.random() * this.taunts.length)]

      // 清除之前的定时器
      if (this.danceInterval) {
        clearInterval(this.danceInterval)
      }

      // 随机移动按钮
      this.danceInterval = setInterval(() => {
        const container = document.querySelector("#forgetPwd")
        if (!container) {
          clearInterval(this.danceInterval)
          return
        }

        const containerRect = container.getBoundingClientRect()
        const maxLeft = containerRect.width - 100
        const maxTop = containerRect.height - 40

        const newLeft = Math.random() * maxLeft
        const newTop = Math.random() * maxTop

        this.buttonPosition = {
          left: `${newLeft}px`,
          top: `${newTop}px`,
          transform: "none",
        }
      }, 800)

      // 60秒后停止移动
      setTimeout(() => {
        clearInterval(this.danceInterval)
        this.isButtonMoving = false
        this.buttonPosition = {
          left: "50%",
          top: "0",
          transform: "translateX(-50%)",
        }

        // 3秒后隐藏嘲讽文字
        setTimeout(() => {
          this.showTaunt = false
        }, 3000)
      }, 60000)
    },

    handleForgetPassword() {
      if (!this.isButtonMoving) {
        this.$message.warning({
          message: "密码已加密保存，无法查看。可以打开控制台本次启动输出的连接链接直接登录，再修改密码；也可以在服务器上把 data/config.yaml 中 web-ui 的 password 改为新密码，重启后用新密码登录。",
          duration: 8000,
        })
      } else {
        this.$message.error("抓不到我吧！")
      }
    },
  },
  mounted() {
    if (this.$route.query.reauth === "1") {
      clearAuthenticationState()
      syncApiWithBrowserLocation()
    }
    this.checkFirstRun()

    // 添加键盘事件监听
    const handleKeyDown = (event) => {
      if (event.code === "Enter") {
        event.preventDefault()
        this.submitLogin()
      }
    }

    document.addEventListener("keydown", handleKeyDown)

    // 组件销毁时移除事件监听
    this.$once("hook:beforeDestroy", () => {
      document.removeEventListener("keydown", handleKeyDown)
      if (this.danceInterval) {
        clearInterval(this.danceInterval)
      }
    })
  },
}
</script>

<style scoped>
.login-page {
  display: flex;
  min-height: 100vh;
  align-items: center;
  justify-content: center;
  padding: 24px 16px;
  background: radial-gradient(
      circle at 50% 0%,
      var(--primary-color-light-9),
      transparent 60%
    ),
    var(--bg-color);
}

.login-card {
  width: 100%;
  max-width: 420px;
  padding: 32px 32px 16px;
  border: 1px solid var(--border-color);
  border-radius: 20px;
  background: var(--bg-color-secondary);
  box-shadow: 0 18px 48px rgba(15, 23, 42, 0.08);
}

.login-logo {
  display: block;
  width: 240px;
  max-width: 80%;
  margin: 0 auto 24px;
  object-fit: contain;
}

.login-form ::v-deep .el-form-item {
  margin-bottom: 18px;
}

.login-form ::v-deep .el-form-item__label {
  padding-bottom: 6px;
  color: var(--text-color);
  font-weight: 500;
  line-height: 20px;
}

.login-form ::v-deep .el-input__inner {
  height: 42px;
  border-radius: 12px;
}

.login-form ::v-deep .el-input__icon {
  line-height: 42px;
}

.login-actions {
  display: flex;
  gap: 12px;
  margin-top: 26px;
}

.login-actions > * {
  flex: 1;
}

@media (max-width: 480px) {
  .login-card {
    padding: 28px 20px 12px;
  }

  .login-actions {
    flex-direction: column-reverse;
  }
}

kbd {
  font-family: ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas,
    "Liberation Mono", "Courier New", monospace;
  border: 1px solid var(--el-border-color);
  border-bottom-width: 2px;
}
</style>
