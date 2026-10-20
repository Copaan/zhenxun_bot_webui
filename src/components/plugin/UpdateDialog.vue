<template>
  <el-dialog
    :visible.sync="visible"
    :before-close="confirmClose"
    @closed="handleClosed"
    :class="{
      'neko-dialog': true,
      'limit-width': !configGroups.length,
    }"
    width="80%"
    top="5vh"
  >
    <!-- 对话框背景装饰 -->
    <div class="dialog-background">
      <div class="bg-pattern pattern-1"></div>
      <div class="bg-pattern pattern-2"></div>
      <div class="bg-blob blob-1"></div>
      <div class="bg-blob blob-2"></div>
    </div>

    <!-- 头部区域 -->
    <div class="plugin-header">
      <div class="plugin-icon">
        <i class="el-icon-magic-stick"></i>
      </div>
      <div class="plugin-info">
        <h2 class="plugin-title">
          {{ updateData.plugin_name }}
          <span class="plugin-version">v{{ updateData.version }}</span>
        </h2>
        <div class="plugin-meta">
          <span class="plugin-module">{{ updateData.module }}</span>
          <span class="plugin-author" v-if="updateData.author">
            <i class="el-icon-user"></i> {{ updateData.author }}
          </span>
        </div>
      </div>
    </div>

    <!-- 内容区域 -->
    <div class="plugin-content">
      <el-tabs v-if="configGroups.length" v-model="activeTab" class="plugin-tabs">
        <el-tab-pane label="基础设置" name="basic" />
        <el-tab-pane :label="`插件配置 · ${configFieldCount} 项`" name="config" />
      </el-tabs>
      <!-- 基础配置区域 -->
      <div v-show="activeTab === 'basic'" class="settings-container">
        <div class="settings-section">
          <div class="section-header">
            <i class="el-icon-setting"></i>
            <h3>基础配置</h3>
          </div>

          <el-form
            :model="updateData"
            :rules="rules"
            ref="form"
            class="settings-form"
          >
            <!-- 第一行设置 -->
            <div class="settings-row">
              <div class="setting-card">
                <div class="setting-icon">
                  <i class="el-icon-switch-button"></i>
                </div>
                <div class="setting-content">
                  <div class="setting-label" title="仅决定加入新群时的初始状态，不改变现有群或私聊的启用状态">新群默认启用</div>
                  <div class="setting-control">
                    <el-switch v-model="updateData.default_status" />
                  </div>
                </div>
              </div>

              <div class="setting-card">
                <div class="setting-icon">
                  <i class="el-icon-user"></i>
                </div>
                <div class="setting-content">
                  <div class="setting-label" title="开启后超级用户同样受全局、群聊和私聊开关限制；关闭时只受账号禁用限制">限制超级用户</div>
                  <div class="setting-control">
                    <el-switch v-model="updateData.limit_superuser" />
                  </div>
                </div>
              </div>
            </div>

            <!-- 真寻特有设置 -->
            <template v-if="this.$store.state.botType == 'zhenxun'">
              <div class="settings-row">
                <div class="setting-card">
                  <div class="setting-icon">
                    <i class="el-icon-coin"></i>
                  </div>
                  <div class="setting-content">
                    <div class="setting-label">花费金币</div>
                    <div class="setting-control">
                      <neon-input
                        v-model="updateData.cost_gold"
                        placeholder="0"
                        class="neon-input"
                      />
                    </div>
                  </div>
                </div>

                <div class="setting-card">
                  <div class="setting-icon">
                    <i class="el-icon-menu"></i>
                  </div>
                  <div class="setting-content">
                    <div class="setting-label">菜单类型</div>
                    <div class="setting-control">
                      <el-select
                        v-model="updateData.menu_type"
                        placeholder="选择类型"
                        class="neko-select"
                      >
                        <el-option v-for="item in menuTypeOptions" :key="item.value" :label="item.label" :value="item.value" />
                      </el-select>
                    </div>
                  </div>
                </div>
              </div>
            </template>

            <!-- 最后一行设置 -->
            <div class="settings-row">
              <div
                class="setting-card"
                v-if="this.$store.state.botType == 'zhenxun'"
              >
                <div class="setting-icon">
                  <i class="el-icon-lock"></i>
                </div>
                <div class="setting-content">
                  <div class="setting-label">群权限</div>
                  <div class="setting-control">
                    <el-select
                      v-model="updateData.level"
                      placeholder="选择等级"
                      class="neko-select"
                    >
                      <el-option v-for="item in levelOptions" :key="item.value" :label="item.label" :value="item.value" />
                    </el-select>
                  </div>
                </div>
              </div>

              <div class="setting-card">
                <div class="setting-icon">
                  <i class="el-icon-remove"></i>
                </div>
                <div class="setting-content">
                  <div class="setting-label">禁用类型</div>
                  <div class="setting-control">
                    <el-select
                      v-model="updateData.block_type"
                      placeholder="选择类型"
                      class="neko-select"
                      clearable
                    >
                      <el-option v-for="item in blockTypeOptions" :key="item.value" :label="item.label" :value="item.value" />
                    </el-select>
                  </div>
                </div>
              </div>
            </div>
          </el-form>
        </div>
      </div>

      <!-- 插件配置区域 -->
      <div v-if="configGroups.length" v-show="activeTab === 'config'" class="config-panel">
        <el-input v-if="configFieldCount > 6" v-model="configSearch" clearable prefix-icon="el-icon-search" placeholder="搜索配置项或说明" class="config-search" />
        <ConfigGroupEditor v-for="group in configGroups" v-show="groupMatches(group, configSearch)" :key="group.module" :group="group" :hide-title="configGroups.length === 1 && group.module === updateData.module" :issues="configIssues" :query="fieldQuery(group)" @change="configIssues = []" />
        <div v-if="!configGroups.some(group => groupMatches(group, configSearch))" class="config-empty">没有匹配的配置项</div>
      </div>
    </div>

    <!-- 底部操作区 -->
    <div class="dialog-footer">
      <div class="action-buttons">
        <button
          v-if="canUninstall"
          class="cancel-button uninstall-button"
          @click="requestUninstall"
        >
          <i class="el-icon-delete"></i>
          <span>{{ updateData.management_source === "nonebot_store" ? "前往卸载" : "卸载插件" }}</span>
        </button>
        <span v-else-if="updateData.uninstall_reason">{{ updateData.uninstall_reason }}</span>
        <button class="cancel-button" @click="close">
          <i class="el-icon-close"></i>
          <span>取消</span>
        </button>
        <button class="confirm-button" @click="commit">
          <i class="el-icon-check"></i>
          <span>确定</span>
        </button>
      </div>
    </div>
  </el-dialog>
</template>

<script>
import ConfigGroupEditor from "@/components/config/ConfigGroupEditor.vue"
import { changeIssues, collectChanges, groupMatches, markSaved, normalizeGroups, saveSimpleConfig } from "@/components/config/simple-config"
import { apiErrorDetail, apiErrorIssues } from "@/utils/api-error"
import { handleApplyResult } from "@/utils/apply-result"
import { clearDirtyState, setDirtyState } from "@/utils/dirty-state"
import NeonInput from "@/components/ui/NeonInput.vue"
import { checkConfig } from "@/utils/check"

export default {
  name: "NekoPluginDialog",
  props: {
    module: String,
  },
  components: {
    ConfigGroupEditor,
    "neon-input": NeonInput,
  },
  data() {
    var checkCostGold = (rule, value, callback) => {
      if (!("1" + value)) {
        return callback(new Error("请输入花费金币"))
      }
      if (!checkConfig(value, "int")) {
        return callback(new Error("输入值必须为数字"))
      }
      callback()
    }
    return {
      activeTab: "basic", configSearch: "", configIssues: [], configGroups: [], configRevision: "",
      visible: false,
      menuTypeList: [],
      menuTypeOptions: [],
      levelOptions: Array.from({ length: 10 }, (_, i) => ({
        value: i + 1,
        label: `等级 ${i + 1}`,
      })),
      blockTypeOptions: [
        { value: "ALL", label: "全部" },
        { value: "GROUP", label: "群聊" },
        { value: "PRIVATE", label: "私聊" },
      ],
      updateData: {
        plugin_name: "",
        version: 0,
        module: "",
        author: "",
        default_status: false,
        limit_superuser: false,
        cost_gold: 0,
        cmd: 0,
        menu_type: "normal",
        level: 0,
        block_type: null,
      },
      initialData: "",
      dirtySource: `plugin-config-${this._uid}`,
      rules: {
        cost_gold: [{ validator: checkCostGold, trigger: "blur" }],
      },
    }
  },
  mounted() {
    this.getPluginDetail()
    this.getPluginMenuType()
  },
  beforeDestroy() {
    clearDirtyState(this.dirtySource)
  },
  watch: {
    updateData: { deep: true, handler() { setDirtyState(this.dirtySource, this.isDirty()) } },
    configChanges() { setDirtyState(this.dirtySource, this.isDirty()) },
  },
  computed: {
    canUninstall() {
      return ["zhenxun_store", "nonebot_store"].includes(
        this.updateData.management_source
      ) && this.updateData.uninstall_supported && !this.updateData.is_builtin
    },
    configChanges() { return collectChanges(this.configGroups) },
    configFieldCount() { return this.configGroups.reduce((sum, group) => sum + group.fields.length, 0) },
  },
  methods: {
    groupMatches,
    fieldQuery(group) { return groupMatches({ ...group, fields: [] }, this.configSearch) ? "" : this.configSearch },
    baseChanged() { return Boolean(this.initialData) && JSON.stringify(this.updateData) !== this.initialData },
    isDirty() { return this.baseChanged() || Object.keys(this.configChanges).length > 0 },
    async close() {
      if (!(await this.confirmDiscard())) return
      clearDirtyState(this.dirtySource)
      this.$emit("close")
    },
    async requestUninstall() {
      if (!(await this.confirmDiscard())) return
      clearDirtyState(this.dirtySource)
      this.$emit("uninstall", this.updateData)
      this.$emit("close")
    },
    async confirmDiscard() {
      if (!this.isDirty()) return true
      try {
        await this.$confirm(
          "插件配置尚未保存，确定放弃修改吗？",
          "关闭配置",
          {
            confirmButtonText: "放弃修改",
            cancelButtonText: "继续编辑",
            type: "warning",
            customClass: "configuration-confirm",
          }
        )
        return true
      } catch (error) {
        return false
      }
    },
    async confirmClose(done) {
      if (await this.confirmDiscard()) {
        clearDirtyState(this.dirtySource)
        done()
      }
    },
    handleClosed() {
      clearDirtyState(this.dirtySource)
      this.$emit("close")
    },
    getPluginDetail() {
      const loading = this.getLoading(".el-dialog")
      this.getRequest(`${this.$root.prefix}/plugin/get_plugin`, {
        module: this.module,
      }).then((resp) => {
        if (resp.suc && !resp.warning) {
          const { config_groups: groups, config_revision: revision, ...plugin } = resp.data
          this.updateData = plugin
          this.initialData = JSON.stringify(plugin)
          this.configGroups = normalizeGroups(groups)
          this.configRevision = revision
          clearDirtyState(this.dirtySource)
          this.visible = true
        } else {
          this.$message.warning(resp.warning || resp.info)
          this.$emit("close")
        }
      }).catch(() => {
        this.$emit("close")
      }).finally(() => loading.close())
    },
    getPluginMenuType() {
      this.getRequest(`${this.$root.prefix}/plugin/get_plugin_menu_type`).then(
        (resp) => {
          if (resp.suc) {
            if (resp.warning) {
              this.$message.warning(resp.warning)
            } else {
              this.menuTypeList = resp.data
              this.menuTypeOptions = resp.data.map((item) => ({
                value: item,
                label: item,
                icon: this.getMenuTypeIcon(item),
              }))
            }
          } else {
            this.$message.error(resp.info)
          }
        }
      )
    },
    getMenuTypeIcon(type) {
      const icons = {
        normal: "menu-normal",
        group: "menu-group",
        private: "menu-private",
        admin: "menu-admin",
      }
      return icons[type] || "menu-default"
    },
    validateForm() {
      return new Promise(resolve => this.$refs.form.validate(valid => resolve(valid)))
    },
    focusConfigIssue() {
      this.activeTab = "config"
      this.$nextTick(() => this.$el.querySelector(".field-error")?.scrollIntoView({ block: "center" }))
    },
    async commit() {
      const changes = this.configChanges
      const baseChanged = this.baseChanged()
      if (!baseChanged && !Object.keys(changes).length) {
        clearDirtyState(this.dirtySource)
        this.$emit("close")
        return
      }
      this.configIssues = changeIssues(this.configGroups, changes)
      if (this.configIssues.length) {
        this.focusConfigIssue()
        return this.$message.warning("请修正配置项中的错误")
      }
      if (baseChanged && !(await this.validateForm())) {
        this.activeTab = "basic"
        return
      }
      const loading = this.getLoading(".el-dialog")
      let configResponse = null
      let baseResponse = null
      try {
        if (Object.keys(changes).length) {
          configResponse = await saveSimpleConfig(this, this.configRevision, changes)
          if (configResponse.data?.apply_mode === "failed") {
            await handleApplyResult(this, configResponse)
            return
          }
          this.configRevision = configResponse.data.revision
          markSaved(this.configGroups, changes)
        }
        if (baseChanged) {
          const data = JSON.parse(JSON.stringify(this.updateData))
          data.expected_revision = data.policy_revision
          data.block_type = data.block_type || null
          baseResponse = await this.postRequest(`${this.$root.prefix}/plugin/update_plugin`, data)
          if (!baseResponse.suc || baseResponse.warning) throw new Error(baseResponse.warning || baseResponse.info)
          this.initialData = JSON.stringify(this.updateData)
        }
      } catch (error) {
        this.configIssues = apiErrorIssues(error)
        const prefix = configResponse ? "插件配置已保存，但基础设置保存失败：" : ""
        this.$message.error(prefix + apiErrorDetail(error, "保存失败"))
        if (this.configIssues.length) this.focusConfigIssue()
        return
      } finally {
        loading.close()
      }
      clearDirtyState(this.dirtySource)
      await handleApplyResult(this, configResponse || baseResponse, {
        restartPrompt: "插件配置已保存，需要重启后生效。",
        returnRoute: this.$route.path,
      })
      this.$emit("close", true)
    },
  },
}
</script>

<style lang="scss" scoped>
// 主题颜色变量
$primary: var(--el-color-primary, #409eff);
$primary-light: var(--el-color-primary-light-3, #79bbff);
$primary-lighter: var(--el-color-primary-light-7, #c6e2ff);
$primary-lightest: var(--el-color-primary-light-9, #ecf5ff);
$text-main: var(--el-text-color-primary, #303133);
$text-secondary: var(--el-text-color-secondary, #909399);
$border-color: var(--el-border-color-light, #e4e7ed);
$bg-color: var(--el-bg-color, #ffffff);
$bg-color-overlay: var(--el-bg-color-overlay, #ffffff);

// 动画
@keyframes float {
  0%,
  100% {
    transform: translateY(0);
  }
  50% {
    transform: translateY(-10px);
  }
}

@keyframes pulse {
  0%,
  100% {
    opacity: 0.6;
  }
  50% {
    opacity: 0.9;
  }
}

@keyframes rotate {
  from {
    transform: rotate(0deg);
  }
  to {
    transform: rotate(360deg);
  }
}

@keyframes gradientMove {
  0% {
    background-position: 0% 50%;
  }
  50% {
    background-position: 100% 50%;
  }
  100% {
    background-position: 0% 50%;
  }
}

// 对话框样式
.neko-dialog {
  ::v-deep .el-dialog {
    border-radius: 16px;
    overflow: hidden;
    box-shadow: 0 10px 30px rgba(0, 0, 0, 0.1);
    border: none;
    background: $bg-color-overlay;
    backdrop-filter: blur(10px);
    position: relative;
  }

  ::v-deep .el-dialog__header {
    display: none; // 隐藏默认头部
  }

  ::v-deep .el-dialog__body {
    padding: 0;
    position: relative;
    z-index: 1;
  }

  // 背景装饰
  .dialog-background {
    position: absolute;
    top: 0;
    left: 0;
    width: 100%;
    height: 100%;
    z-index: 0;
    overflow: hidden;
    opacity: 0.5;
    pointer-events: none;

    .bg-pattern {
      position: absolute;
      opacity: 0.05;

      &.pattern-1 {
        top: 0;
        right: 0;
        width: 300px;
        height: 300px;
        background-image: radial-gradient(
          circle,
          $primary 1px,
          transparent 1px
        );
        background-size: 20px 20px;
      }

      &.pattern-2 {
        bottom: 0;
        left: 0;
        width: 200px;
        height: 200px;
        background-image: linear-gradient(45deg, $primary 25%, transparent 25%),
          linear-gradient(-45deg, $primary 25%, transparent 25%),
          linear-gradient(45deg, transparent 75%, $primary 75%),
          linear-gradient(-45deg, transparent 75%, $primary 75%);
        background-size: 20px 20px;
        background-position: 0 0, 0 10px, 10px -10px, -10px 0px;
      }
    }

    .bg-blob {
      position: absolute;
      border-radius: 50%;
      filter: blur(50px);
      opacity: 0.1;

      &.blob-1 {
        top: -100px;
        right: -50px;
        width: 300px;
        height: 300px;
        background: linear-gradient(135deg, $primary, #8a2be2);
        animation: pulse 10s infinite ease-in-out;
      }

      &.blob-2 {
        bottom: -80px;
        left: -50px;
        width: 250px;
        height: 250px;
        background: linear-gradient(135deg, #00bfff, $primary);
        animation: pulse 8s infinite ease-in-out reverse;
      }
    }
  }

  // 插件头部
  .plugin-header {
    display: flex;
    align-items: center;
    padding: 24px 30px;
    background: linear-gradient(135deg, $primary-lightest, $bg-color);
    border-bottom: 1px solid $border-color;
    position: relative;
    overflow: hidden;

    &::after {
      content: "";
      position: absolute;
      bottom: 0;
      left: 0;
      width: 100%;
      height: 4px;
      background: linear-gradient(
        90deg,
        $primary,
        $primary-light,
        $primary,
        $primary-light
      );
      background-size: 200% 100%;
      animation: gradientMove 3s linear infinite;
    }

    .plugin-icon {
      width: 60px;
      height: 60px;
      border-radius: 16px;
      background: linear-gradient(135deg, $primary, $primary-light);
      display: flex;
      align-items: center;
      justify-content: center;
      margin-right: 20px;
      box-shadow: 0 5px 15px rgba(0, 0, 0, 0.1);

      i {
        font-size: 30px;
        color: white;
      }
    }

    .plugin-info {
      flex: 1;

      .plugin-title {
        margin: 0 0 8px;
        font-size: 24px;
        font-weight: 700;
        color: $text-main;
        display: flex;
        align-items: center;

        .plugin-version {
          font-size: 14px;
          font-weight: normal;
          color: $text-secondary;
          margin-left: 10px;
          padding: 2px 8px;
          background: $primary-lightest;
          border-radius: 12px;
        }
      }

      .plugin-meta {
        display: flex;
        align-items: center;
        color: $text-secondary;
        font-size: 14px;

        .plugin-module {
          padding-right: 12px;
          margin-right: 12px;
          border-right: 1px solid $border-color;
        }

        .plugin-author {
          display: flex;
          align-items: center;

          i {
            margin-right: 4px;
            font-size: 14px;
          }
        }
      }
    }
  }

  // 内容区域
  .plugin-content {
    padding: 20px 30px;
    max-height: 60vh;
    overflow-y: auto;

    &::-webkit-scrollbar {
      width: 6px;
    }

    &::-webkit-scrollbar-track {
      background: $bg-color;
    }

    &::-webkit-scrollbar-thumb {
      background: $primary-lighter;
      border-radius: 3px;

      &:hover {
        background: $primary-light;
      }
    }
  }

  // 设置容器
  .settings-container {
    display: flex;
    flex-direction: column;
    gap: 30px;
  }

  // 设置区域
  .settings-section {
    background: $bg-color;
    border-radius: 16px;
    box-shadow: 0 4px 12px rgba(0, 0, 0, 0.05);
    overflow: hidden;
    transition: all 0.3s ease;

    &:hover {
      box-shadow: 0 6px 16px rgba(0, 0, 0, 0.1);
    }

    .section-header {
      display: flex;
      align-items: center;
      padding: 16px 20px;
      background: $primary-lightest;
      border-bottom: 1px solid $border-color;

      i {
        font-size: 20px;
        color: $primary;
        margin-right: 10px;
      }

      h3 {
        margin: 0;
        font-size: 18px;
        font-weight: 600;
        color: $primary;
      }
    }

    .settings-form {
      padding: 20px;
    }

    .settings-row {
      display: grid;
      grid-template-columns: repeat(auto-fit, minmax(300px, 1fr));
      gap: 20px;
      margin-bottom: 20px;

      &:last-child {
        margin-bottom: 0;
      }
    }

    // 设置卡片
    .setting-card {
      display: flex;
      align-items: center;
      padding: 16px;
      background: $bg-color-overlay;
      border-radius: 12px;
      border: 1px solid $border-color;
      transition: all 0.3s ease;

      &:hover {
        border-color: $primary-light;
        transform: translateY(-2px);
        box-shadow: 0 5px 15px rgba(0, 0, 0, 0.05);
      }

      .setting-icon {
        width: 40px;
        height: 40px;
        border-radius: 10px;
        background: $primary-lightest;
        display: flex;
        align-items: center;
        justify-content: center;
        margin-right: 16px;

        i {
          font-size: 20px;
          color: $primary;
        }
      }

      .setting-content {
        flex: 1;

        .setting-label {
          font-size: 15px;
          font-weight: 500;
          color: $text-main;
          margin-bottom: 8px;
        }

        .setting-control {
          display: flex;
          align-items: center;

          .neon-input,
          .neko-select {
            width: 100%;
          }
        }
      }
    }
  }

  // 底部操作区
  .dialog-footer {
    padding: 20px 30px;
    border-top: 1px solid $border-color;
    background: $bg-color;
    display: flex;
    justify-content: flex-end;

    .action-buttons {
      display: flex;
      gap: 15px;

      button {
        display: flex;
        align-items: center;
        justify-content: center;
        padding: 10px 24px;
        border-radius: 10px;
        font-size: 16px;
        font-weight: 500;
        cursor: pointer;
        transition: all 0.3s ease;
        border: none;

        i {
          margin-right: 6px;
          font-size: 16px;
        }

        &.cancel-button {
          background: $bg-color;
          color: $text-secondary;
          border: 1px solid $border-color;

          &:hover {
            background: #f5f7fa;
            color: $text-main;
          }
        }

        &.confirm-button {
          background: $primary;
          color: white;

          &:hover {
            background: $primary-light;
            transform: translateY(-2px);
            box-shadow: 0 5px 15px rgba(64, 158, 255, 0.3);
          }

          &:active {
            transform: translateY(0);
          }
        }
      }
    }
  }

  // 响应式调整
  @media (max-width: 768px) {
    ::v-deep .el-dialog {
      width: 95% !important;
      margin: 10px auto;
    }

    .plugin-header {
      padding: 15px;
      flex-direction: column;
      align-items: flex-start;

      .plugin-icon {
        margin-bottom: 15px;
      }
    }

    .plugin-content {
      padding: 15px;
    }

    .settings-row {
      grid-template-columns: 1fr !important;
    }

    .dialog-footer {
      padding: 15px;

      .action-buttons {
        width: 100%;

        button {
          flex: 1;
          padding: 10px 0;
        }
      }
    }
  }

  // 限制宽度
  &.limit-width {
    ::v-deep .el-dialog {
      max-width: 600px;
    }
  }
}
</style>

<style scoped>
.plugin-tabs ::v-deep .el-tabs__header { margin-bottom:16px; }
.config-panel { display:flex; flex-direction:column; gap:28px; min-width:0; }
.config-search { max-width:420px; }
.config-empty { padding:40px 0; color:var(--text-color-secondary); text-align:center; font-size:13px; }
.neko-dialog ::v-deep .el-dialog { max-width:1400px; }
@media(max-width:760px) { .neko-dialog ::v-deep .el-dialog { width:calc(100% - 16px) !important; margin:8px auto !important; } .neko-dialog ::v-deep .el-dialog__body { padding:12px; } .dialog-footer { position:sticky; bottom:0; background:var(--bg-color-secondary); z-index:4; } }
</style>
