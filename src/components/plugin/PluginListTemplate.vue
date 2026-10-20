<template>
  <div class="plugin-list-container">
    <div class="plugin-grid">
      <article
        v-for="data in dataList"
        :key="data.module"
        class="plugin-card"
        :class="{ 'is-selected': isSelected(data.module), 'is-off': !data.status }"
        role="button"
        tabindex="0"
        :aria-pressed="isSelected(data.module)"
        :aria-label="`${data.plugin_name}，${isSelected(data.module) ? '已选中' : '未选中'}`"
        @click="toggleSelection(data)"
        @keydown.enter.prevent="toggleSelection(data)"
        @keydown.space.prevent="toggleSelection(data)"
      >
        <span v-if="isSelected(data.module)" class="selected-mark"><i class="el-icon-check"></i></span>

        <div class="card-head">
          <div class="card-title">
            <h3 :title="data.plugin_name">{{ data.plugin_name }}</h3>
            <span class="version">v{{ data.version }}</span>
          </div>
          <div class="plugin-switch" @click.stop>
            <el-select
              :value="runState(data)"
              size="mini"
              :disabled="!data.allow_switch || data.switching"
              aria-label="插件状态"
              @change="onStateChange(data, $event)"
            >
              <el-option label="开启" value="on" />
              <el-option label="关闭" value="off" title="插件保持加载，超级群与超级用户仍可使用" />
              <el-option
                label="停用"
                value="unloaded"
                :disabled="data.is_builtin"
                :title="data.is_builtin ? '内置插件不可停用' : '关闭并卸载插件代码以释放资源，超级群与超级用户也无法使用；重新开启时自动加载'"
              />
            </el-select>
          </div>
        </div>

        <p class="card-module" :title="data.module">
          <span>{{ data.module }}</span>
          <em v-if="data.author">@{{ data.author }}</em>
        </p>

        <div class="card-tags">
          <span v-if="data.menu_type" class="tag">{{ data.menu_type }}</span>
          <span class="tag state" :class="switchStateClass(data)">{{ switchLabel(data) }}</span>
        </div>

        <div class="card-actions" @click.stop>
          <el-button type="text" size="mini" icon="el-icon-reading" @click="openUsage(data)">帮助</el-button>
          <el-button type="text" size="mini" icon="el-icon-setting" :disabled="!data.allow_setting" @click="openSetting(data)">配置</el-button>
          <el-button
            v-if="data.management_source === 'nonebot_store'"
            type="text"
            size="mini"
            icon="el-icon-goods"
            title="前往 NoneBot 商店管理或卸载"
            @click="goToManagement(data)"
          >NB商店</el-button>
          <el-button
            v-else
            type="text"
            size="mini"
            icon="el-icon-delete"
            class="danger-action"
            :title="data.uninstall_supported ? '卸载插件' : data.uninstall_reason || '该插件不可卸载'"
            :disabled="!data.uninstall_supported"
            @click="uninstallPlugin(data)"
          >卸载</el-button>
        </div>
      </article>
    </div>
    <el-empty v-if="loaded && !dataList.length" description="当前分类下没有插件" :image-size="90" />

    <UpdateDialog
      v-if="dialogVisible"
      :module="pluginModule"
      @close="closeSetting"
      @uninstall="handleDetailUninstall"
    />
    <el-drawer
      :visible.sync="usageVisible"
      :title="usagePlugin ? `${usagePlugin.plugin_name} · 使用帮助` : '使用帮助'"
      :size="usageDrawerSize"
      append-to-body
    >
      <div class="usage-drawer">
        <div class="usage-module">{{ usagePlugin && usagePlugin.module }}</div>
        <pre>{{ usagePlugin && usagePlugin.usage ? usagePlugin.usage : "暂无使用说明" }}</pre>
        <el-button
          v-if="usagePlugin && usagePlugin.homepage"
          type="primary"
          plain
          icon="el-icon-link"
          @click="openHomepage(usagePlugin.homepage)"
        >打开插件主页</el-button>
      </div>
    </el-drawer>
  </div>
</template>

<script>
import UpdateDialog from "./UpdateDialog"
import { notifyRestartStatusChanged } from "@/utils/apply-result"
import { newOperationId, reasonText, rememberPluginOperation, storeOperationResult } from "@/utils/plugin-operation"

const PLUGIN_TYPE_GROUPS = {
  ADMIN: ["ADMIN", "ADMIN_SUPER"],
  SUPERUSER: ["SUPERUSER", "ADMIN_SUPER"],
  HIDDEN: ["HIDDEN", "DEPENDANT"],
}

export default {
  name: "PluginListTemplate",
  props: { pluginType: String, menuType: String },
  components: { UpdateDialog },
  data() {
    return {
      dataList: [],
      pluginModule: null,
      dialogVisible: false,
      selectedPlugins: [],
      usageVisible: false,
      usagePlugin: null,
      loaded: false,
    }
  },
  computed: {
    usageDrawerSize() {
      return window.innerWidth <= 680 ? "94%" : "520px"
    },
  },
  mounted() {
    this.getPluginList()
  },
  methods: {
    getPluginList() {
      this.clearSelection()
      const loading = this.getLoading(".plugin-list-container")

      this.getRequest(`${this.$root.prefix}/plugin/get_plugin_list`, {
        plugin_type: PLUGIN_TYPE_GROUPS[this.pluginType] || [this.pluginType],
        menu_type: this.menuType,
      })
        .then((resp) => {
          if (resp?.suc) {
            this.dataList = Array.isArray(resp.data) ? resp.data : []
            if (resp.warning) {
              this.$message.warning(resp.warning)
            }
          } else {
            this.$message.error(resp?.info || "获取插件列表失败")
            this.dataList = []
          }
        })
        .catch((error) => {
          this.$message.error("请求插件列表失败: " + error)
          this.dataList = []
        })
        .finally(() => {
          this.loaded = true
          loading.close()
        })
    },
    runState(data) {
      if (data.parked) return "unloaded"
      return data.status ? "on" : "off"
    },
    async postState(path, payload) {
      const resp = await this.postRequest(`${this.$root.prefix}/plugin/${path}`, payload, { suppressErrorToast: true })
      if (!resp?.suc) throw new Error(resp?.info || "插件状态更新失败")
      return resp
    },
    async onStateChange(data, state) {
      if (data.switching || state === this.runState(data)) return
      this.$set(data, "switching", true)
      try {
        let resp
        if (data.parked) {
          resp = await this.postState("unload", { module: data.module, unloaded: false })
        }
        if (state === "on") {
          resp = await this.postState("change_switch", { module: data.module, status: true, expected_revision: data.policy_revision })
        } else if (!data.parked) {
          if (data.status) {
            resp = await this.postState("change_switch", { module: data.module, status: false, expected_revision: data.policy_revision })
          }
          if (state === "unloaded") {
            resp = await this.postState("unload", { module: data.module, unloaded: true })
          }
        }
        this.$message.success(resp?.info || "插件状态已更新")
      } catch (error) {
        this.$message.error(error?.response?.data?.detail || error.message || "插件状态更新失败")
      } finally {
        this.$set(data, "switching", false)
        await this.getPluginList()
      }
    },
    openSetting(data) {
      this.pluginModule = data.module
      this.dialogVisible = true
    },
    openUsage(data) {
      this.usagePlugin = data
      this.usageVisible = true
    },
    openHomepage(url) {
      if (/^https?:\/\//i.test(String(url || ""))) {
        window.open(url, "_blank", "noopener,noreferrer")
      }
    },
    goToManagement(data) {
      if (!data.management_route) return
      this.$router.push(data.management_route).catch(() => {})
    },
    closeSetting(isRefresh) {
      this.dialogVisible = false
      if (isRefresh) this.getPluginList()
    },
    handleDetailUninstall(data) {
      this.dialogVisible = false
      if (data.management_source === "zhenxun_store") {
        return this.uninstallPlugin(data)
      }
      if (data.management_source === "nonebot_store") {
        const project = String(data.management_key || "").replace(/^nonebot:/, "")
        if (!project) return this.$message.error("未找到 NoneBot 商店项目标识")
        return this.$router.push({
          path: "/store",
          query: { source: "nonebot", search: project, action: "uninstall" },
        }).catch(() => {})
      }
      return null
    },
    async uninstallPlugin(data) {
      const result = await this.$confirmAction({
        title: "卸载确认",
        message: `确定要卸载插件 "${data.plugin_name}" 吗?`,
        cancelButtonText: "我再想想",
        confirmButtonText: "狠心卸载",
      })

      if (result) {
        const operationId = newOperationId()
        rememberPluginOperation(operationId, "remove", data.plugin_name, "zhenxun")
        this.$store.commit("START_PLUGIN_OPERATION", { action: "remove", pluginName: data.plugin_name, title: "正在卸载插件", message: "请稍后，插件正在卸载，请不要刷新页面" })
        try {
          const resp = await this.postRequest(`${this.$root.prefix}/store/remove_plugin`, {
            store_key: data.store_key,
            operation_id: operationId,
          }, { suppressErrorToast: true })
          if (resp.suc) {
            const operation = storeOperationResult(resp, resp.info || "卸载已完成。", "remove")
            notifyRestartStatusChanged()
            this.$store.commit("FINISH_PLUGIN_OPERATION", {
              ...operation,
              title: operation.status === "error" ? "插件卸载后应用失败" : "插件卸载完成",
            })
            await this.getPluginList()
          } else {
            throw new Error(resp.info || "卸载失败")
          }
        } catch (error) {
          this.$store.commit("FINISH_PLUGIN_OPERATION", { status: "error", title: "插件卸载失败", message: reasonText(error.response?.data?.info || error.response?.data?.detail || error.message || "卸载失败") })
        }
      }
    },
    switchStateClass(data) {
      if (!data.status) return "is-off"
      return data.block_type ? "is-partial" : "is-on"
    },
    switchLabel(data) {
      if (!data.allow_switch) return "不可切换"
      if (data.parked) return "已停用"
      if (!data.status) return "关闭"
      return { GROUP: "群聊禁用", PRIVATE: "私聊禁用" }[data.block_type] || "开启"
    },
    isSelected(module) {
      return this.selectedPlugins.includes(module)
    },
    toggleSelection(data) {
      const module = data.module
      if (!data.allow_switch || !data.allow_setting) {
        this.$message.warning("该插件不支持切换或配置")
        return
      }

      const index = this.selectedPlugins.indexOf(module)
      if (index > -1) {
        this.selectedPlugins.splice(index, 1)
      } else {
        this.selectedPlugins.push(module)
      }
      this.$emit("update:selection", [...this.selectedPlugins])
    },
    clearSelection() {
      if (this.selectedPlugins.length > 0) {
        this.selectedPlugins = []
        this.$emit("update:selection", [])
      }
    },
  },
}
</script>

<style scoped>
.plugin-list-container {
  height: 100%;
  overflow: auto;
}

.plugin-grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(250px, 1fr));
  gap: 12px;
  padding: 16px;
}

.plugin-card {
  position: relative;
  display: flex;
  flex-direction: column;
  min-width: 0;
  padding: 14px 14px 8px;
  border: 1px solid var(--border-color);
  border-radius: 8px;
  background: var(--bg-color-secondary);
  cursor: pointer;
  transition: border-color 0.15s, box-shadow 0.15s;
}

.plugin-card:hover {
  border-color: var(--primary-color-light-5);
  box-shadow: var(--card-shadow);
}

.plugin-card:focus-visible {
  outline: 2px solid var(--primary-color-light-5);
  outline-offset: 2px;
}

.plugin-card.is-selected {
  border-color: var(--primary-color);
  box-shadow: 0 0 0 3px var(--primary-shadow);
}

.selected-mark {
  position: absolute;
  top: -8px;
  left: -8px;
  display: flex;
  align-items: center;
  justify-content: center;
  width: 20px;
  height: 20px;
  border-radius: 50%;
  color: #ffffff;
  background: var(--primary-color);
  font-size: 12px;
}

.card-head {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 10px;
}

.card-title {
  display: flex;
  align-items: baseline;
  gap: 6px;
  min-width: 0;
}

.card-title h3 {
  margin: 0;
  overflow: hidden;
  color: var(--text-color);
  font-size: 15px;
  font-weight: 600;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.plugin-card.is-off .card-title h3 {
  color: var(--text-color-secondary);
}

.version {
  flex-shrink: 0;
  color: var(--text-color-secondary);
  font-size: 12px;
}

.plugin-switch {
  flex-shrink: 0;
  cursor: default;
}

.plugin-switch .el-select {
  width: 76px;
}

.card-module {
  display: flex;
  gap: 6px;
  margin: 4px 0 10px;
  overflow: hidden;
  color: var(--text-color-secondary);
  font-size: 12px;
  white-space: nowrap;
}

.card-module span {
  overflow: hidden;
  font-family: Consolas, "SFMono-Regular", monospace;
  text-overflow: ellipsis;
}

.card-module em {
  flex-shrink: 0;
  color: var(--primary-color);
  font-style: normal;
}

.card-tags {
  display: flex;
  flex-wrap: wrap;
  gap: 6px;
  margin-bottom: 8px;
}

.tag {
  padding: 2px 8px;
  border-radius: 4px;
  color: var(--text-color-secondary);
  background: var(--bg-color-hover);
  font-size: 12px;
  line-height: 18px;
}

.tag.state.is-on {
  color: var(--success-color);
  background: color-mix(in srgb, var(--success-color) 12%, transparent);
}

.tag.state.is-partial {
  color: var(--warning-color);
  background: color-mix(in srgb, var(--warning-color) 12%, transparent);
}

.tag.state.is-off {
  color: var(--danger-color);
  background: var(--el-color-danger-light-9);
}

.card-actions {
  display: flex;
  gap: 2px;
  margin-top: auto;
  padding-top: 6px;
  border-top: 1px solid var(--border-color-light);
  cursor: default;
}

.card-actions .el-button {
  padding: 6px 8px;
  color: var(--text-color-secondary);
}

.card-actions .el-button + .el-button {
  margin-left: 0;
}

.card-actions .el-button:not(.is-disabled):hover {
  color: var(--primary-color);
}

.card-actions .danger-action:not(.is-disabled):hover {
  color: var(--danger-color);
}

.card-actions .el-button.is-disabled {
  color: var(--text-color-disabled);
}

.usage-drawer {
  padding: 0 22px 32px;
  color: var(--text-color);
}

.usage-module {
  margin-bottom: 14px;
  color: var(--text-color-secondary);
  font-family: Consolas, monospace;
  overflow-wrap: anywhere;
}

.usage-drawer pre {
  margin: 0 0 18px;
  padding: 16px;
  border: 1px solid var(--border-color);
  border-radius: 6px;
  color: var(--text-color);
  background: var(--bg-color-secondary);
  font-family: inherit;
  line-height: 1.65;
  overflow-wrap: anywhere;
  white-space: pre-wrap;
}

@media (max-width: 760px) {
  .plugin-list-container {
    height: auto;
    overflow: visible;
  }
}

@media (max-width: 520px) {
  .plugin-grid {
    grid-template-columns: 1fr;
    gap: 10px;
    padding: 10px;
  }

  .card-actions .el-button {
    padding: 8px 10px;
  }
}
</style>
