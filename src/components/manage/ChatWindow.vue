<template>
  <div class="chat-window">
    <p v-if="chatLimited" class="history-note" role="status">实时连接已暂停，请关闭多余聊天页面后手动重连。<el-button type="text" size="mini" @click="$chatWebSocket.retryWebSocket()">重新连接</el-button></p>
    <el-empty v-if="!isStartChat" class="chat-empty" :image="emptyChatUrl" :image-size="180" description="选择一个好友或群组开始聊天" />

    <template v-else>
      <header class="chat-header">
        <div class="chat-title">
          <el-avatar :src="chatInfo.ava_url" :size="36" />
          <div>
            <h2 :title="chatInfo.name">{{ chatInfo.name }}</h2>
            <p>{{ chatInfo.group_id ? `群号 ${chatInfo.group_id}` : `QQ ${chatInfo.user_id}` }}</p>
          </div>
        </div>
        <div class="chat-history-actions"><el-button v-if="chatInfo.group_id" size="mini" :loading="historyLoading" @click="loadHistory(true)">读取最近记录</el-button><el-button size="mini" icon="el-icon-delete" @click="clearMessage">清空本地消息</el-button></div>
      </header>

      <div id="chat" class="chat-body">
        <p v-if="historyError" class="history-error">{{ historyError }} <el-button type="text" size="mini" :loading="historyLoading" @click="loadHistory(true)">重试</el-button></p>
        <p v-if="historyNote" class="history-note">{{ historyNote }}</p>
        <p v-if="historyLoading" class="chat-placeholder">正在读取当前 Bot、当前群最近的已存消息…</p>
        <p v-if="!msgList.length && !historyLoading" class="chat-placeholder">{{ chatInfo.group_id ? "暂无已存消息，实时消息会继续显示。" : "私聊显示打开本页后收到和发出的消息。" }}</p>
        <div
          v-for="(data, index) in msgList"
          :key="index"
          class="message-row"
          :class="{ 'is-self': data.isSelf }"
        >
          <el-avatar :src="data.ava_url" :size="36" class="avatar" />
          <div class="message-wrapper">
            <p v-if="data.name" class="message-sender">{{ data.name }}</p>
            <div v-for="(msg, msgIndex) in data.message" :key="msgIndex" class="message-item">
              <div class="message-bubble">
                <img
                  v-if="msg.type == 'img'"
                  :src="msg.msg"
                  referrerpolicy="no-referrer"
                  class="message-image"
                />
                <span v-else class="message-text">{{ msg.msg }}</span>
              </div>
              <span class="message-time">{{ displayTime(msg.time) }}</span>
            </div>
          </div>
        </div>
      </div>

      <footer class="chat-input">
        <el-input
          v-model="message"
          :rows="3"
          type="textarea"
          resize="none"
          placeholder="输入消息，Enter 发送，Shift+Enter 换行"
          @keydown.enter.native="handleEnter"
        />
        <div class="chat-input-actions">
          <el-button size="small" @click="message = ''">清空</el-button>
          <el-button size="small" type="primary" icon="el-icon-s-promotion" @click="sendMessage">发送</el-button>
        </div>
      </footer>
    </template>
  </div>
</template>

<script>
import emptyChatUrl from "@/assets/image/empty1.png"
import { apiErrorDetail } from "@/utils/api-error"
import { businessNetworkEpoch, isBusinessNetworkFrozen, onBusinessNetworkChange } from "@/utils/restart-network"
import { hasValidAuthToken } from "@/utils/auth-token"

export default {
  name: "ChatWindow",
  data() {
    return {
      emptyChatUrl,
      message: "",
      isStartChat: false,
      chatInfo: {},
      chatId: "default",
      historyLoading: false, historyError: "", historyNote: "", historyRequest: 0, disposed: false, chatLimited: false,
    }
  },
  computed: {
    msgList() {
      return this.$store.state.chatObj[this.chatId]?.msgList || []
    },
  },
  watch: {
    msgList() {
      this.$nextTick(this.scrollToBottom)
    },
  },
  created() {
    this._chatSocketState = event => { if (event.detail?.channel === "chat") this.chatLimited = event.detail.status === "limited" }
    window.addEventListener("zhenxun-websocket-state", this._chatSocketState)
    this.botInfo = this.$store.state.botInfo || {}
    this._historyTimes = new Map()
    this._invalidateHistory = () => { this.historyRequest++; this.historyLoading = false }
    this._historyVisibility = () => { if (document.hidden) this._invalidateHistory(); else if (this.isStartChat) this.loadHistory() }
    document.addEventListener("visibilitychange", this._historyVisibility)
    window.addEventListener("zhenxun-auth-expired", this._invalidateHistory)
    this._offHistoryNetwork = onBusinessNetworkChange(frozen => { this._invalidateHistory(); if (!frozen && this.isStartChat) this.loadHistory() })
  },
  mounted() {
    if (this.botInfo.self_id) this.$store.dispatch("initChatSocket")
  },
  beforeDestroy() {
    window.removeEventListener("zhenxun-websocket-state", this._chatSocketState)
    this.disposed = true; this._invalidateHistory()
    document.removeEventListener("visibilitychange", this._historyVisibility)
    window.removeEventListener("zhenxun-auth-expired", this._invalidateHistory)
    this._offHistoryNetwork?.()
    this.$chatWebSocket.closeWebSocket()
  },
  methods: {
    displayTime(value) { const date = new Date(String(value).replace(" ", "T")); return Number.isNaN(date.getTime()) ? value : date.toLocaleString("zh-CN", { hour12: false }) },
    async loadHistory(force = false) {
      if (this.disposed || this.historyLoading || !this.chatInfo.group_id || document.hidden || !hasValidAuthToken() || isBusinessNetworkFrozen()) return
      const chatId = this.chatId, bot = this.botInfo, epoch = businessNetworkEpoch()
      if (!force && Date.now() - (this._historyTimes.get(chatId) || 0) < 30000) return
      const request = ++this.historyRequest
      const current = () => !this.disposed && request === this.historyRequest && chatId === this.chatId && epoch === businessNetworkEpoch() && hasValidAuthToken() && !isBusinessNetworkFrozen() && (this.$store.state.botInfo?.bot_key || this.$store.state.botInfo?.self_id) === (bot.bot_key || bot.self_id)
      this.historyLoading = true; this.historyError = ""
      try {
        const response = await this.getRequest(this.$root.prefix + "/manage/chat/history", { bot_id: bot.self_id, group_id: this.chatInfo.group_id, limit: 50 }, { timeout: 15000, suppressErrorToast: true })
        if (!current()) return
        if (!response.suc || response.warning) throw new Error(response.info || "历史消息暂不可用")
        const items = (response.data.items || []).map(item => item.isSelf ? { ...item, name: bot.nickname || item.name, ava_url: bot.ava_url || item.ava_url } : item)
        this.$store.commit("MERGE_CHAT_HISTORY", { chatId, items })
        this._historyTimes.set(chatId, Date.now())
        this.historyNote = response.data.recording_enabled ? "显示最近 50 条已存消息及实时消息；未入库或已清理的内容不包含在内。" : "消息存储当前关闭；仅显示已有记录及本页实时消息。"
      } catch (error) { if (current()) this.historyError = apiErrorDetail(error, "历史读取失败，实时消息不受影响。") }
      finally { if (!this.disposed && request === this.historyRequest) this.historyLoading = false }
    },
    async sendMessage() {
      if (!this.message.trim() || !this.botInfo.self_id) return

      const loading = this.getLoading(".chat-input")

      try {
        const resp = await this.$chatWebSocket.sendMessage(
          this.botInfo,
          this.chatInfo.group_id,
          this.chatInfo.user_id,
          this.message
        ).catch(() => null)
        if (!resp?.suc || resp.warning) return
        this.message = ""
        this.$nextTick(this.scrollToBottom)
      } finally {
        loading.close()
      }
    },

    /**
     * 输入框回车：Enter 发送，Shift+Enter 换行，输入法组字时不处理
     * @param {KeyboardEvent} event 键盘事件
     */
    handleEnter(event) {
      if (event.shiftKey || event.isComposing || event.keyCode === 229) return
      event.preventDefault()
      this.sendMessage()
    },

    scrollToBottom() {
      const chatElement = document.getElementById("chat")
      if (chatElement) {
        chatElement.scrollTop = chatElement.scrollHeight
      }
    },

    startChat(data) {
      this._invalidateHistory(); this.historyError = ""; this.historyNote = ""
      this.chatInfo = data
      const chatId = data.group_id || data.user_id
      this.chatId = chatId
      this.$store.commit("SET_CHAT_ID", chatId)
      this.$store.commit("ADD_CHAT_MSG", { chatId })
      this.isStartChat = true
      this.$nextTick(this.scrollToBottom)
      this.loadHistory()
    },

    async clearMessage() {
      const chatId = this.chatId
      const result = await this.$confirmAction({
        title: "清空本地消息",
        message: `只清空当前页面缓存的消息，不会删除服务器上的聊天记录。确认清空？`,
        cancelButtonText: "我再想想",
        confirmButtonText: "清空内容",
      })
      if (result && !this.disposed && chatId === this.chatId) {
        this._invalidateHistory()
        this._historyTimes.set(chatId, Date.now())
        this.$store.commit("CLEAR_CHAT", this.chatId)
        this.$message.success("本地消息已清空")
      }
    },
  },
}
</script>

<style scoped>
.history-note { margin: 0 0 12px; font-size: 12px; line-height: 1.6; color: var(--text-color-secondary); overflow-wrap: anywhere; }
.chat-history-actions { display: flex; flex-wrap: wrap; justify-content: flex-end; gap: 6px; }.chat-history-actions .el-button { margin-left: 0; }.history-error { color: var(--danger-color, #c45656); font-size: 13px; overflow-wrap: anywhere; }
.chat-window {
  display: flex;
  flex-direction: column;
  height: 100%;
  min-height: 0;
}

.chat-empty {
  flex: 1;
}

.chat-header {
  display: flex;
  flex-shrink: 0;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  padding: 12px 16px;
  border-bottom: 1px solid var(--border-color);
}

.chat-title {
  display: flex;
  align-items: center;
  gap: 10px;
  min-width: 0;
}

.chat-title > div {
  min-width: 0;
}

.chat-title h2 {
  margin: 0;
  overflow: hidden;
  color: var(--text-color);
  font-size: 15px;
  font-weight: 600;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.chat-title p {
  margin: 2px 0 0;
  color: var(--text-color-secondary);
  font-size: 12px;
}

.chat-body {
  flex: 1;
  min-height: 0;
  padding: 16px;
  overflow-y: auto;
  background: var(--bg-color);
}

.chat-placeholder {
  margin: 40px 0;
  color: var(--text-color-secondary);
  font-size: 13px;
  text-align: center;
}

.message-row {
  display: flex;
  gap: 10px;
  margin-bottom: 16px;
}

.message-row:last-child {
  margin-bottom: 0;
}

.message-row.is-self {
  flex-direction: row-reverse;
}

.avatar {
  flex-shrink: 0;
}

.message-wrapper {
  display: flex;
  flex-direction: column;
  align-items: flex-start;
  min-width: 0;
  max-width: 72%;
}

.message-row.is-self .message-wrapper {
  align-items: flex-end;
}

.message-sender {
  margin: 0 0 4px;
  color: var(--text-color-secondary);
  font-size: 12px;
}

.message-item {
  display: flex;
  flex-direction: column;
  align-items: inherit;
  max-width: 100%;
  margin-bottom: 8px;
}

.message-item:last-child {
  margin-bottom: 0;
}

.message-bubble {
  max-width: 100%;
  padding: 8px 12px;
  border: 1px solid var(--border-color);
  border-radius: 4px 12px 12px 12px;
  color: var(--text-color);
  background: var(--bg-color-secondary);
  font-size: 14px;
  line-height: 1.6;
  overflow-wrap: anywhere;
}

.message-row.is-self .message-bubble {
  border-color: var(--primary-color);
  border-radius: 12px 4px 12px 12px;
  color: #ffffff;
  background: var(--primary-color);
}

.message-text {
  white-space: pre-wrap;
}

.message-image {
  display: block;
  max-width: min(280px, 100%);
  max-height: 280px;
  border-radius: 6px;
}

.message-time {
  margin-top: 4px;
  color: var(--text-color-secondary);
  font-size: 11px;
}

.chat-input {
  flex-shrink: 0;
  padding: 12px 16px;
  border-top: 1px solid var(--border-color);
}

.chat-input-actions {
  display: flex;
  justify-content: flex-end;
  margin-top: 10px;
}

@media (max-width: 768px) {
  .chat-header {
    padding: 10px 12px;
  }

  .chat-body {
    padding: 12px;
  }

  .chat-input {
    padding: 10px 12px;
  }

  .chat-input-actions {
    margin-top: 8px;
  }

  .message-wrapper {
    max-width: 80%;
  }
}
</style>
