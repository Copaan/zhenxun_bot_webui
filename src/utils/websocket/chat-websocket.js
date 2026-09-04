// import router from "@/router/routers" //引入router, 作页面跳转
// import store from "@/store" //引入store, 作聊天消息存储
import vue from "@/main"
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

function scheduleReconnect(context) {
  if (!reconnectEnabled || reconnectTimer) return
  emitWebSocketState("chat", "reconnecting")
  reconnectTimer = setTimeout(() => {
    reconnectTimer = null
    if (reconnectEnabled) context.initWebSocket()
  }, 3000)
}

async function chatWebsocketOnmessage(event) {
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

export default {
  ws: null,
  //发送ws方法
  sendMessage: function (botInfo, groupId, userId, msg) {
    return new Promise((resolve, reject) => {
      if (!msg || !botInfo?.self_id) {
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
    reconnectEnabled = true
    if (!ws) {
      emitWebSocketState("chat", "connecting")
      const websocket = createAuthenticatedWebSocket("/zhenxun/socket/chat")
      ws = websocket
      this.ws = websocket
      startHeartbeat()
      websocket.onopen = () => {
        console.log("CHAT WebSocket 已连接...")
        emitWebSocketState("chat", "connected")
      }
      websocket.onmessage = chatWebsocketOnmessage
      websocket.onclose = (event) => {
        if (ws === websocket) {
          ws = null
          this.ws = null
        }
        stopHeartbeat()
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
    if (ws && ws.readyState <= WebSocket.OPEN) {
      ws.close()
    }
  },
}
