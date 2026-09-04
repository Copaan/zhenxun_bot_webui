<template>
  <el-dialog
    :visible.sync="innerVisible"
    :title="title"
    :width="dialogWidth"
    custom-class="kawaii-dialog"
    :before-close="confirmClose"
    @closed="handleClosed"
  >
    <div class="kawaii-editor-container">
      <!-- 文件信息展示 -->
      <div v-if="showFilePath" class="file-info-banner">
        <div class="file-path-display flex justify-center">
          <svg-icon
            :iconClass="icon"
            v-if="icon"
            style="margin-top: 3px; margin-right: 5px"
          />
          {{ filePath }}
        </div>
      </div>

      <!-- 编辑器工具栏 -->
      <div v-if="!readOnly" class="editor-toolbar">
        <MyButton
          text="保存"
          type="primary"
          :rounded="'lg'"
          :shadow="'lg'"
          :glow="true"
          :width="100"
          icon="save"
          @click="handleSave"
        />
        <MyButton
          text="清空"
          type="danger"
          :rounded="'lg'"
          :shadow="'lg'"
          :glow="true"
          :width="100"
          icon="clear4"
          @click="handleClear"
        />
        <MyButton
          v-if="language === 'json'"
          text="格式化"
          type="purple"
          :rounded="'lg'"
          :shadow="'lg'"
          :glow="true"
          :width="100"
          icon="format"
          @click="handleFormat"
        />
      </div>

      <!-- 代码编辑器 -->
      <div class="code-editor-wrapper">
        <code-mirror
          ref="editor"
          v-model="editorContent"
          :options="editorOptions"
          :read-only="readOnly"
          @ready="onEditorReady"
          class="scrollable-editor"
        />
      </div>

      <!-- 状态栏 -->
      <div class="editor-status-bar">
        <div class="status-item">
          <span class="status-icon">🌐</span>
          <span class="status-text">{{ languageDisplay }}</span>
        </div>
        <div class="status-item">
          <span class="status-icon">📍</span>
          <span class="status-text"
            >行 {{ cursorLine }}, 列 {{ cursorCol }}</span
          >
        </div>
      </div>
    </div>
  </el-dialog>
</template>

<script>
import CodeMirror from "./CodeMirror.vue"
import SvgIcon from "../SvgIcon/SvgIcon.vue"
import MyButton from "../ui/MyButton.vue"
import { clearDirtyState, setDirtyState } from "@/utils/dirty-state"
import "codemirror/addon/scroll/simplescrollbars"
import "codemirror/addon/scroll/simplescrollbars.css"

export default {
  name: "CodeEditor",
  components: {
    CodeMirror,
    MyButton,
    SvgIcon,
  },
  props: {
    title: {
      type: String,
      default: "代码编辑器",
    },
    filePath: {
      type: String,
      default: "",
    },
    language: {
      type: String,
      default: "text",
    },
    readOnly: {
      type: Boolean,
      default: false,
    },
    showFilePath: {
      type: Boolean,
      default: true,
    },
    icon: {
      type: String,
      default: "",
    },
  },
  data() {
    return {
      scrollbarStyle: "simple", // 使用简单滚动条
      lineWrapping: true,
      editorContent: "",
      initialContent: "",
      dirtySource: `system-file-${this._uid}`,
      innerVisible: true,
      cursorLine: 1,
      cursorCol: 1,
      dialogWidth: "70%",
      editorOptions: {
        mode: this.getModeFromLanguage(this.language),
        theme: "kawaii",
        lineNumbers: true,
        lineWrapping: true,
        indentUnit: 2,
        tabSize: 2,
        extraKeys: {
          "Ctrl-S": this.handleSave,
          "Cmd-S": this.handleSave,
          "Ctrl-Enter": this.handleExecute,
          "Cmd-Enter": this.handleExecute,
        },
      },
    }
  },
  computed: {
    languageDisplay() {
      const langMap = {
        text: "纯文本",
        json: "JSON",
        javascript: "JavaScript",
        python: "Python",
        html: "HTML",
        css: "CSS",
        markdown: "Markdown",
        sql: "SQL",
        yaml: "YAML",
        shell: "Shell",
      }
      return langMap[this.language.toLowerCase()] || this.language
    },
  },
  watch: {
    editorContent(value) {
      setDirtyState(
        this.dirtySource,
        !this.readOnly && value !== this.initialContent
      )
    },
    language(newLang) {
      this.editorOptions.mode = this.getModeFromLanguage(newLang)
      if (this.$refs.editor) {
        this.$refs.editor.refresh()
      }
    },
  },
  mounted() {
    this.loadFileContent()
    this.setupResponsive()
    window.addEventListener("resize", this.setupResponsive)
  },
  beforeDestroy() {
    window.removeEventListener("resize", this.setupResponsive)
    clearDirtyState(this.dirtySource)
  },
  methods: {
    validateContent() {
      if (this.language !== "json") return true
      try {
        JSON.parse(this.editorContent)
        return true
      } catch (error) {
        this.$message.error(`JSON语法错误：${error.message}`)
        return false
      }
    },
    handleSave() {
      if (!this.validateContent()) return
      const loading = this.getLoading(".kawaii-dialog")
      this.postRequest(`${this.$root.prefix}/system/save_file`, {
        full_path: this.filePath,
        content: this.editorContent,
      }).then((resp) => {
        if (resp.suc) {
          this.initialContent = this.editorContent
          clearDirtyState(this.dirtySource)
          if (resp.warning) {
            this.$message.warning(resp.warning)
          } else {
            this.$message.success(resp.info)
          }
        } else {
          this.$message.error(resp.info)
        }
        loading.close()
      })
    },
    loadFileContent() {
      const loading = this.getLoading(".kawaii-dialog")

      this.getRequest(`${this.$root.prefix}/system/read_file`, {
        full_path: this.filePath,
      }).then((resp) => {
        if (resp.suc) {
          if (resp.warning) {
            this.$message.warning(resp.warning)
          } else {
            this.editorContent = resp.data
            this.initialContent = resp.data
            clearDirtyState(this.dirtySource)
          }
        } else {
          this.$message.error(resp.info)
        }
        loading.close()
      })
    },
    getModeFromLanguage(lang) {
      const modeMap = {
        json: "application/json",
        javascript: "javascript",
        python: "python",
        html: "htmlmixed",
        css: "css",
        markdown: "markdown",
        sql: "sql",
        yaml: "yaml",
        shell: "shell",
      }
      return modeMap[lang.toLowerCase()] || "text"
    },

    setupResponsive() {
      this.dialogWidth = window.innerWidth < 768 ? "90%" : "70%"
    },

    onEditorReady(editor) {
      editor.on("cursorActivity", () => {
        const cursor = editor.getCursor()
        this.cursorLine = cursor.line + 1
        this.cursorCol = cursor.ch + 1
      })

      editor.setOption("extraKeys", {
        ...editor.getOption("extraKeys"),
        "Ctrl-Alt-L": this.handleFormat,
        "Cmd-Alt-L": this.handleFormat,
      })
    },

    async handleClear() {
      const result = await this.$cuteConfirm({
        title: "清空确认",
        message: `确定要清空文件内容吗?`,
        cancelButtonText: "我再想想",
        confirmButtonText: "清空内容",
      })
      if (result) {
        this.editorContent = ""
        this.$nextTick(() => {
          this.$refs.editor.focus()
        })
        this.$message.success("内容已清空！")
      }
    },

    handleFormat() {
      if (this.language === "json") {
        if (this.$refs.editor.formatJson()) {
          this.$message.success("JSON格式化完成！")
        } else {
          this.$message.error("JSON语法错误，无法格式化。")
        }
      } else {
        this.$message.info("当前文件类型不支持格式化")
      }
    },

    handleExecute() {
      this.$emit("execute", this.editorContent)
    },

    confirmClose(done) {
      if (this.readOnly || this.editorContent === this.initialContent) {
        done()
        return
      }
      this.$confirm("文件内容尚未保存，确定放弃修改吗？", "关闭编辑器", {
        confirmButtonText: "放弃修改",
        cancelButtonText: "继续编辑",
        type: "warning",
      })
        .then(() => {
          clearDirtyState(this.dirtySource)
          done()
        })
        .catch(() => {})
    },

    handleClosed() {
      clearDirtyState(this.dirtySource)
      this.$emit("update:visible", false)
      this.$emit("close")
    },

    focus() {
      if (this.$refs.editor) {
        this.$refs.editor.focus()
      }
    },
  },
}
</script>

<style scoped>
/* ================= 二次元对话框整体样式 ================= */
.kawaii-dialog {
  border-radius: 18px !important;
  overflow: hidden;
  background: var(--bg-color-secondary) !important;
  border: 2px solid var(--border-color) !important;
  box-shadow: 0 12px 35px var(--el-box-shadow-light) !important;
  transform-origin: center;
  animation: dialog-pop 0.3s ease-out;
}

@keyframes dialog-pop {
  0% {
    transform: scale(0.95);
    opacity: 0.8;
  }
  100% {
    transform: scale(1);
    opacity: 1;
  }
}

/* 对话框头部 */
.kawaii-dialog >>> .el-dialog__header {
  background: var(--primary-color);
  padding: 16px 24px;
  border-bottom: 2px dashed var(--el-color-white);
  position: relative;
}

.kawaii-dialog >>> .el-dialog__header::after {
  content: "";
  position: absolute;
  bottom: -6px;
  left: 0;
  right: 0;
  height: 6px;
  background: repeating-linear-gradient(
    45deg,
    transparent,
    transparent 10px,
    var(--el-color-white) 10px,
    var(--el-color-white) 20px
  );
}

.kawaii-dialog >>> .el-dialog__title {
  color: var(--el-color-white) !important;
  font-weight: bold;
  font-size: 18px;
  text-shadow: 1px 1px 3px rgba(0, 0, 0, 0.2);
  font-family: "Comic Neue", "M PLUS Rounded 1c", cursive;
  letter-spacing: 1px;
}

.kawaii-dialog >>> .el-dialog__headerbtn {
  top: 18px;
  right: 20px;
}

.kawaii-dialog >>> .el-dialog__headerbtn .el-dialog__close {
  color: var(--el-color-white) !important;
  font-size: 20px;
  transition: all 0.3s ease;
}

.kawaii-dialog >>> .el-dialog__headerbtn:hover .el-dialog__close {
  color: var(--primary-color-light) !important;
  transform: rotate(90deg) scale(1.2);
  text-shadow: 0 0 5px var(--el-color-white);
}

/* 对话框内容区 */
.kawaii-dialog >>> .el-dialog__body {
  padding: 0 !important;
  background: var(--bg-color);
  position: relative;
}

/* ================= 文件信息展示区 ================= */
.file-info-banner {
  padding: 12px 20px;
  background: var(--bg-color-secondary);
  border-bottom: 1px dashed var(--border-color);
  position: relative;
}

.file-info-banner::before {
  content: "";
  position: absolute;
  top: 0;
  left: 0;
  right: 0;
  height: 4px;
  background: linear-gradient(
    to right,
    transparent,
    var(--primary-color),
    var(--primary-color-light),
    transparent
  );
  opacity: 0.5;
}

.file-path-display {
  font-size: 14px;
  color: var(--text-color);
  font-weight: 500;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
  font-family: "Comic Neue", "M PLUS Rounded 1c", cursive;
  padding-left: 24px;
  position: relative;
}

/* ================= 编辑器工具栏 ================= */
.editor-toolbar {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
  padding: 12px 20px;
  background: var(--bg-color-secondary);
  border-bottom: 1px solid var(--border-color-light);
}

.kawaii-toolbar-btn {
  display: flex;
  align-items: center;
  padding: 8px 16px;
  border-radius: 999px;
  font-size: 14px;
  font-weight: bold;
  transition: all 0.3s ease;
  border: none;
  box-shadow: 0 2px 8px rgba(0, 0, 0, 0.1);
  position: relative;
  overflow: hidden;
  font-family: "Comic Neue", "M PLUS Rounded 1c", cursive;
}

.kawaii-toolbar-btn::before {
  content: "";
  position: absolute;
  top: -50%;
  left: -50%;
  width: 200%;
  height: 200%;
  background: linear-gradient(
    to bottom right,
    rgba(255, 255, 255, 0.3),
    rgba(255, 255, 255, 0)
  );
  transform: rotate(30deg);
}

.kawaii-toolbar-btn:hover {
  transform: translateY(-2px);
  box-shadow: 0 4px 12px rgba(0, 0, 0, 0.15);
}

.kawaii-toolbar-btn:active {
  transform: translateY(0);
}

/* ================= 代码编辑器区域 ================= */
.code-editor-wrapper {
  height: 41vh;
  min-height: 300px;
  max-height: 70vh;
  position: relative;
  margin: 0 10px 10px;
  border-radius: 12px;
  overflow: hidden;
  box-shadow: inset 0 0 10px var(--el-box-shadow-lighter),
    0 4px 15px var(--el-box-shadow-light);
  border: 1px solid var(--border-color);
  background: var(--bg-color-secondary);
}

/* 编辑器滚动区域 */
.code-editor-wrapper >>> .CodeMirror {
  height: 100%;
  font-family: "Comic Neue", "M PLUS Rounded 1c", cursive, monospace;
  background: transparent !important;
  font-size: 14px;
  color: var(--text-color) !important;
}

/* 编辑器内容样式 */
.code-editor-wrapper >>> .CodeMirror-lines {
  color: var(--text-color) !important;
}

.code-editor-wrapper >>> .CodeMirror pre.CodeMirror-line {
  color: var(--text-color) !important;
}

/* 行号区域 */
.code-editor-wrapper >>> .CodeMirror-gutters {
  background: var(--bg-color-hover) !important;
  border-right: 1px solid var(--border-color) !important;
}

.code-editor-wrapper >>> .CodeMirror-linenumber {
  color: var(--text-color-secondary) !important;
  padding: 0 5px !important;
  min-width: 24px;
}

/* 选中文本样式 */
.code-editor-wrapper >>> .CodeMirror-selected {
  background: var(--primary-color-light) !important;
}

/* 光标样式 */
.code-editor-wrapper >>> .CodeMirror-cursor {
  border-left: 2px solid var(--primary-color) !important;
}

/* 匹配括号样式 */
.code-editor-wrapper >>> .CodeMirror-matchingbracket {
  color: var(--primary-color) !important;
  font-weight: bold;
}

/* 搜索高亮样式 */
.code-editor-wrapper >>> .CodeMirror-searching {
  background: var(--primary-color-light) !important;
  color: var(--text-color) !important;
}

/* 暗色主题特定样式 */
[data-theme="dark"] .code-editor-wrapper >>> .CodeMirror,
[data-theme="one-dark"] .code-editor-wrapper >>> .CodeMirror {
  background: var(--bg-color) !important;
}

[data-theme="dark"] .code-editor-wrapper >>> .CodeMirror-gutters,
[data-theme="one-dark"] .code-editor-wrapper >>> .CodeMirror-gutters {
  background: var(--bg-color-secondary) !important;
  border-right: 1px solid var(--border-color) !important;
}

[data-theme="dark"] .code-editor-wrapper >>> .CodeMirror-linenumber,
[data-theme="one-dark"] .code-editor-wrapper >>> .CodeMirror-linenumber {
  color: var(--text-color-secondary) !important;
}

[data-theme="dark"] .code-editor-wrapper >>> .CodeMirror-selected,
[data-theme="one-dark"] .code-editor-wrapper >>> .CodeMirror-selected {
  background: var(--primary-color-light) !important;
}

/* 滚动条样式 */
.code-editor-wrapper >>> .CodeMirror-vscrollbar {
  width: 10px;
  right: 0;
}

.code-editor-wrapper >>> .CodeMirror-vscrollbar::-webkit-scrollbar-thumb {
  background: var(--primary-color);
  border-radius: 5px;
  border: 1px solid var(--border-color-light);
}

.code-editor-wrapper >>> .CodeMirror-hscrollbar {
  height: 10px;
  bottom: 0;
}

.code-editor-wrapper >>> .CodeMirror-hscrollbar::-webkit-scrollbar-thumb {
  background: var(--primary-color-light);
  border-radius: 5px;
}

/* ================= 状态栏 ================= */
.editor-status-bar {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 8px 16px;
  background: var(--bg-color-hover);
  border-top: 1px dashed var(--border-color);
  font-family: "Comic Neue", "M PLUS Rounded 1c", cursive;
  font-size: 13px;
}

.status-item {
  display: flex;
  align-items: center;
}

.status-icon {
  margin-right: 6px;
  font-size: 14px;
}

.status-text {
  color: var(--text-color);
}

/* 暗色主题下的状态栏 */
[data-theme="dark"] .editor-status-bar,
[data-theme="one-dark"] .editor-status-bar {
  background: var(--bg-color-secondary);
  border-top: 1px dashed var(--border-color);
}

[data-theme="dark"] .status-text,
[data-theme="one-dark"] .status-text {
  color: var(--text-color);
}

/* ================= 动画效果 ================= */
@keyframes float {
  0%,
  100% {
    transform: translateY(0);
  }
  50% {
    transform: translateY(-4px);
  }
}

@keyframes sparkle {
  0% {
    opacity: 0.3;
    transform: scale(0.8);
  }
  50% {
    opacity: 1;
    transform: scale(1.1);
  }
  100% {
    opacity: 0.3;
    transform: scale(0.8);
  }
}

/* 装饰元素 */
.kawaii-dialog::after {
  content: "";
  position: absolute;
  top: -10px;
  right: -10px;
  width: 60px;
  height: 60px;
  background-image: url('data:image/svg+xml;utf8,<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="%23ff6b88"><path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm0 18c-4.42 0-8-3.58-8-8s3.58-8 8-8 8 3.58 8 8-3.58 8-8 8z"/><circle cx="8.5" cy="10.5" r="1.5"/><circle cx="15.5" cy="10.5" r="1.5"/><path d="M12 16c-1.48 0-2.75-.81-3.45-2H6.88c.8 2.05 2.79 3.5 5.12 3.5s4.32-1.45 5.12-3.5h-1.67c-.7 1.19-1.97 2-3.45 2z"/></svg>');
  background-size: contain;
  opacity: 0.1;
  z-index: 0;
  animation: sparkle 3s infinite;
}

/* ================= 移动端适配 ================= */
@media (max-width: 768px) {
  .kawaii-dialog {
    width: 90% !important;
    border-radius: 14px !important;
  }

  .file-info-banner {
    padding: 10px 16px;
  }

  .editor-toolbar {
    padding: 10px 16px;
    justify-content: center;
  }

  .kawaii-toolbar-btn {
    padding: 6px 12px;
    font-size: 13px;
  }

  .code-editor-wrapper {
    height: 50vh;
    margin: 0 8px 8px;
  }

  .editor-status-bar {
    padding: 6px 12px;
    font-size: 12px;
  }
}
</style>

<style>
/* 全局字体 */
@import url("https://fonts.googleapis.com/css2?family=Comic+Neue:wght@400;700&family=M+PLUS+Rounded+1c:wght@400;700&display=swap");
</style>
