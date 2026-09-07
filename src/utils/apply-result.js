import { confirmAndRestart } from "@/utils/restart-flow"

const STATUS_EVENT = "zhenxun-restart-status-changed"

export const notifyRestartStatusChanged = () => {
  window.dispatchEvent(new CustomEvent(STATUS_EVENT))
}

export async function handleApplyResult(vm, response, options = {}) {
  const data = response?.data || {}
  const mode = data.apply_mode || (data.restart_required ? "restart_pending" : "config_reloaded")

  notifyRestartStatusChanged()
  if (mode === "failed") {
    vm.$message.error(response?.info || options.failedMessage || "应用失败，修改已回滚。")
    return false
  }
  if (mode === "no_change") {
    vm.$message.info(options.noChangeMessage || "没有实际变化。")
    return true
  }
  if (mode === "new_session") {
    vm.$message.success(options.newSessionMessage || "配置已保存，将从新会话开始生效。")
    return true
  }
  if (mode === "restart_pending") {
    if (!data.restart_available || !options.restartRequest) {
      vm.$message.warning(options.manualRestartMessage || "配置已保存，请手动重启真寻后生效。")
      return true
    }
    return confirmAndRestart(vm, {
      prompt: options.restartPrompt || "配置已保存，需要重启后生效。",
      request: options.restartRequest,
      recovery: {
        policy: "preserve",
        returnRoute: options.returnRoute || vm.$route?.path || "/dashboard",
        message: options.recoveryMessage || "正在等待 launcher 启动新的真寻进程。",
        accessUrls: data.access_urls || [],
        accessTargets: data.access_targets || [],
        ...(options.recovery || {}),
      },
    })
  }
  if (mode === "restart_requested") return true
  if (["saved", "saved_only"].includes(mode)) {
    vm.$message.success("配置已保存，尚未应用到当前运行状态。")
    return true
  }
  if (!["config_reloaded", "hot_reloaded", "component_restarted", "plugin_reactivated"].includes(mode)) {
    vm.$message.warning("配置已保存，生效状态待确认。")
    return true
  }
  vm.$message.success(
    options.successMessage || response?.info || (mode === "hot_reloaded" ? "已热加载。" : "配置已保存并生效。"),
  )
  return true
}

export const RESTART_STATUS_EVENT = STATUS_EVENT
