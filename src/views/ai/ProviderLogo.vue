<template>
  <span class="provider-logo" :style="{ width: size, height: size }" aria-hidden="true">
    <img v-if="src && !failed" :src="src" alt="" @error="failed = true" />
    <b v-else>{{ initial }}</b>
  </span>
</template>

<script>
import { providerLogo } from "@/utils/ai-models"

export default {
  name: "ProviderLogo",
  props: {
    preset: { type: String, default: "" },
    label: { type: String, default: "" },
    size: { type: String, default: "28px" },
  },
  data() { return { failed: false } },
  computed: {
    src() { return providerLogo(this.preset) },
    initial() { return (this.label.trim()[0] || "?").toUpperCase() },
  },
  watch: {
    preset() { this.failed = false },
  },
}
</script>

<style scoped>
.provider-logo { display: inline-grid; flex: none; place-items: center; overflow: hidden; border: 1px solid var(--border-color-light); border-radius: 7px; background: #fff; }
.provider-logo img { width: 68%; height: 68%; }
.provider-logo b { color: #5c6b80; font-size: 13px; }
</style>
