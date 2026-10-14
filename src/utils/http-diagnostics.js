export const httpModeLabel = mode => ({
  serve: "完整访问", redirect: "仅跳转HTTPS", disabled: "关闭",
}[mode] || mode || "未知")

export const httpStateLabel = state => ({
  ready: "已监听", starting: "启动中", stopped: "已停止",
  degraded: "降级", disabled: "未启用",
}[state] || state || "未确认")

export const httpErrorLabel = code => ({
  address_in_use: "端口已被占用",
  address_unavailable: "监听地址不可用",
  permission_denied: "监听权限不足",
  listener_bind_failed: "监听绑定失败",
}[code] || code || "监听未就绪")
