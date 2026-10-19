<template>
  <div
    class="command-page"
    :style="{
      height: computedHeight + 'px',
      background: 'var(--bg-color)',
    }"
  >
    <el-row :gutter="1" class="h-full">
      <el-col :xs="24" :sm="24" :md="8" :lg="6" class="h-full">
        <div class="command-panel h-full pr-0 md:pr-0">
          <LeftInfo class="h-full" />
        </div>
      </el-col>

      <el-col :xs="24" :sm="24" :md="16" :lg="12" class="h-full">
        <div class="command-panel h-full px-0 md:px-0">
          <MidInfo class="h-full" />
        </div>
      </el-col>

      <el-col :xs="24" :sm="24" :md="24" :lg="6" class="h-full">
        <div class="command-panel h-full pl-0 md:pl-0">
          <RightInfo class="h-full" />
        </div>
      </el-col>
    </el-row>
  </div>
</template>

<script>
import LeftInfo from "@/components/command/LeftInfo.vue"
import MidInfo from "@/components/command/MidInfo.vue"
import RightInfo from "@/components/command/RightInfo.vue"
import { getHeaderHeight } from "@/utils/utils"
export default {
  name: "MainCommand",
  data() {
    return {
      botInfo: {},
      windowHeight: window.innerHeight,
    }
  },
  components: { LeftInfo, MidInfo, RightInfo },
  computed: {
    computedHeight() {
      return this.windowHeight - getHeaderHeight()
    },
  },
  created() {},
  mounted() {
    window.addEventListener("resize", this.handleResize)
  },
  methods: {
    handleResize() {
      this.windowHeight = window.innerHeight
    },
  },
  beforeDestroy() {
    window.removeEventListener("resize", this.handleResize)
  },
}
</script>

<style lang="scss" scoped>
.command-page {
  padding: 10px;
  overflow: auto;
}

.command-panel {
  background-color: var(--bg-color-secondary);
  border: 1px solid var(--border-color-light);
  border-radius: 8px;
  overflow: hidden;
}

/* 响应式设计 */
@media (max-width: 1024px) {
  .el-col {
    &:nth-child(1),
    &:nth-child(2),
    &:nth-child(3) {
      @apply h-auto;
    }
  }

  .command-panel {
    @apply mb-2;
  }
}

@media (max-width: 767px) {
  .command-page {
    padding: 12px;
  }

  .el-row {
    @apply flex-col;
  }

  .command-panel {
    margin-bottom: 12px;
    background: transparent;
    border: none;
    border-radius: 0;
    overflow: visible;
  }

  .el-col:last-child .command-panel {
    margin-bottom: 0;
  }
}
</style>
