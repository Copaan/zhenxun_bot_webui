<template>
  <div
    class="zx-page friend-manager-container w-full flex flex-col"
    :class="`mobile-view-${mobileView}`"
  >
    <header class="zx-page-header">
      <div>
        <h1>好友与群组</h1>
        <p>查看好友与群组信息，处理加好友与入群请求，或直接以机器人身份发送消息。</p>
      </div>
      <div class="zx-page-actions">
        <el-badge :value="requestCount" :hidden="requestCount <= 0">
          <el-button size="small" icon="el-icon-message" @click="openRequest">请求管理</el-button>
        </el-badge>
      </div>
    </header>

    <!-- 主内容区 -->
    <div class="workspace flex-1 flex flex-col md:flex-row gap-3 min-h-0">
      <!-- 左侧好友列表 -->
      <div class="workspace-panel data-list-container w-full md:w-1/4 lg:w-1/5 flex-shrink-0">
        <DataList @getDetail="getDetail" class="h-full" ref="dataList" />
      </div>

      <!-- 中间聊天窗口 -->
      <div class="workspace-panel chat-container flex-1 min-w-0">
        <div class="mobile-bar">
          <el-button type="text" icon="el-icon-arrow-left" @click="showMobileView('list')">返回列表</el-button>
          <el-button size="mini" icon="el-icon-info" @click="showMobileView('detail')">详情</el-button>
        </div>
        <ChatWindow ref="chatWindow" class="panel-body" />
      </div>

      <!-- 右侧详情信息 -->
      <div class="workspace-panel detail-container w-full md:w-1/3 lg:w-1/4 flex-shrink-0">
        <div class="mobile-bar">
          <el-button type="text" icon="el-icon-arrow-left" @click="showMobileView('chat')">返回聊天</el-button>
          <span class="mobile-bar-title">详细信息</span>
        </div>
        <DetailInfo ref="detailInfo" @startChat="startChat" class="panel-body" />
      </div>
    </div>

    <RequestDialog
      v-if="requestDialogVisible"
      @close="closeRequest"
      class="z-50"
    />
  </div>
</template>

<script>
import ChatWindow from "@/components/manage/ChatWindow.vue"
import DataList from "@/components/manage/DataList.vue"
import DetailInfo from "@/components/manage/DetailInfo.vue"
import RequestDialog from "@/components/manage/RequestDialog.vue"

export default {
  name: "FriendGroupMana",
  components: {
    DataList,
    ChatWindow,
    DetailInfo,
    RequestDialog,
  },
  data() {
    return {
      requestDialogVisible: false,
      mobileView: "list",
      requestCount: 0,
    }
  },
  mounted() {
    if (this.$store.state.botInfo?.self_id) this.getRequestCount()
  },
  methods: {
    getRequestCount() {
      this.getRequest(`${this.$root.prefix}/manage/get_request_count`).then(
        (resp) => {
          if (resp.suc) {
            if (resp.warning) {
              this.$message.warning(resp.warning)
            } else {
              this.requestCount = resp.data.friend_count + resp.data.group_count
            }
          } else {
            this.$message.error(resp.info)
          }
        }
      )
    },
    openRequest() {
      this.requestDialogVisible = true
    },
    closeRequest() {
      this.requestDialogVisible = false
      this.$refs.dataList.refresh()
      this.getRequestCount()
    },
    startChat(data) {
      this.$refs.chatWindow.startChat(data)
    },
    getDetail(type, id) {
      if (type == "private") {
        this.$refs.detailInfo.getFriend(id)
      } else {
        this.$refs.detailInfo.getGroup(id)
      }
      this.showMobileView("chat")
    },
    /**
     * 切换移动端显示的面板，切换后刷新目标面板的滚动位置与图表尺寸
     * @param {"list" | "chat" | "detail"} view 目标面板
     */
    showMobileView(view) {
      this.mobileView = view
      this.$nextTick(() => {
        if (view == "chat") this.$refs.chatWindow.scrollToBottom()
        if (view == "detail") this.$refs.detailInfo.resizeChart()
      })
    },
  },
}
</script>

<style scoped>
.friend-manager-container {
  position: relative;
  height: 100%;
  overflow: hidden;
}

.workspace-panel {
  display: flex;
  flex-direction: column;
  overflow: hidden;
  border: 1px solid var(--border-color);
  border-radius: 8px;
  background: var(--bg-color-secondary);
}

.panel-body {
  flex: 1;
  min-height: 0;
}

.mobile-bar {
  display: none;
}

@media (max-width: 768px) {
  .workspace-panel {
    display: none;
    flex: 1;
    min-height: 0;
  }

  .mobile-view-list .data-list-container,
  .mobile-view-chat .chat-container,
  .mobile-view-detail .detail-container {
    display: flex;
  }

  .mobile-view-chat .zx-page-header,
  .mobile-view-detail .zx-page-header {
    display: none;
  }

  .mobile-bar {
    display: flex;
    flex-shrink: 0;
    align-items: center;
    justify-content: space-between;
    gap: 8px;
    padding: 4px 12px;
    border-bottom: 1px solid var(--border-color);
  }

  .mobile-bar-title {
    color: var(--text-color);
    font-size: 15px;
    font-weight: 600;
  }
}
</style>
