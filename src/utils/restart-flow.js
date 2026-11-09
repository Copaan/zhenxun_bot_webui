import { startRestartRecovery } from "@/utils/restart-recovery"
import { isBusinessNetworkFrozen } from "@/utils/restart-network"

let submitting = false
let confirming = false

export async function confirmRestart(vm, message) {
  if (confirming || submitting || isBusinessNetworkFrozen()) return false
  confirming = true
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
  } finally {
    confirming = false
  }
}

export async function requestRestartWithRecovery(vm, { request, recovery = {} }) {
  if (submitting || isBusinessNetworkFrozen() || vm._isDestroyed || vm._isBeingDestroyed || vm.destroyed) return false
  submitting = true
  let loading
  try {
    loading = vm.$loading({
      lock: true,
      text: "正在提交重启请求...",
      background: "rgba(250, 251, 253, 0.96)",
    })
    const response = await request()
    if (!response || !response.suc) {
      throw new Error((response && response.info) || "重启请求未被接受。")
    }
    const data = response.data || {}
    const returnedUrls = data.target_access_urls ?? data.access_urls
    const returnedTargets = data.target_access_targets ?? data.access_targets
    const authoritative = Array.isArray(returnedUrls) || Array.isArray(returnedTargets)
    startRestartRecovery({
      bootId: data.boot_id,
      accessUrls: authoritative ? returnedUrls || [] : recovery.accessUrls || [],
      accessTargets: authoritative ? returnedTargets || [] : recovery.accessTargets || [],
      preferredUrl: authoritative ? data.preferred_url || "" : recovery.preferredUrl || "",
      policy: recovery.policy || "preserve",
      returnRoute: recovery.returnRoute,
      message: recovery.message,
      setup: Boolean(recovery.setup),
    })
    return true
  } finally {
    submitting = false
    loading?.close()
  }
}

export async function confirmAndRestart(vm, options) {
  if (!(await confirmRestart(vm, options.prompt))) return false
  return requestRestartWithRecovery(vm, options)
}
