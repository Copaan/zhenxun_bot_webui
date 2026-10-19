<template>
  <div class="zx-page plugin-page" :class="{ 'has-selection': selectedPluginModules.length > 0 }">
    <header class="zx-page-header">
      <div>
        <h1>插件列表</h1>
        <p>管理已加载插件的开关、配置、使用帮助与菜单分类。</p>
      </div>
      <div class="zx-page-actions">
        <el-button size="small" icon="el-icon-download" @click="showInstallDependencyDialog = true">依赖管理</el-button>
      </div>
    </header>

    <section class="zx-panel plugin-toolbar">
      <el-radio-group v-model="activeBtn" size="small" class="type-tabs" @change="clickPluginType">
        <el-radio-button v-for="type in pluginTypes" :key="type.value" :label="type.value">
          {{ type.label }}<span class="type-count">{{ pluginCount[type.countKey] }}</span>
        </el-radio-button>
      </el-radio-group>

      <div class="menu-row">
        <span class="menu-label">菜单分类</span>
        <div class="menu-chips">
          <span class="zx-chip" :class="{ 'is-active': !searchMenuType }" @click="selectMenuType('')">全部</span>
          <span
            v-for="tag in sortedMenuTypeList"
            :key="tag"
            class="zx-chip"
            :class="{ 'is-active': searchMenuType === tag }"
            @click="selectMenuType(tag)"
          >{{ tag }}</span>
        </div>
        <div class="menu-actions">
          <el-button size="mini" icon="el-icon-plus" @click="showAddDialogFlag = true">新增分类</el-button>
          <el-button size="mini" icon="el-icon-setting" @click="manageTypesDialogVisible = true">管理分类</el-button>
        </div>
      </div>
    </section>

    <transition name="el-fade-in-linear">
      <section v-if="selectedPluginModules.length > 0" class="zx-panel bulk-actions">
        <span class="bulk-count"><i class="el-icon-circle-check"></i>已选择 {{ selectedPluginModules.length }} 个插件</span>
        <el-button size="mini" type="success" plain icon="el-icon-open" @click="bulkToggleSwitch(true)">启用</el-button>
        <el-button size="mini" type="danger" plain icon="el-icon-turn-off" @click="bulkToggleSwitch(false)">禁用</el-button>
        <el-select v-model="targetMenuTypeBulk" size="mini" placeholder="选择菜单分类" class="bulk-select" clearable>
          <el-option v-for="item in sortedMenuTypeList" :key="item" :label="item" :value="item" />
        </el-select>
        <el-button size="mini" type="primary" :disabled="!targetMenuTypeBulk" @click="bulkUpdateMenuType">应用分类</el-button>
        <el-button size="mini" class="bulk-cancel" @click="cancelSelection">取消选择</el-button>
      </section>
    </transition>

    <section class="zx-panel plugin-list-panel">
      <PluginListTemplate
        ref="pluginListRef"
        :pluginType="activeBtn"
        :menuType="searchMenuType"
        :key="pltKey"
        @update:selection="handleSelectionUpdate"
      />
    </section>

    <el-dialog title="管理菜单分类" :visible.sync="manageTypesDialogVisible" width="420px" append-to-body custom-class="plugin-type-dialog">
      <el-empty v-if="sortedMenuTypeList.length === 0" description="暂无菜单分类" :image-size="80" />
      <ul v-else class="type-list">
        <li v-for="type in sortedMenuTypeList" :key="type">
          <span>{{ type }}</span>
          <el-button type="text" size="mini" icon="el-icon-edit" @click="startRenameType(type)">重命名</el-button>
        </li>
      </ul>
      <span slot="footer"><el-button size="small" @click="manageTypesDialogVisible = false">关闭</el-button></span>
    </el-dialog>

    <el-dialog title="新增菜单分类" :visible.sync="showAddDialogFlag" width="420px" append-to-body custom-class="plugin-type-dialog">
      <el-input v-model="newMenuTypeName" placeholder="请输入新的菜单分类名称" maxlength="20" show-word-limit @keyup.enter.native="addNewMenuType" />
      <p class="dialog-hint">新分类需要通过批量“应用分类”分配给插件后才会保存。</p>
      <span slot="footer">
        <el-button size="small" @click="showAddDialogFlag = false">取消</el-button>
        <el-button size="small" type="primary" @click="addNewMenuType">添加</el-button>
      </span>
    </el-dialog>

    <el-dialog title="重命名菜单分类" :visible.sync="showRenameDialogFlag" width="420px" append-to-body custom-class="plugin-type-dialog rename-type-dialog">
      <el-input v-model="renameMenuTypeName" placeholder="请输入新的菜单分类名称" maxlength="20" show-word-limit @keyup.enter.native="triggerRenameType" />
      <span slot="footer">
        <el-button size="small" @click="showRenameDialogFlag = false">取消</el-button>
        <el-button size="small" type="primary" @click="triggerRenameType">确定</el-button>
      </span>
    </el-dialog>

    <ManualDependencyDialog :visible.sync="showInstallDependencyDialog" />
  </div>
</template>

<script>
import PluginListTemplate from "@/components/plugin/PluginListTemplate.vue"
import ManualDependencyDialog from "@/components/plugin/ManualDependencyDialog.vue"

export default {
  name: "PluginList",
  components: {
    PluginListTemplate,
    ManualDependencyDialog,
  },
  data() {
    return {
      pluginTypes: [
        { value: "NORMAL", label: "普通插件", countKey: "normal" },
        { value: "ADMIN", label: "管理员插件", countKey: "admin" },
        { value: "SUPERUSER", label: "超级用户插件", countKey: "superuser" },
        { value: "HIDDEN", label: "其他插件", countKey: "other" },
      ],
      pluginCount: { normal: 0, admin: 0, superuser: 0, other: 0 },
      activeBtn: "NORMAL",
      pltKey: 0,
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
    this.getPluginCount()
    this.getPluginMenuType()
  },
  methods: {
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
      this.searchMenuType = this.searchMenuType === menuType ? "" : menuType
      this.pltKey++
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
          `菜单类型 "${newType}" 已临时添加，通过批量“应用分类”分配给插件后才会保存`
        )
        this.newMenuTypeName = ""
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

      const loading = this.getLoading(".rename-type-dialog")
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
.plugin-page {
  display: flex;
  flex-direction: column;
  height: 100%;
}

.plugin-toolbar {
  display: flex;
  flex-direction: column;
  gap: 14px;
}

.type-tabs {
  display: flex;
  flex-wrap: wrap;
}

.type-count {
  margin-left: 6px;
  opacity: 0.7;
  font-size: 12px;
}

.menu-row {
  display: flex;
  align-items: flex-start;
  gap: 12px;
}

.menu-label {
  flex-shrink: 0;
  line-height: 28px;
  color: var(--text-color-secondary);
  font-size: 13px;
}

.menu-chips {
  display: flex;
  flex: 1;
  flex-wrap: wrap;
  gap: 8px;
  min-width: 0;
}

.menu-actions {
  display: flex;
  flex-shrink: 0;
  gap: 8px;
}

.menu-actions .el-button + .el-button,
.bulk-actions .el-button + .el-button {
  margin-left: 0;
}

.bulk-actions {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 8px;
  padding: 12px 16px;
  border-color: var(--primary-color-light-5);
  background: var(--primary-color-light-9);
}

.bulk-count {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  margin-right: 6px;
  color: var(--primary-color);
  font-size: 13px;
  font-weight: 600;
}

.bulk-select {
  width: 160px;
}

.bulk-actions .bulk-cancel {
  margin-left: auto;
}

.plugin-list-panel {
  display: flex;
  flex: 1;
  flex-direction: column;
  min-height: 420px;
  margin-bottom: 0;
  padding: 0;
  overflow: hidden;
}

.type-list {
  max-height: 360px;
  margin: 0;
  padding: 0;
  overflow-y: auto;
  list-style: none;
}

.type-list li {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 8px 2px;
  border-bottom: 1px solid var(--border-color-light);
  color: var(--text-color);
}

.type-list li:last-child {
  border-bottom: none;
}

.dialog-hint {
  margin: 10px 0 0;
  color: var(--text-color-secondary);
  font-size: 12px;
}

@media (max-width: 760px) {
  .plugin-page {
    display: block;
    padding: 14px 12px 24px;
  }

  .plugin-page.has-selection {
    padding-bottom: 150px;
  }

  .plugin-toolbar {
    gap: 12px;
    padding: 12px;
  }

  .type-tabs {
    flex-wrap: nowrap;
    margin: 0 -12px;
    padding: 0 12px 2px;
    overflow-x: auto;
    scrollbar-width: none;
  }

  .type-tabs ::v-deep .el-radio-button__inner {
    padding: 8px 12px;
    white-space: nowrap;
  }

  .menu-row {
    flex-wrap: wrap;
    gap: 8px;
  }

  .menu-label {
    line-height: 20px;
  }

  .menu-chips {
    flex-basis: 100%;
    flex-wrap: nowrap;
    order: 3;
    margin: 0 -12px;
    padding: 0 12px 2px;
    overflow-x: auto;
    scrollbar-width: none;
  }

  .menu-chips .zx-chip {
    flex-shrink: 0;
  }

  .menu-actions {
    margin-left: auto;
  }

  .type-tabs::-webkit-scrollbar,
  .menu-chips::-webkit-scrollbar {
    display: none;
  }

  .bulk-actions {
    position: fixed;
    right: 12px;
    bottom: 12px;
    left: 12px;
    z-index: 30;
    margin: 0;
    box-shadow: 0 8px 24px rgba(15, 23, 42, 0.18);
  }

  .bulk-count {
    flex-basis: 100%;
  }

  .bulk-select {
    flex: 1;
    width: auto;
  }

  .bulk-actions .bulk-cancel {
    margin-left: 0;
  }

  .plugin-list-panel {
    min-height: 0;
    overflow: visible;
  }
}
</style>
