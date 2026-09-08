// import router from "@/router/routers" //引入router, 作页面跳转
// import store from "@/store" //引入store, 作聊天消息存储
import {
  createAuthenticatedWebSocket,
  emitWebSocketState,
  handleAuthenticatedWebSocketClose,
  safeWebSocketSend,
} from "./create-websocket"
import { isBusinessNetworkFrozen, onBusinessNetworkChange } from "@/utils/restart-network"

var ws = null
var heartbeatInterval = null
var reconnectTimer = null
var reconnectEnabled = true

function startHeartbeat() {
  heartbeatInterval = setInterval(() => {
    safeWebSocketSend(ws, "ping")
  }, 5000)
}

function stopHeartbeat() {
  if (heartbeatInterval) {
    clearInterval(heartbeatInterval)
    heartbeatInterval = null
  }
}

function scheduleReconnect(onMessage, context) {
  if (isBusinessNetworkFrozen() || !reconnectEnabled || reconnectTimer) return
  emitWebSocketState("status", "reconnecting")
  reconnectTimer = setTimeout(() => {
    reconnectTimer = null
    if (reconnectEnabled) context.initWebSocket(onMessage)
  }, 3000)
}

const statusWebSocket = {
  ws: null,
  //初始化ws
  initWebSocket: function (onMessage) {
    if (isBusinessNetworkFrozen()) return
    reconnectEnabled = true
    if (!ws) {
      emitWebSocketState("status", "connecting")
      console.log("STATUS_WS_URL WebSocket 正在连接...")

      const websocket = createAuthenticatedWebSocket(
        "/zhenxun/socket/system_status"
      )
      if (!websocket) return
      ws = websocket
      this.ws = websocket
      startHeartbeat()
      websocket.onopen = () => {
        if (isBusinessNetworkFrozen() || ws !== websocket) return
        console.log("STATUS_WS_URL WebSocket 已连接...")
        emitWebSocketState("status", "connected")
      }
      websocket.onmessage = (event) => {
        if (!isBusinessNetworkFrozen() && ws === websocket) onMessage(event)
      }
      websocket.onclose = (event) => {
        if (ws !== websocket) return
        if (ws === websocket) {
          ws = null
          this.ws = null
        }
        stopHeartbeat()
        if (handleAuthenticatedWebSocketClose(event)) {
          reconnectEnabled = false
          emitWebSocketState("status", "idle")
          return
        }
        if (reconnectEnabled) scheduleReconnect(onMessage, this)
        else emitWebSocketState("status", "idle")
      }
    }
  },
  //断开socked方法
  closeWebSocket: function () {
    console.log("关闭ws")
    reconnectEnabled = false
    emitWebSocketState("status", "idle")
    if (reconnectTimer) {
      clearTimeout(reconnectTimer)
      reconnectTimer = null
    }
    stopHeartbeat()
    const websocket = ws
    ws = null
    this.ws = null
    if (websocket && websocket.readyState <= WebSocket.OPEN) {
      websocket.close()
    }
  },
}

onBusinessNetworkChange((frozen) => {
  if (frozen) statusWebSocket.closeWebSocket()
})

export default statusWebSocket
