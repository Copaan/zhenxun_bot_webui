<template>
  <el-dialog
    class="moe-dialog"
    :visible="true"
    @close="close"
    custom-class="moe-dialog-container"
  >
    <div class="moe-container">
      <!-- 顶部标题区 -->
      <div class="header-box">
        <h3 class="title">
          <span class="icon">🌸</span>
          好友与群组请求
          <span class="icon">🌸</span>
        </h3>
        <div class="header-buttons">
          <cute-button
            :loading="pendingAction === 'clear:FRIEND'"
            :disabled="Boolean(pendingAction)"
            @click="clearRequest('FRIEND')"
            size="sm"
            icon="clear3"
            type="danger"
            iconColor="var(--button-icon-color-primary)"
          >
            清空好友
          </cute-button>
          <cute-button
            :loading="pendingAction === 'clear:GROUP'"
            :disabled="Boolean(pendingAction)"
            @click="clearRequest('GROUP')"
            size="sm"
            icon="clear3"
            type="danger"
            iconColor="var(--button-icon-color-primary)"
          >
            清空群组
          </cute-button>
        </div>
      </div>

      <!-- 主体内容 (标签页形式) -->
      <div class="tab-container">
        <div class="tabs">
          <button
            @click="activeTab = 'friend'"
            :class="{ active: activeTab === 'friend' }"
          >
            <i class="icon-heart"></i> 好友请求
            <span class="badge">{{ dataObj.friend.length }}</span>
          </button>
          <button
            @click="activeTab = 'group'"
            :class="{ active: activeTab === 'group' }"
          >
            <i class="icon-group"></i> 群组请求
            <span class="badge">{{ dataObj.group.length }}</span>
          </button>
        </div>

        <!-- 好友请求列表 -->
        <div v-show="activeTab === 'friend'" class="request-list friend-list">
          <div v-if="!dataObj.friend.length" class="empty-state">
            <p>暂时没有好友请求哦 (≧▽≦)</p>
          </div>

          <div
            v-for="(data, index) in dataObj.friend"
            :key="data.flag"
            class="request-card"
            :style="{ 'animation-delay': `${index * 0.05}s` }"
          >
            <div class="user-info">
              <div class="avatar-wrapper">
                <el-avatar :src="data.ava_url" class="moe-avatar"></el-avatar>
                <div class="online-dot" v-if="data.isOnline"></div>
              </div>
              <div class="user-details">
                <p class="username">{{ data.remark || data.nickname }}</p>
                <p class="userid">ID: {{ data.id }}</p>
                <p class="message" v-if="data.message">
                  留言: {{ data.message }}
                </p>
              </div>
            </div>
            <div class="action-buttons">
              <cute-button
                :loading="pendingAction === actionKey('approve', data)"
                :disabled="Boolean(pendingAction)"
                @click="handleApprove(data)"
                type="success"
                icon="confirm"
                size="sm"
                iconColor="var(--button-icon-color-primary)"
              >
                同意
              </cute-button>
              <cute-button
                :loading="pendingAction === actionKey('refuse', data)"
                :disabled="Boolean(pendingAction)"
                @click="handleRefuse(data)"
                type="danger"
                icon="false"
                size="sm"
                iconColor="var(--button-icon-color-primary)"
              >
                拒绝
              </cute-button>
              <cute-button
                :loading="pendingAction === actionKey('ignore', data)"
                :disabled="Boolean(pendingAction)"
                @click="handleIgnore(data)"
                type="normal"
                icon="ignore"
                size="sm"
                iconColor="var(--button-icon-color-default)"
              >
                忽略
              </cute-button>
            </div>
          </div>
        </div>

        <!-- 群组请求列表 -->
        <div v-show="activeTab === 'group'" class="request-list group-list">
          <div v-if="!dataObj.group.length" class="empty-state">
            <p>暂时没有群组请求呢 (◕‿◕✿)</p>
          </div>

          <div
            v-for="(data, index) in dataObj.group"
            :key="data.flag"
            class="request-card"
            :style="{ 'animation-delay': `${index * 0.05}s` }"
          >
            <div class="user-info">
              <div class="avatar-wrapper">
                <el-avatar :src="data.ava_url" class="moe-avatar"></el-avatar>
                <div class="member-count">
                  <i class="icon-user"></i> {{ data.memberCount }}
                </div>
              </div>
              <div class="user-details">
                <p class="username">{{ data.groupName }}</p>
                <p class="userid">群ID: {{ data.id }}</p>
                <p class="inviter" v-if="data.inviter">
                  邀请人: {{ data.inviter }}
                </p>
              </div>
            </div>
            <div class="action-buttons">
              <cute-button
                :loading="pendingAction === actionKey('approve', data)"
                :disabled="Boolean(pendingAction)"
                @click="handleApprove(data)"
                type="success"
                icon="confirm"
                size="sm"
                iconColor="var(--button-icon-color-primary)"
              >
                同意
              </cute-button>
              <cute-button
                :loading="pendingAction === actionKey('refuse', data)"
                :disabled="Boolean(pendingAction)"
                @click="handleRefuse(data)"
                type="danger"
                icon="false"
                size="sm"
                iconColor="var(--button-icon-color-primary)"
              >
                拒绝
              </cute-button>
              <cute-button
                :loading="pendingAction === actionKey('ignore', data)"
                :disabled="Boolean(pendingAction)"
                @click="handleIgnore(data)"
                type="normal"
                icon="ignore"
                size="sm"
                iconColor="var(--button-icon-color-default)"
              >
                忽略
              </cute-button>
            </div>
          </div>
        </div>
      </div>

      <!-- 底部装饰 -->
      <div class="footer-decoration">
        <div class="paw left-paw"></div>
        <div class="paw right-paw"></div>
      </div>
    </div>
  </el-dialog>
</template>

<script>
import CuteButton from "../ui/CuteButton.vue"

export default {
  components: { CuteButton },
  data() {
    return {
      activeTab: "friend",
      sizeMana: {
        avatarSize: 50,
      },
      dataObj: {
        friend: [],
        group: [],
      },
      loading: { clearFriend: false, clearGroup: false },
      pendingAction: "",
      fetching: false,
      destroyed: false,
    }
  },
  mounted() {
    this.fetchRequests()
    window.addEventListener("resize", this.handleResize)
    this.initFontSize()
  },
  methods: {
    initFontSize() {
      const isMobile = window.innerWidth < 768
      this.sizeMana = {
        titleText: isMobile ? 16 : 18,
        nameText: isMobile ? 18 : 20,
        tipText: isMobile ? 12 : 14,
        imageSize: isMobile ? 36 : 40,
      }
    },

    actionKey(action, data) {
      return `${action}:${data.flag}`
    },
    async fetchRequests() {
      if (this.fetching) return
      this.fetching = true
      const loading = this.getLoading(".el-dialog")
      try {
        const resp = await this.getRequest(`${this.$root.prefix}/manage/get_request_list`)
          if (resp.suc) {
            if (resp.warning) {
              this.$message.warning(resp.warning)
            } else {
              this.$message.success(resp.info)
              this.dataObj = resp.data
            }
          } else {
            this.$message.error(resp.info)
          }
      } catch (error) {
        this.$message.error(error.response?.data?.detail || error.message || "请求列表加载失败")
      } finally {
        this.fetching = false
        loading.close()
      }
    },

    async clearRequest(request_type) {
      if (this.pendingAction) return
      this.pendingAction = `confirm-clear:${request_type}`
      const result = await this.$cuteConfirm({
        title: "清空确认",
        message: `确定要清空当前全部请求吗?`,
        cancelButtonText: "我再想想",
        confirmButtonText: "全部清空",
      })
      if (result) {
        this.pendingAction = `clear:${request_type}`
        const loading = this.getLoading(".el-dialog")
        try {
          const resp = await this.postRequest(`${this.$root.prefix}/manage/clear_request`, { request_type })
            if (resp.suc) {
              if (resp.warning) {
                this.$message.warning(resp.warning)
              } else {
                this.$message.success(resp.info)
              }
            } else {
              this.$message.error(resp.info)
            }
        } catch (error) {
          this.$message.error(error.response?.data?.detail || error.message || "清空请求失败")
        } finally {
          loading.close()
          this.pendingAction = ""
          if (!this.destroyed) await this.fetchRequests()
        }
      } else {
        this.pendingAction = ""
        console.log("取消清空")
      }
    },
    async handleRequestAction(action, data, endpoint, payload) {
      if (this.pendingAction) return
      this.pendingAction = this.actionKey(action, data)
      const loading = this.getLoading(".el-dialog")
      try {
        const resp = await this.postRequest(`${this.$root.prefix}/manage/${endpoint}`, payload)
        if (resp.suc) {
          if (resp.warning) {
            this.$message.warning(resp.warning)
          } else {
            this.$message.success(resp.info)
          }
        } else {
          this.$message.error(resp.info)
        }
      } catch (error) {
        this.$message.error(error.response?.data?.detail || error.message || "请求处理失败")
      } finally {
        loading.close()
        this.pendingAction = ""
        if (!this.destroyed) await this.fetchRequests()
      }
    },
    handleApprove(data) {
      return this.handleRequestAction("approve", data, "approve_request", { bot_id: data.bot_id, id: data.oid })
    },
    handleRefuse(data) {
      return this.handleRequestAction("refuse", data, "refuse_request", { bot_id: data.bot_id, id: data.oid })
    },
    handleIgnore(data) {
      return this.handleRequestAction("ignore", data, "delete_request", { id: data.oid })
    },

    close() {
      this.$emit("close")
    },
  },

  beforeDestroy() {
    this.destroyed = true
    window.removeEventListener("resize", this.handleResize)
  },
}
</script>

<style>
/* 保留必要的动画定义 */
@keyframes fadeInUp {
  from {
    opacity: 0;
    transform: translateY(10px);
  }
  to {
    opacity: 1;
    transform: translateY(0);
  }
}

@keyframes float {
  0%,
  100% {
    transform: translateY(0);
  }
  50% {
    transform: translateY(-5px);
  }
}
</style>

<style scoped>
/* 对话框基础样式 */
.moe-dialog ::v-deep .el-dialog {
  overflow: visible;
  border-radius: 20px;
  border: 3px solid var(--border-color);
  background-color: var(--bg-color);
  box-shadow: 0 10px 30px var(--echarts-shadow);
}

.moe-dialog ::v-deep .el-dialog__header {
  display: none;
}

.moe-dialog ::v-deep .el-dialog__body {
  padding: 0;
  position: relative;
  background: var(--bg-color);
  border-radius: 20px;
}

.moe-container {
  padding: 24px;
  position: relative;
  border-radius: 20px;
}

/* 头部样式 */
.header-box {
  text-align: center;
  margin-bottom: 20px;
  position: relative;
}

.header-box .title {
  color: var(--primary-color);
  font-weight: bold;
  margin-bottom: 16px;
  font-size: 20px;
  text-shadow: 1px 1px 2px rgba(var(--primary-color), 0.2);
}

.header-box .title .icon {
  display: inline-block;
  margin: 0 8px;
  animation: float 2s ease-in-out infinite;
}

.header-buttons {
  display: flex;
  justify-content: center;
  gap: 8px;
  margin-top: 12px;
}

/* 标签页样式 */
.tab-container .tabs {
  display: flex;
  border-bottom: 2px solid var(--border-color-light);
  margin-bottom: 16px;
}

.tab-container .tabs button {
  flex: 1;
  padding: 12px 0;
  background: transparent;
  border: none;
  position: relative;
  color: var(--text-color-secondary);
  font-weight: bold;
  font-size: 14px;
  cursor: pointer;
  transition: all 0.3s;
}

.tab-container .tabs button i {
  margin-right: 4px;
}

.tab-container .tabs button .badge {
  background-color: var(--primary-color);
  color: var(--el-color-white);
  border-radius: 999px;
  padding: 2px 8px;
  font-size: 12px;
  margin-left: 4px;
}

.tab-container .tabs button.active {
  color: var(--primary-color);
}

.tab-container .tabs button.active::after {
  content: "";
  position: absolute;
  bottom: 0;
  left: 0;
  width: 100%;
  height: 3px;
  background: linear-gradient(
    to right,
    var(--primary-color),
    var(--el-color-primary-light-8)
  );
  border-radius: 3px 3px 0 0;
}

/* 请求列表样式 */
.request-list {
  max-height: 50vh;
  overflow-y: auto;
  padding-right: 4px;
  min-height: 300px;
}

.request-list::-webkit-scrollbar {
  width: 6px;
}

.request-list::-webkit-scrollbar-track {
  background-color: var(--el-fill-color-light);
  border-radius: 3px;
}

.request-list::-webkit-scrollbar-thumb {
  background-color: var(--scrollbar-thumb-color);
  border-radius: 3px;
}

.empty-state {
  text-align: center;
  padding: 32px 0;
  color: var(--text-color-secondary);
}

.empty-state p {
  margin-top: 12px;
  font-size: 14px;
}

/* 请求卡片样式 */
.request-card {
  background-color: var(--bg-color-secondary);
  border-radius: 12px;
  padding: 16px;
  margin-bottom: 12px;
  box-shadow: var(--el-box-shadow-light);
  border: 1px solid var(--border-color);
  opacity: 0;
  animation: fadeInUp 0.5s forwards;
  transition: all 0.3s;
}

.request-card:hover {
  transform: translateY(-3px);
  box-shadow: 0 5px 15px var(--echarts-shadow);
}

/* 用户信息样式 */
.user-info {
  display: flex;
  align-items: center;
  margin-bottom: 12px;
}

.avatar-wrapper {
  position: relative;
  margin-right: 16px;
}

.moe-avatar {
  width: 50px;
  height: 50px;
  border: 2px solid var(--border-color);
  box-shadow: 0 3px 5px rgba(0, 0, 0, 0.05);
}

.online-dot {
  position: absolute;
  bottom: 0;
  right: 0;
  width: 12px;
  height: 12px;
  background-color: var(--success-color);
  border: 2px solid var(--el-color-white);
  border-radius: 50%;
}

.member-count {
  position: absolute;
  bottom: -8px;
  right: -8px;
  background-color: var(--el-color-primary-light-5);
  color: var(--el-color-white);
  border-radius: 999px;
  padding: 2px 4px;
  font-size: 10px;
  border: 2px solid var(--el-color-white);
}

.user-details {
  flex: 1;
}

.user-details .username {
  color: var(--primary-color);
  font-weight: bold;
  margin-bottom: 4px;
  font-size: 16px;
}

.user-details .userid,
.user-details .message,
.user-details .inviter {
  color: var(--text-color-secondary);
  font-size: 12px;
  margin-bottom: 2px;
}

.action-buttons {
  display: flex;
  justify-content: flex-end;
  gap: 8px;
}

/* 底部装饰样式 */
.footer-decoration {
  position: absolute;
  bottom: -16px;
  left: 0;
  width: 100%;
  display: flex;
  justify-content: space-between;
  padding: 0 20px;
}

.paw {
  width: 28px;
  height: 24px;
  background-color: var(--primary-color);
  border-radius: 999px;
  position: relative;
}

.paw::before {
  content: "";
  position: absolute;
  width: 8px;
  height: 8px;
  background-color: var(--el-color-white);
  border-radius: 50%;
}

.left-paw {
  transform: rotate(30deg);
}

.left-paw::before {
  top: 4px;
  right: 4px;
}

.left-paw::after {
  content: "";
  position: absolute;
  width: 8px;
  height: 8px;
  background-color: var(--el-color-white);
  border-radius: 50%;
  top: 12px;
  right: 8px;
}

.right-paw {
  transform: rotate(-30deg);
}

.right-paw::before {
  top: 4px;
  left: 4px;
}

.right-paw::after {
  content: "";
  position: absolute;
  width: 8px;
  height: 8px;
  background-color: var(--el-color-white);
  border-radius: 50%;
  top: 12px;
  left: 8px;
}

/* 移动端适配 */
@media (max-width: 768px) {
  .moe-dialog ::v-deep .el-dialog {
    width: 90%;
    max-width: none;
  }

  .header-box .title {
    font-size: 18px;
  }

  .request-card {
    padding: 12px;
  }

  .user-info {
    flex-direction: column;
    align-items: flex-start;
  }

  .avatar-wrapper {
    margin-right: 0;
    margin-bottom: 8px;
  }

  .action-buttons {
    justify-content: center;
    margin-top: 8px;
  }

  .footer-decoration {
    display: none;
  }
}
</style>
