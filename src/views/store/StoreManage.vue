<template>
  <div class="store-page">
    <div class="source-switch">
      <el-radio-group v-model="source" size="small" aria-label="插件来源">
        <el-radio-button label="zhenxun">真寻插件</el-radio-button>
        <el-radio-button label="nonebot">NoneBot 插件</el-radio-button>
      </el-radio-group>
    </div>
    <StoreTemplate v-if="source === 'zhenxun'" />
    <NoneBotStore v-else :initial-search="$route.query.search || ''" />
  </div>
</template>

<script>
import StoreTemplate from "@/components/store/StoreTemplate.vue"
import NoneBotStore from "@/components/store/NoneBotStore.vue"

export default {
  name: "StoreManage",
  components: { NoneBotStore, StoreTemplate },
  data() {
    return { source: this.$route.query.source === "nonebot" ? "nonebot" : "zhenxun" }
  },
  watch: {
    source(value) {
      const query = { ...this.$route.query, source: value }
      if (value !== "nonebot") delete query.search
      const navigation = this.$router.replace({ path: "/store", query })
      if (navigation && typeof navigation.catch === "function") {
        navigation.catch(() => {})
      }
    },
  },
}
</script>

<style scoped>
.store-page {
  min-height: 100%;
  background: var(--bg-color);
}
.source-switch {
  display: flex;
  justify-content: center;
  padding: 18px 22px 0;
}
</style>
