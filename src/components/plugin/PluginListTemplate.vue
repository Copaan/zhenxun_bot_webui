<template>
  <div class="plugin-list-container h-full overflow-auto">
    <div
      class="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4 p-4"
    >
      <div
        v-for="data in dataList"
        :key="data.module"
        class="plugin-card relative rounded-xl p-4 transition-all duration-300 cursor-pointer"
        :class="{
          'border-2 shadow-lg transform -translate-y-1': isSelected(
            data.module
          ),
          'border-2 border-transparent hover:border-opacity-50': !isSelected(
            data.module
          ),
        }"
        :style="{
          borderColor: isSelected(data.module)
            ? 'var(--primary-color)'
            : 'var(--border-color-light)',
          boxShadow: isSelected(data.module) ? 'var(--primary-shadow)' : 'none',
          background: 'var(--bg-color-secondary)',
        }"
        @click="toggleSelection(data)"
      >
        <!-- 选中标记 -->
        <div
          v-if="isSelected(data.module)"
          class="absolute -top-2 -right-2 w-6 h-6 rounded-full flex items-center justify-center text-white text-xs z-10 animate-bounce"
          :style="{ backgroundColor: 'var(--primary-color)' }"
        >
          <i class="fas fa-check"></i>
        </div>

        <!-- 插件内容 -->
        <div class="flex flex-col h-full">
          <!-- 插件名称和版本 -->
          <div class="flex items-baseline mb-1">
            <h3
              class="text-lg font-bold truncate"
              :style="{ color: 'var(--primary-color)' }"
            >
              {{ data.plugin_name }}
            </h3>
            <span
              class="ml-2 text-xs px-1.5 py-0.5 rounded-full"
              :style="{
                color: 'var(--primary-color)',
                backgroundColor: 'var(--bg-color-hover)',
              }"
              >v{{ data.version }}</span
            >
          </div>

          <!-- 模块和作者 -->
          <p
            class="text-sm mb-2 truncate"
            :style="{ color: 'var(--text-color-secondary)' }"
          >
            <span class="font-mono">{{ data.module }}</span>
            <span
              v-if="data.author"
              class="ml-2"
              :style="{ color: 'var(--primary-color-light)' }"
              >@{{ data.author }}</span
            >
          </p>

          <!-- 菜单类型标签 -->
          <div v-if="data.menu_type" class="mt-auto">
            <span
              class="inline-block px-2 py-1 text-xs rounded-full"
              :style="{
                backgroundColor: 'var(--bg-color-hover)',
                color: 'var(--primary-color)',
              }"
            >
              {{ data.menu_type }}
            </span>
          </div>

          <!-- 底部按钮区域 - 右侧横向排列 -->
          <div
            class="flex justify-end items-center mt-3 pt-2"
            :style="{ borderTop: '1px solid var(--border-color-light)' }"
          >
            <NormalButton
              iconClass="readme"
              text="帮助"
              title="查看使用帮助"
              base-class="hover:scale-110"
              active-class="bg-blue-100 text-blue-600 hover:bg-blue-200 hover:text-blue-800"
              @click="openUsage(data)"
            />

            <!-- 开关 -->
            <div class="flex items-center" title="启用或停用命令响应，不会卸载插件或释放运行时资源" @click.stop>
              <MySwitch
                :value="data.status"
                :disabled="!data.allow_switch"
                @input="onSwitchChange(data, $event)"
              />
              <span
                v-if="!data.allow_switch"
                class="ml-2 text-xs"
                :style="{ color: 'var(--text-color-secondary)' }"
                >禁用</span
              >
              <span
                v-else
                class="ml-2 text-xs"
                :style="{
                  color: data.status
                    ? 'var(--el-color-success)'
                    : 'var(--el-color-danger)',
                }"
                >{{ data.status ? "开启" : "关闭" }}</span
              >
            </div>

            <!-- 配置按钮 -->
            <NormalButton
              icon-class="fas fa-cog text-lg"
              iconClass="setting"
              :disabled="!data.allow_setting"
              text="配置"
              title="插件配置"
              base-class="hover:scale-110"
              active-class="bg-blue-100 text-blue-600 hover:bg-blue-200 hover:text-blue-800"
              @click="openSetting(data)"
            />

            <!-- 卸载按钮 -->
            <NormalButton
              v-if="data.management_source === 'nonebot_store'"
              iconClass="store"
              text="NB商店"
              title="前往 NoneBot 商店管理或卸载"
              base-class="hover:scale-110"
              active-class="bg-blue-100 text-blue-600 hover:bg-blue-200 hover:text-blue-800"
              @click="goToManagement(data)"
            />
            <NormalButton
              v-else
              text="卸载"
              :iconClass="
                !data.uninstall_supported ? 'uninstall-disabled' : 'uninstall-purple'
              "
              :title="data.uninstall_supported ? '卸载插件' : data.uninstall_reason || '该插件不可卸载'"
              :disabled="!data.uninstall_supported"
              :base-class="'hover:scale-110'"
              :active-class="'bg-purple-100 text-purple-600 hover:bg-purple-200 hover:text-purple-800'"
              @click="uninstallPlugin(data)"
            />
          </div>
        </div>
      </div>
    </div>

    <UpdateDialog
      v-if="dialogVisible"
      :module="pluginModule"
      @close="closeSetting"
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
import NormalButton from "@/components/ui/NormalButton.vue"
import MySwitch from "@/components/ui/MySwitch.vue"

export default {
  name: "PluginListTemplate",
  props: { pluginType: String, menuType: String },
  components: { UpdateDialog, NormalButton, MySwitch },
  data() {
    return {
      dataList: [],
      pluginModule: null,
      dialogVisible: false,
      selectedPlugins: [],
      usageVisible: false,
      usagePlugin: null,
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
    newOperationId() {
      const bytes = new Uint8Array(16)
      window.crypto.getRandomValues(bytes)
      return Array.from(bytes, (value) => value.toString(16).padStart(2, "0")).join("")
    },
    getPluginList() {
      this.clearSelection()
      const loading = this.getLoading(".plugin-list-container")

      this.getRequest(`${this.$root.prefix}/plugin/get_plugin_list`, {
        plugin_type: [this.pluginType],
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
        .finally(() => loading.close())
    },
    changeSwitch(data) {
      this.onSwitchChange(data, !data.status)
    },
    onSwitchChange(data, newStatus) {
      this.postRequest(`${this.$root.prefix}/plugin/change_switch`, {
        module: data.module,
        status: newStatus,
      }).then((resp) => {
        if (resp.suc) {
          this.$message.success(resp.info)
          this.getPluginList()
        } else {
          this.$message.error(resp.info)
        }
      })
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
    async uninstallPlugin(data) {
      const result = await this.$cuteConfirm({
        title: "卸载确认",
        message: `确定要卸载插件 "${data.plugin_name}" 吗?`,
        cancelButtonText: "我再想想",
        confirmButtonText: "狠心卸载",
      })

      if (result) {
        const operationId = this.newOperationId()
        sessionStorage.setItem("zhenxun_plugin_operation", JSON.stringify({ operationId, action: "remove", pluginName: data.plugin_name }))
        this.$store.commit("START_PLUGIN_OPERATION", { action: "remove", pluginName: data.plugin_name, title: "正在卸载插件", message: "请稍后，插件正在卸载，请不要刷新页面" })
        try {
          const resp = await this.postRequest(`${this.$root.prefix}/store/remove_plugin`, {
            store_key: data.store_key,
            module: data.runtime_module,
            operation_id: operationId,
          }, { suppressErrorToast: true })
          if (resp.suc) {
            const mode = resp.data?.apply_mode
            const pending = mode === "restart_pending"
            this.$store.commit("FINISH_PLUGIN_OPERATION", {
              status: mode === "failed" ? "error" : pending ? "pending" : "success",
              title: mode === "failed" ? "插件卸载失败" : pending ? "插件卸载等待重启" : "插件卸载完成",
              message: pending ? "插件卸载已暂存，明确重启后统一应用。" : mode === "failed" ? "卸载失败，插件文件和运行状态已保留。" : "插件已卸载并清理运行时资源。",
              applyMode: mode,
              restartAvailable: resp.data?.restart_available,
              accessUrls: resp.data?.access_urls || [],
              accessTargets: resp.data?.access_targets || [],
            })
            await this.getPluginList()
          } else {
            throw new Error(resp.info || "卸载失败")
          }
        } catch (error) {
          this.$store.commit("FINISH_PLUGIN_OPERATION", { status: "error", title: "插件卸载失败", message: error.response?.data?.detail || error.message || "卸载失败" })
        }
      } else {
        console.log("取消卸载")
      }
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
.plugin-card {
  box-shadow: var(--card-shadow);
  background-image: radial-gradient(
      circle at 10% 20%,
      var(--primary-color-light) 0%,
      var(--bg-color-hover) 90%
    ),
    linear-gradient(to bottom right, var(--bg-color), var(--bg-color-secondary));
  transition: all 0.3s cubic-bezier(0.25, 0.8, 0.25, 1);
  min-height: 140px;
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

.plugin-card .button-row {
  border-top: 1px dashed var(--border-color-light);
  padding-top: 8px;
  margin-top: 8px;
}

.plugin-card:hover {
  transform: translateY(-3px) scale(1.02);
  box-shadow: var(--primary-shadow);
}

/* 选中状态动画 */
.plugin-card.is-selected {
  animation: pulse 2s infinite;
  border-color: var(--primary-color);
}

@keyframes pulse {
  0% {
    box-shadow: 0 0 0 0 var(--primary-shadow);
  }
  70% {
    box-shadow: 0 0 0 12px transparent;
  }
  100% {
    box-shadow: 0 0 0 0 transparent;
  }
}

/* 按钮区域 */
.plugin-card .button-area {
  border-left: 1px dashed var(--border-color-light);
}

/* 移动端适配 */
@media (max-width: 640px) {
  /* 小屏幕下只显示图标 */
  .plugin-card button span {
    display: none;
  }
  .plugin-card button {
    padding: 6px;
    min-width: 32px;
  }
}

/* 二次元风格确认对话框 */
:deep(.anime-confirm-dialog) {
  border-radius: 16px;
  background: var(--bg-color-secondary);
  border: 2px solid var(--border-color-light);

  .el-message-box__header {
    background: var(--primary-color);
    border-radius: 14px 14px 0 0;
    padding: 10px 20px;

    .el-message-box__title {
      color: var(--bg-color);
      text-shadow: 1px 1px 2px rgba(0, 0, 0, 0.1);
    }
  }

  .el-message-box__content {
    padding: 20px;
    color: var(--primary-color);
  }

  .el-message-box__btns {
    padding: 10px 20px 20px;

    button {
      border-radius: 12px;
      padding: 8px 16px;

      &.el-button--primary {
        background: var(--primary-color);
        border-color: var(--primary-color);
        color: var(--bg-color);
      }

      &.el-button--default {
        background: var(--bg-color-hover);
        border-color: var(--border-color-light);
        color: var(--primary-color);
      }
    }
  }
}
</style>
