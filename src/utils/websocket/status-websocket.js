// import router from "@/router/routers" //引入router, 作页面跳转
// import store from "@/store" //引入store, 作聊天消息存储
import {
  createAuthenticatedWebSocket,
  emitWebSocketState,
  handleAuthenticatedWebSocketClose,
  safeWebSocketSend,
} from "./create-websocket"

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
  if (!reconnectEnabled || reconnectTimer) return
  emitWebSocketState("status", "reconnecting")
  reconnectTimer = setTimeout(() => {
    reconnectTimer = null
    if (reconnectEnabled) context.initWebSocket(onMessage)
  }, 3000)
}

export default {
  ws: null,
  //初始化ws
  initWebSocket: function (onMessage) {
    reconnectEnabled = true
    if (!ws) {
      emitWebSocketState("status", "connecting")
      console.log("STATUS_WS_URL WebSocket 正在连接...")

      const websocket = createAuthenticatedWebSocket(
        "/zhenxun/socket/system_status"
      )
      ws = websocket
      this.ws = websocket
      startHeartbeat()
      websocket.onopen = () => {
        console.log("STATUS_WS_URL WebSocket 已连接...")
        emitWebSocketState("status", "connected")
      }
      websocket.onmessage = onMessage
      websocket.onclose = (event) => {
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
    if (ws && ws.readyState <= WebSocket.OPEN) {
      ws.close()
    }
  },
}
