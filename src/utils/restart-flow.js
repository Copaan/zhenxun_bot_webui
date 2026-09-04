import { startRestartRecovery } from "@/utils/restart-recovery"

export async function confirmRestart(vm, message) {
  try {
    await vm.$confirm(message, "配置已保存", {
      type: "warning",
      confirmButtonText: "立即重启",
      cancelButtonText: "稍后处理",
      closeOnClickModal: false,
    })
    return true
  } catch (error) {
    return false
  }
}

export async function requestRestartWithRecovery(vm, { request, recovery }) {
  const loading = vm.$loading({
    lock: true,
    text: "正在提交重启请求...",
    background: "rgba(250, 251, 253, 0.96)",
  })
  try {
    const response = await request()
    if (!response || !response.suc) {
      throw new Error((response && response.info) || "重启请求未被接受。")
    }
    startRestartRecovery({
      bootId: response.data.boot_id,
      accessUrls:
        recovery.accessUrls?.length
          ? recovery.accessUrls
          : response.data.access_urls || [],
      accessTargets:
        recovery.accessTargets?.length
          ? recovery.accessTargets
          : response.data.access_targets || [],
      preferredUrl: recovery.preferredUrl || response.data.preferred_url || "",
      policy: recovery.policy || "preserve",
      returnRoute: recovery.returnRoute,
      message: recovery.message,
      setup: Boolean(recovery.setup),
    })
    return true
  } finally {
    loading.close()
  }
}

export async function confirmAndRestart(vm, options) {
  if (!(await confirmRestart(vm, options.prompt))) return false
  return requestRestartWithRecovery(vm, options)
}
