<template>
  <div
    ref="pluginManager"
    class="plugin-manager p-4 md:p-6 rounded-2xl"
    :style="{ backgroundColor: 'var(--bg-color)' }"
  >
    <!-- 顶部插件类型选择 -->
    <div class="type-selector-container flex flex-wrap gap-3 justify-between items-center mb-6">
      <div
        class="type-selector rounded-xl shadow-md p-1 inline-flex"
        :style="{
          backgroundColor: 'var(--bg-color-secondary)',
          border: '1px solid var(--border-color-light)',
        }"
        ref="typeSelectorRef"
      >
        <button
          v-for="type in pluginTypes"
          :key="type.value"
          @click="clickPluginType(type.value)"
          class="px-4 py-2 text-sm font-medium transition-all duration-300"
          :class="{
            'text-white shadow-inner': activeBtn === type.value,
            'hover:bg-opacity-10': activeBtn !== type.value,
            'rounded-l-lg': type.first,
            'rounded-r-lg': type.last,
          }"
          :style="{
            backgroundColor:
              activeBtn === type.value ? 'var(--primary-color)' : 'transparent',
            color:
              activeBtn === type.value
                ? 'var(--bg-color)'
                : 'var(--primary-color)',
            '&:hover': {
              backgroundColor:
                activeBtn !== type.value
                  ? 'var(--bg-color-hover)'
                  : 'var(--primary-color)',
            },
          }"
        >
          {{ type.label }}({{ pluginCount[type.countKey] }})
        </button>
      </div>

      <div class="plugin-action-pair">
        <CuteButton @click="showInstallDependencyDialog = true" type="primary" icon="download" :iconColor="'var(--button-icon-color-info)'" class="plugin-action" size="sm">依赖管理</CuteButton>
      </div>
    </div>

    <!-- 过滤标签区域 -->
    <div
      class="filter-area rounded-xl shadow-md p-4 mb-6"
      :style="{
        backgroundColor: 'var(--bg-color-secondary)',
        border: '1px solid var(--border-color-light)',
      }"
      ref="filterAreaRef"
    >
      <div class="filter-row">
        <span
          v-for="tag in sortedMenuTypeList"
          :key="tag"
          @click="selectMenuType(tag)"
          class="px-3 py-1 text-xs rounded-full transition-all duration-200 cursor-pointer"
          :style="{
            backgroundColor:
              searchMenuType === tag
                ? 'var(--primary-color)'
                : 'var(--bg-color-hover)',
            color:
              searchMenuType === tag
                ? 'var(--bg-color)'
                : 'var(--primary-color)',
          }"
        >
          {{ tag }}
        </span>

        <div class="plugin-action-pair">
          <CuteButton @click="showAddDialogFlag = true" type="primary" icon="add" :iconColor="'var(--button-icon-color-info)'" class="plugin-action" size="sm">新增类型</CuteButton>
          <CuteButton @click="manageTypesDialogVisible = true" type="primary" icon="setting1" :iconColor="'var(--button-icon-color-info)'" class="plugin-action" size="sm">管理类型</CuteButton>
        </div>
      </div>
    </div>

    <!-- 批量操作栏 -->
    <div
      v-if="selectedPluginModules.length > 0"
      class="bulk-actions rounded-xl shadow-md p-3 mb-6 border-2 animate-pulse"
      :style="{
        backgroundColor: 'var(--bg-color-secondary)',
        borderColor: 'var(--primary-color)',
      }"
    >
      <div class="flex flex-wrap items-center gap-3">
        <span
          class="text-sm font-medium"
          :style="{ color: 'var(--primary-color)' }"
        >
          <i class="fas fa-check-circle mr-1"></i>已选择
          {{ selectedPluginModules.length }} 个插件
        </span>

        <button
          @click="bulkToggleSwitch(true)"
          class="px-3 py-1 text-xs rounded-full transition-colors duration-200 flex items-center"
          :style="{
            backgroundColor: 'var(--success-color-light)',
            color: 'var(--success-color)',
          }"
        >
          <i class="fas fa-power-off mr-1"></i>启用
        </button>

        <button
          @click="bulkToggleSwitch(false)"
          class="px-3 py-1 text-xs rounded-full transition-colors duration-200 flex items-center"
          :style="{
            backgroundColor: 'var(--danger-color-light)',
            color: 'var(--danger-color)',
          }"
        >
          <i class="fas fa-ban mr-1"></i>禁用
        </button>

        <select
          v-model="targetMenuTypeBulk"
          class="px-3 py-1 text-xs rounded-full transition-all duration-200"
          :style="{
            backgroundColor: 'var(--bg-color)',
            border: '1px solid var(--border-color-light)',
            color: 'var(--text-color)',
          }"
        >
          <option value="" disabled selected>选择新菜单类型</option>
          <option v-for="item in sortedMenuTypeList" :key="item" :value="item">
            {{ item }}
          </option>
        </select>

        <button
          @click="bulkUpdateMenuType"
          class="px-3 py-1 text-xs rounded-full transition-colors duration-200 flex items-center"
          :disabled="!targetMenuTypeBulk"
          :style="{
            backgroundColor: 'var(--primary-color)',
            color: 'var(--bg-color)',
          }"
        >
          <i class="fas fa-check mr-1"></i>应用类型
        </button>

        <button
          @click="cancelSelection"
          class="ml-auto px-3 py-1 text-xs rounded-full transition-colors duration-200 flex items-center"
          :style="{
            backgroundColor: 'var(--bg-color-hover)',
            color: 'var(--text-color-secondary)',
          }"
        >
          <i class="fas fa-times mr-1"></i>取消选择
        </button>
      </div>
    </div>

    <!-- 插件列表 -->
    <div
      class="plugin-list-container rounded-xl shadow-md p-4"
      :style="{
        backgroundColor: 'var(--bg-color-secondary)',
        border: '1px solid var(--border-color-light)',
      }"
    >
      <PluginListTemplate
        ref="pluginListRef"
        :pluginType="activeBtn"
        :menuType="searchMenuType"
        :key="pltKey"
        @update:selection="handleSelectionUpdate"
        :style="{ height: pluginListHeight + 'px' }"
      />
    </div>

    <!-- 管理菜单类型对话框 -->
    <div
      v-if="manageTypesDialogVisible"
      class="fixed inset-0 flex items-center justify-center z-50"
      :style="{ backgroundColor: 'var(--mask-color)' }"
    >
      <div
        class="rounded-xl shadow-xl w-full max-w-md p-6 animate-bounce-in"
        :style="{ backgroundColor: 'var(--bg-color-secondary)' }"
      >
        <div class="flex justify-between items-center mb-4">
          <h3
            class="text-lg font-bold"
            :style="{ color: 'var(--primary-color)' }"
          >
            <i class="fas fa-list-ul mr-2"></i>管理菜单类型
          </h3>
          <button
            @click="manageTypesDialogVisible = false"
            :style="{ color: 'var(--primary-color-light)' }"
          >
            <i class="fas fa-times"></i>
          </button>
        </div>

        <div class="max-h-96 overflow-y-auto">
          <div
            v-if="sortedMenuTypeList.length === 0"
            class="text-center py-4"
            :style="{ color: 'var(--text-color-secondary)' }"
          >
            <i class="fas fa-inbox text-3xl mb-2"></i>
            <p>暂无菜单类型</p>
          </div>

          <div
            v-for="type in sortedMenuTypeList"
            :key="type"
            class="flex justify-between items-center py-2"
            :style="{ borderBottom: '1px solid var(--border-color-light)' }"
          >
            <span :style="{ color: 'var(--primary-color)' }">{{ type }}</span>
            <button
              @click="startRenameType(type)"
              class="px-2 py-1 text-xs rounded-full transition-colors duration-200"
              :style="{
                backgroundColor: 'var(--bg-color-hover)',
                color: 'var(--primary-color)',
              }"
            >
              <i class="fas fa-edit mr-1"></i>重命名
            </button>
          </div>
        </div>

        <div class="mt-6 flex justify-end">
          <button
            @click="manageTypesDialogVisible = false"
            class="px-4 py-2 rounded-full transition-colors duration-200"
            :style="{
              backgroundColor: 'var(--primary-color)',
              color: 'var(--bg-color)',
            }"
          >
            关闭
          </button>
        </div>
      </div>
    </div>
    <NeonDialog
      :visible.sync="showAddDialogFlag"
      title="新增菜单类型"
      icon-class="add-menu"
      @confirm="addNewMenuType"
    >
      <NeonInput
        v-model="newMenuTypeName"
        class="fm-input"
        placeholder="请输入新的菜单类型名称..."
      />
    </NeonDialog>
    <NeonDialog
      :visible.sync="showRenameDialogFlag"
      title="重命名菜单类型"
      icon-class="rename1"
      @confirm="triggerRenameType"
    >
      <NeonInput
        v-model="renameMenuTypeName"
        class="fm-input"
        placeholder="请输入新的菜单类型名称..."
      />
    </NeonDialog>

    <!-- 安装依赖对话框 -->
    <ManualDependencyDialog :visible.sync="showInstallDependencyDialog" />
  </div>
</template>

<script>
import PluginListTemplate from "@/components/plugin/PluginListTemplate.vue"
import ManualDependencyDialog from "@/components/plugin/ManualDependencyDialog.vue"
import CuteButton from "@/components/ui/CuteButton.vue"
import NeonDialog from "@/components/ui/NeonDialog.vue"
import NeonInput from "@/components/ui/NeonInput.vue"

export default {
  name: "PluginList",
  components: {
    PluginListTemplate,
    ManualDependencyDialog,
    NeonDialog,
    NeonInput,
    CuteButton,
  },
  data() {
    return {
      pluginTypes: [
        { value: "NORMAL", label: "普通插件", countKey: "normal", first: true },
        { value: "ADMIN", label: "管理员插件", countKey: "admin" },
        { value: "SUPERUSER", label: "超级用户插件", countKey: "superuser" },
        { value: "HIDDEN", label: "其他插件", countKey: "other", last: true },
      ],
      pluginCount: { normal: 0, admin: 0, superuser: 0, other: 0 },
      activeBtn: "NORMAL",
      pltKey: 0,
      pluginListHeight: 0,
      menuTypeList: [],
      searchMenuType: null,
      selectedPluginModules: [],
      targetMenuTypeBulk: null,
      manageTypesDialogVisible: false,
      showAddDialogFlag: false,
      showRenameDialogFlag: false,
      newMenuTypeName: "",
      renameMenuTypeName: "",
      oldRenameMenuTypeName: "",
      showInstallDependencyDialog: false,
    }
  },
  computed: {
    sortedMenuTypeList() {
      return [...this.menuTypeList].sort((a, b) => a.localeCompare(b))
    },
  },
  mounted() {
    window.addEventListener("resize", this.handleResize)
    this.getPluginCount()
    this.getPluginMenuType()
    this.handleResize()
  },
  beforeDestroy() {
    window.removeEventListener("resize", this.handleResize)
  },
  methods: {
    handleResize() {
      if (this.$isMobile()) {
        this.pluginListHeight =
          this.$refs.pluginManager.offsetHeight -
          this.$refs.typeSelectorRef.offsetHeight -
          this.$refs.filterAreaRef.offsetHeight -
          160
      } else {
        this.pluginListHeight = this.$refs.pluginManager.offsetHeight - 235
      }
    },
    clickPluginType(pluginType) {
      this.activeBtn = pluginType
      this.searchMenuType = null
      this.pltKey++
    },
    getPluginCount() {
      this.getRequest(`${this.$root.prefix}/plugin/get_plugin_count`)
        .then((resp) => {
          if (!resp) {
            this.$message.error("获取插件数量失败：无效的响应")
            return
          }
          if (resp.suc) {
            if (resp.warning) {
              this.$message.warning(resp.warning)
            } else {
              this.pluginCount = resp.data
            }
          } else {
            this.$message.error(resp.info || "获取插件数量失败")
          }
        })
        .catch((error) => {
          this.$message.error("请求插件数量失败: " + error)
        })
    },
    getPluginMenuType() {
      this.getRequest(`${this.$root.prefix}/plugin/get_plugin_menu_type`)
        .then((resp) => {
          if (!resp) {
            this.$message.error("获取菜单类型失败：无效的响应")
            return
          }
          if (resp.suc) {
            if (resp.warning) {
              this.$message.warning(resp.warning)
            } else {
              this.menuTypeList = (
                Array.isArray(resp.data) ? resp.data : []
              ).filter(Boolean)
            }
          } else {
            this.$message.error(resp.info || "获取菜单类型失败")
          }
        })
        .catch((error) => {
          this.$message.error("请求菜单类型失败: " + error)
        })
    },
    selectMenuType(menuType) {
      if (this.searchMenuType !== menuType) {
        this.searchMenuType = menuType
        this.pltKey++
      } else {
        this.searchMenuType = ""
        this.pltKey++
      }
    },
    handleSelectionUpdate(selectedModules) {
      this.selectedPluginModules = selectedModules || []
    },

    cancelSelection() {
      this.selectedPluginModules = []
      this.$refs.pluginListRef?.clearSelection()
    },

    async bulkUpdate(fields, actionText) {
      if (this.selectedPluginModules.length === 0) return false
      const loading = this.getLoading(".bulk-actions")
      try {
        const resp = await this.putRequest(`${this.$root.prefix}/plugin/plugins/batch_update`, {
          updates: this.selectedPluginModules.map((module) => ({ module, ...fields })),
        })
        if (!resp.suc) {
          this.$message.error(resp.info || `${actionText}失败`)
          return false
        }
        if (resp.warning) {
          this.$message.warning(resp.warning)
          return false
        }
        const result = resp.data
        const errors = result.errors || []
        if (!result.success) {
          this.$message.error(`${actionText}失败` + (errors.length ? `: ${errors.map((e) => `${e.module}(${e.error})`).join(", ")}` : ""))
          return false
        }
        this.$message.success(`${actionText}成功，共 ${result.updated_count} 个插件`)
        errors.forEach((err) => this.$message.warning(`插件 ${err.module}: ${err.error}`))
        this.cancelSelection()
        this.pltKey++
        return true
      } catch (error) {
        this.$message.error(`${actionText}失败: ${error.message || error}`)
        return false
      } finally {
        loading.close()
      }
    },

    bulkToggleSwitch(enable) {
      this.bulkUpdate({ block_type: enable ? null : "ALL" }, enable ? "批量启用" : "批量禁用")
    },

    async bulkUpdateMenuType() {
      if (!this.targetMenuTypeBulk) {
        this.$message.warning("请先在上方选择目标菜单类型")
        return
      }
      if (await this.bulkUpdate({ menu_type: this.targetMenuTypeBulk }, "批量修改菜单类型")) {
        this.targetMenuTypeBulk = null
      }
    },

    addNewMenuType() {
      const newType = this.newMenuTypeName.trim()
      if (!newType) {
        this.$message.warning("菜单类型名称不能为空")
        return
      }
      const exists = this.menuTypeList.some(
        (type) => type.toLowerCase() === newType.toLowerCase()
      )
      if (exists) {
        this.$message.warning(`菜单类型 "${newType}" 已存在`)
      } else {
        this.menuTypeList.push(newType)
        this.$message.success(
          `菜单类型 "${newType}" 已临时添加，通过批量“应用类型”分配给插件后才会保存`
        )
        this.newMenuTypeName = ""
        this.handleResize()
      }
      this.showAddDialogFlag = false
    },
    startRenameType(type) {
      this.showRenameDialogFlag = true
      this.oldRenameMenuTypeName = type
      this.renameMenuTypeName = type
    },
    triggerRenameType() {
      const newName = (this.renameMenuTypeName || "").trim()
      if (!newName) {
        this.$message.warning("菜单类型名称不能为空")
        return
      }
      if (newName === this.oldRenameMenuTypeName) {
        this.$message.info("名称未改变")
        return
      }

      const exists = this.menuTypeList.some(
        (type) =>
          type.toLowerCase() === newName.toLowerCase() &&
          type.toLowerCase() !== this.oldRenameMenuTypeName.toLowerCase()
      )
      if (exists) {
        this.$message.warning(`菜单类型名称 "${newName}" 已存在`)
        return
      }

      const loading = this.getLoading(".animate-pop-in")
      this.putRequest(`${this.$root.prefix}/plugin/menu_type/rename`, {
        old_name: this.oldRenameMenuTypeName,
        new_name: newName,
      })
        .then((resp) => {
          loading.close()
          if (!resp) {
            this.$message.error("重命名失败：无效的响应")
            return
          }
          if (resp.suc) {
            this.$message.success(resp.info || "重命名成功！")
            const index = this.menuTypeList.findIndex(
              (type) => type === this.oldRenameMenuTypeName
            )
            if (index !== -1) {
              this.menuTypeList.splice(index, 1, newName)
            }
            if (this.searchMenuType === this.oldRenameMenuTypeName) {
              this.searchMenuType = newName
            }
            this.pltKey++
            this.manageTypesDialogVisible = false
            this.showRenameDialogFlag = false
          } else {
            this.$message.error(resp.info || "重命名失败")
          }
        })
        .catch((error) => {
          loading.close()
          this.$message.error(`请求失败: ${error}`)
        })
    },

  },
}
</script>

<style scoped>
/* 二次元可爱风格动画 */
@keyframes bounce-in {
  0% {
    transform: scale(0.9);
    opacity: 0;
  }
  50% {
    transform: scale(1.05);
  }
  100% {
    transform: scale(1);
    opacity: 1;
  }
}

.animate-bounce-in {
  animation: bounce-in 0.3s ease-out;
}

/* 插件卡片悬停效果 */
.plugin-list-container {
  transition: all 0.3s ease;
}

.plugin-list-container:hover {
  box-shadow: var(--primary-shadow);
}

/* 响应式调整 */
@media (max-width: 640px) {
  .type-selector {
    display: grid;
    grid-template-columns: 1fr 1fr;
    gap: 4px;
  }

  .type-selector button {
    border-radius: 8px !important;
  }

  .bulk-actions {
    padding: 8px;
  }

  .bulk-actions select {
    width: 100%;
  }

  .type-selector-container {
    flex-direction: column;
    gap: 10px;
    align-items: flex-start;
  }

  .type-selector-container .type-selector {
    width: 100%;
  }
}

/* 滚动条样式 */
::-webkit-scrollbar {
  width: 6px;
  height: 6px;
}

::-webkit-scrollbar-track {
  background: var(--bg-color-hover);
  border-radius: 10px;
}

::-webkit-scrollbar-thumb {
  background: var(--primary-color-light);
  border-radius: 10px;
}

::-webkit-scrollbar-thumb:hover {
  background: var(--primary-color);
}

/* 依赖安装对话框 */
.dependency-dialog {
  ::v-deep .el-dialog {
    width: 90% !important;
    max-width: 600px !important;
  }

  .result-container {
    height: 200px;
    font-family: monospace;
    transition: all 0.3s ease;
  }

  .operation-selector {
    box-shadow: 0 1px 3px rgba(0, 0, 0, 0.1);
    transition: all 0.3s ease;

    button {
      position: relative;
      overflow: hidden;

      &::before {
        content: "";
        position: absolute;
        top: 50%;
        left: 50%;
        width: 0;
        height: 0;
        background-color: rgba(255, 255, 255, 0.2);
        border-radius: 50%;
        transform: translate(-50%, -50%);
        transition: width 0.4s ease, height 0.4s ease;
      }

      &:hover::before {
        width: 150%;
        height: 150%;
      }
    }
  }

  .tip-container {
    transition: all 0.3s ease;

    code {
      transition: all 0.3s ease;

      &:hover {
        background-color: rgba(255, 255, 255, 0.5);
      }
    }
  }
}

@media (max-width: 640px) {
  .dependency-dialog {
    ::v-deep .el-dialog {
      width: 95% !important;
    }

    .result-container {
      height: 150px;
    }

    .operation-selector {
      width: 100%;

      button {
        flex: 1;
      }
    }

    .flex.items-center.gap-4 {
      flex-direction: column;
      align-items: stretch;
    }
  }
}
</style>

<style scoped>
.type-selector-container { padding-inline: 17px; }
.filter-row { display:flex; flex-wrap:wrap; align-items:center; gap:8px; }
.plugin-action-pair { display:grid; grid-template-columns:144px 116px; gap:8px; margin-left:auto; flex-shrink:0; }
.plugin-action-pair .plugin-action { border-radius:999px; height:36px; padding:6px 12px; white-space:nowrap; }
@media(max-width:760px) { .type-selector-container { padding-inline:0; } .plugin-action-pair { max-width:100%; } .type-selector-container .plugin-action-pair { margin-right:17px; } }
@media(max-width:420px) { .type-selector-container { padding-inline:0; } .plugin-action-pair { width:100%; grid-template-columns:minmax(0,1fr) minmax(0,1fr); } .type-selector-container .plugin-action-pair { width:calc(100% - 34px); margin-inline:17px; } .plugin-action-pair .plugin-action { font-size:12px; padding-inline:6px; } }
</style>
