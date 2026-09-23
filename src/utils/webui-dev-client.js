export default class ManagedWebSocketClient {
  constructor(url) {
    this.client = new WebSocket(url)
  }

  onOpen(callback) {
    this.client.onopen = (event) => {
      const notice = document.getElementById("webui-dev-disconnected")
      if (notice) notice.remove()
      callback(event)
    }
  }

  onClose(callback) {
    this.client.onclose = (event) => {
      if (!document.getElementById("webui-dev-disconnected") && document.body) {
        const notice = document.createElement("div")
        notice.id = "webui-dev-disconnected"
        notice.setAttribute("role", "status")
        notice.textContent = "开发服务连接已断开，实时更新暂不可用。正在重连；持续失败请检查 launcher 输出。"
        notice.style.cssText = "position:fixed;z-index:2147483646;bottom:16px;left:16px;right:16px;padding:14px 20px;border:1px solid #e6a23c;background:#fdf6ec;color:#805500;border-radius:8px;font-size:14px;line-height:1.5"
        document.body.appendChild(notice)
      }
      callback(event)
    }
  }

  onMessage(callback) {
    this.client.onmessage = (event) => callback(event.data)
  }
}
