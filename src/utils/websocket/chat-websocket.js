import { getAuthToken, hasValidAuthToken } from "@/utils/auth-token"
// import router from "@/router/routers" //引入router, 作页面跳转
// import store from "@/store" //引入store, 作聊天消息存储
import vue from "@/main"
import {
  bindSocketActivity,
  createAuthenticatedWebSocket,
  emitWebSocketState,
  handleAuthenticatedWebSocketClose,
  safeWebSocketSend,
} from "./create-websocket"
import { businessNetworkEpoch, isBusinessNetworkFrozen } from "@/utils/restart-network"

var ws = null
var heartbeatInterval = null
var reconnectTimer = null
var reconnectEnabled = true
const hiddenMessages = new Map()
let flushing = false
let hiddenEvicted = 0
let connectionLimited = false

function startHeartbeat() {
  heartbeatInterval = setInterval(() => {
    safeWebSocketSend(ws, "ping")
  }, 15000)
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

/**
 * 当前时间文本，包含明确的 UTC 时区
 * @returns {string} ISO 8601 时间
 */
function currentTimeText() {
  return new Date().toISOString()
}

async function chatWebsocketOnmessage(event) {
  if (isBusinessNetworkFrozen()) return
  let data
  try { data = JSON.parse(event.data) } catch (error) { return }
  const botInfo = vue.$store.state.botInfo
  if (!botInfo?.self_id || !Array.isArray(data.message)) return
  if (data.bot_id && data.bot_id != botInfo.self_id) return

  if (document.hidden) {
    const key = String(data.bot_id || botInfo.self_id) + ":" + data.object_id
    const items = hiddenMessages.get(key) || []
    items.push(data)
    if (items.length > 50) { items.shift(); hiddenEvicted += 1 }
    hiddenMessages.delete(key)
    hiddenMessages.set(key, items)
    if (hiddenMessages.size > 100) {
      const oldest = hiddenMessages.keys().next().value
      hiddenEvicted += hiddenMessages.get(oldest).length
      hiddenMessages.delete(oldest)
    }
    return
  }
  for (let i = 0; i < data.message.length; i++) {
    const e = data.message[i]
    e.msg = e.msg.replace(/&#91;/g, "[").replace(/&#93;/g, "]")
  }
  const bot_id = botInfo.self_id
  if (data.user_id != bot_id) {
    vue.$store.commit("ADD_CHAT_MSG", { chatId: data.object_id, obj: data })
    const type = data.group_id ? "group" : "private"

    if (!flushing && typeof window.sortFriendGroupList === "function") {
      window.sortFriendGroupList(type)
    }
    if (!flushing && data.object_id == vue.$store.state._chatId) {
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
  sendMessage: async function (botInfo, groupId, userId, msg) {
    if (isBusinessNetworkFrozen() || !msg || !botInfo?.self_id) return
    const epoch = businessNetworkEpoch()
    const token = getAuthToken()
    const botKey = botInfo.bot_key || botInfo.self_id
    const resp = await vue.postRequest(`${vue.$root.prefix}/manage/send_message`, {
      bot_id: botInfo.self_id,
      group_id: groupId,
      user_id: userId,
      message: msg,
    })
    if (epoch !== businessNetworkEpoch() || token !== getAuthToken() || isBusinessNetworkFrozen() || !hasValidAuthToken() || botKey !== (vue.$store.state.botInfo?.bot_key || vue.$store.state.botInfo?.self_id)) return resp
    if (!resp.suc) {
      vue.$message.error(resp.info)
    } else if (resp.warning) {
      vue.$message.warning(resp.warning)
    } else {
      vue.$message.success(resp.info)
      vue.$store.commit("ADD_CHAT_MSG", {
        chatId: groupId || userId,
        obj: {
          message_id: resp.data?.message_id,
          bot_id: botInfo.self_id,
          object_id: groupId || userId,
          group_id: groupId || null,
          user_id: botInfo.self_id,
          message: [{ type: "text", msg: msg, time: resp.data?.sent_at || currentTimeText() }],
          name: botInfo.nickname,
          ava_url: botInfo.ava_url,
          isSelf: true,
        },
      })
      vue.$nextTick(() => {
        var divElement = document.getElementById("chat")
        if (divElement) {
          divElement.scrollTop = divElement.scrollHeight
        }
      })
    }
    return resp
  },
  //初始化ws
  initWebSocket: function () {
    if (isBusinessNetworkFrozen()) return
    flushHiddenMessages()
    if (connectionLimited) { emitWebSocketState("chat", "limited"); return }
    reconnectEnabled = true
    if (!ws) {
      emitWebSocketState("chat", "connecting")
      const websocket = createAuthenticatedWebSocket("/zhenxun/socket/chat")
      if (!websocket) return
      ws = websocket
      this.ws = websocket
      websocket.onopen = () => {
        if (isBusinessNetworkFrozen() || ws !== websocket) return
        stopHeartbeat()
        startHeartbeat()
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
          connectionLimited = true
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
    hiddenMessages.clear()
    hiddenEvicted = 0
    this.suspendWebSocket()
  },
  retryWebSocket: function () {
    if (isBusinessNetworkFrozen() || !hasValidAuthToken()) return
    connectionLimited = false
    this.initWebSocket()
  },
  suspendWebSocket: function () {
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

function flushHiddenMessages() {
  if (document.hidden || isBusinessNetworkFrozen() || !hasValidAuthToken()) return
  flushing = true
  for (const items of hiddenMessages.values()) {
    for (const data of items) chatWebsocketOnmessage({ data: JSON.stringify(data) })
  }
  hiddenMessages.clear()
  flushing = false
  if (hiddenEvicted) vue.$message.info("后台消息缓存已淘汰 " + hiddenEvicted + " 条较早消息；当前页面不提供完整历史。")
  hiddenEvicted = 0
  if (typeof window.sortFriendGroupList === "function") {
    window.sortFriendGroupList("group")
    window.sortFriendGroupList("private")
  }
}
document.addEventListener("visibilitychange", flushHiddenMessages)
window.addEventListener("zhenxun-auth-expired", () => { connectionLimited = false })
bindSocketActivity(chatWebSocket, { pauseWhenHidden: false })

export default chatWebSocket
