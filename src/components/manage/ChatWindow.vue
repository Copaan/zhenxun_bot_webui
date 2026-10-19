<template>
  <div class="chat-window">
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
        <el-button size="mini" icon="el-icon-delete" @click="clearMessage">清空本地消息</el-button>
      </header>

      <div id="chat" class="chat-body">
        <p v-if="!msgList.length" class="chat-placeholder">暂无消息。打开本页后收到的消息和在此发送的消息会显示在这里，不含历史记录</p>
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
              <span class="message-time">{{ msg.time }}</span>
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

export default {
  name: "ChatWindow",
  data() {
    return {
      emptyChatUrl,
      message: "",
      isStartChat: false,
      chatInfo: {},
      chatId: "default",
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
    this.botInfo = this.$store.state.botInfo || {}
  },
  mounted() {
    if (this.botInfo.self_id) this.$store.dispatch("initChatSocket")
  },
  methods: {
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
      this.chatInfo = data
      const chatId = data.group_id || data.user_id
      this.chatId = chatId
      this.$store.commit("SET_CHAT_ID", chatId)
      this.$store.commit("ADD_CHAT_MSG", { chatId })
      this.isStartChat = true
      this.$nextTick(this.scrollToBottom)
    },

    async clearMessage() {
      const result = await this.$confirmAction({
        title: "清空本地消息",
        message: `只清空当前页面缓存的消息，不会删除服务器上的聊天记录。确认清空？`,
        cancelButtonText: "我再想想",
        confirmButtonText: "清空内容",
      })
      if (result) {
        this.$store.commit("CLEAR_CHAT", this.chatId)
        this.$message.success("本地消息已清空")
      }
    },
  },
}
</script>

<style scoped>
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
