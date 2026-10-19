<template>
  <section class="bot-required-state" :class="`is-${state}`">
    <div class="state-icon" aria-hidden="true">
      <i :class="iconClass"></i>
    </div>
    <h1>{{ title }}</h1>
    <p>{{ description }}</p>
    <div class="state-actions">
      <el-button
        v-if="state !== 'loading' && state !== 'unsupported'"
        type="primary"
        icon="el-icon-connection"
        @click="$emit('configure')"
      >前往协议端设置</el-button>
      <el-button
        v-if="state === 'unsupported'"
        type="primary"
        icon="el-icon-sort"
        @click="$emit('switch-supported')"
      >{{ hasSupportedBot ? "切换到 OneBot 账号" : "去接入 OneBot" }}</el-button>
      <el-button
        :loading="state === 'loading'"
        icon="el-icon-refresh"
        @click="$emit('retry')"
      >重新检查</el-button>
    </div>
  </section>
</template>

<script>
export default {
  name: "BotRequiredState",
  props: {
    state: {
      type: String,
      default: "empty",
      validator: (value) =>
        ["loading", "empty", "error", "unsupported"].includes(value),
    },
    hasSupportedBot: {
      type: Boolean,
      default: false,
    },
  },
  computed: {
    iconClass() {
      if (this.state === "loading") return "el-icon-loading"
      if (this.state === "error") return "el-icon-warning-outline"
      if (this.state === "unsupported") return "el-icon-info"
      return "el-icon-connection"
    },
    title() {
      if (this.state === "loading") return "正在检查机器人连接"
      if (this.state === "error") return "暂时无法读取机器人状态"
      if (this.state === "unsupported") return "当前账号不支持此管理功能"
      return "还没有机器人连接"
    },
    description() {
      if (this.state === "loading") return "连接信息就绪后会自动打开当前页面。"
      if (this.state === "error") return "可以重新检查，或前往协议端设置确认连接状态。"
      if (this.state === "unsupported") return "当前 Bot 不是 OneBot V11 协议，此页面依赖 OneBot V11 的好友、群组或管理接口。"
      return "连接机器人后即可使用当前管理功能，其他 WebUI 页面仍可正常访问。"
    },
  },
}
</script>

<style scoped>
.bot-required-state {
  display: flex;
  min-height: 100%;
  align-items: center;
  justify-content: center;
  flex-direction: column;
  padding: 32px;
  text-align: center;
  color: var(--text-color);
  background: var(--bg-color-secondary);
}

.state-icon {
  display: grid;
  width: 52px;
  height: 52px;
  place-items: center;
  margin-bottom: 18px;
  border: 1px solid var(--border-color);
  border-radius: 8px;
  color: var(--primary-color);
  background: var(--bg-color-hover);
  font-size: 24px;
}

.is-error .state-icon {
  color: var(--danger-color);
}

h1 {
  margin: 0;
  font-size: 22px;
  letter-spacing: 0;
}

p {
  max-width: 520px;
  margin: 10px 0 22px;
  color: var(--text-color-secondary);
  line-height: 1.7;
}

.state-actions {
  display: flex;
  gap: 10px;
}

@media (max-width: 520px) {
  .bot-required-state { padding: 24px 18px; }
  .state-actions { width: 100%; flex-direction: column; }
  .state-actions .el-button { width: 100%; margin-left: 0; }
}
</style>
