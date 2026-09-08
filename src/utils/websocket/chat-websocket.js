// import router from "@/router/routers" //引入router, 作页面跳转
// import store from "@/store" //引入store, 作聊天消息存储
import vue from "@/main"
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

function scheduleReconnect(context) {
  if (isBusinessNetworkFrozen() || !reconnectEnabled || reconnectTimer) return
  emitWebSocketState("chat", "reconnecting")
  reconnectTimer = setTimeout(() => {
    reconnectTimer = null
    if (reconnectEnabled) context.initWebSocket()
  }, 3000)
}

async function chatWebsocketOnmessage(event) {
  if (isBusinessNetworkFrozen()) return
  const data = JSON.parse(event.data)
  const botInfo = vue.$store.state.botInfo
  if (!botInfo?.self_id || !Array.isArray(data.message)) return

  for (let i = 0; i < data.message.length; i++) {
    const e = data.message[i]
    e.msg = e.msg.replace("&#91;", "[").replace("&#93;", "]")
  }
  const bot_id = botInfo.self_id
  if (data.user_id != bot_id) {
    vue.$store.commit("ADD_CHAT_MSG", { chatId: data.object_id, obj: data })
    const type = data.group_id ? "group" : "private"

    if (typeof window.sortFriendGroupList === "function") {
      window.sortFriendGroupList(type)
    }
    if (data.object_id == vue.$store.state._chatId) {
      vue.$nextTick(() => {
        var divElement = document.getElementById("chat")
        if (divElement) {
          divElement.scrollTop = divElement.scrollHeight
        }
      })
    }
  }
}

const chatWebSocket = {
  ws: null,
  //发送ws方法
  sendMessage: function (botInfo, groupId, userId, msg) {
    return new Promise((resolve, reject) => {
      if (isBusinessNetworkFrozen() || !msg || !botInfo?.self_id) {
        return resolve()
      }

      vue
        .postRequest(`${vue.$root.prefix}/manage/send_message`, {
          bot_id: botInfo.self_id,
          group_id: groupId,
          user_id: userId,
          message: msg,
        })
        .then((resp) => {
          if (resp.suc) {
            if (resp.warning) {
              vue.$message.warning(resp.warning)
            } else {
              vue.$message.success(resp.info)

              const msgObj = {
                user_id: botInfo.self_id,
                message: [{ type: "text", msg: msg }],
                name: botInfo.name,
                ava_url: `http://q1.qlogo.cn/g?b=qq&nk=${botInfo.self_id}&s=160`,
              }
              vue.$store.commit("ADD_CHAT_MSG", {
                chatId: groupId || userId,
                obj: msgObj,
              })
              vue.$nextTick(() => {
                var divElement = document.getElementById("chat")
                if (divElement) {
                  divElement.scrollTop = divElement.scrollHeight
                }
              })
            }
          } else {
            vue.$message.error(resp.info)
          }
          return resolve(resp)
        })
    })
  },
  //初始化ws
  initWebSocket: function () {
    if (isBusinessNetworkFrozen()) return
    reconnectEnabled = true
    if (!ws) {
      emitWebSocketState("chat", "connecting")
      const websocket = createAuthenticatedWebSocket("/zhenxun/socket/chat")
      if (!websocket) return
      ws = websocket
      this.ws = websocket
      startHeartbeat()
      websocket.onopen = () => {
        if (isBusinessNetworkFrozen() || ws !== websocket) return
        console.log("CHAT WebSocket 已连接...")
        emitWebSocketState("chat", "connected")
      }
      websocket.onmessage = (event) => {
        if (!isBusinessNetworkFrozen() && ws === websocket) return chatWebsocketOnmessage(event)
      }
      websocket.onclose = (event) => {
        if (ws !== websocket) return
        if (ws === websocket) {
          ws = null
          this.ws = null
        }
        stopHeartbeat()
        if (event.code === 1013) {
          reconnectEnabled = false
          emitWebSocketState("chat", "limited")
          vue.$message.warning("聊天连接已达到上限或接收过慢，请关闭其他聊天页面后重新连接。")
          return
        }
        if (handleAuthenticatedWebSocketClose(event)) {
          reconnectEnabled = false
          emitWebSocketState("chat", "idle")
          return
        }
        if (reconnectEnabled) scheduleReconnect(this)
        else emitWebSocketState("chat", "idle")
      }
    }
  },
  //断开socked方法
  closeWebSocket: function () {
    console.log("关闭ws")
    reconnectEnabled = false
    emitWebSocketState("chat", "idle")
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
  if (frozen) chatWebSocket.closeWebSocket()
})

export default chatWebSocket
