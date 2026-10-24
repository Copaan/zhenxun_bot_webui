<template>
  <div class="provider-starter">
    <div class="starter-heading">
      <div><h2>{{ first ? "接入第一个 AI 服务商" : "添加服务商" }}</h2><p>选择厂商后自动填写接口协议与地址，只需再填入 API Key。</p></div>
      <el-button v-if="!first" icon="el-icon-close" size="small" @click="$emit('cancel')">取消</el-button>
    </div>
    <ol class="starter-steps">
      <li><b>1</b><span>选择厂商并填写 API Key</span></li>
      <li><b>2</b><span>发现并添加模型</span></li>
      <li><b>3</b><span>保存并核验，自动设置默认模型</span></li>
    </ol>
    <div class="starter-grid">
      <button v-for="(preset, key) in presets" :key="key" type="button" class="starter-card" @click="$emit('pick', key)">
        <ProviderLogo :preset="key" :label="preset.label" size="32px" />
        <span><strong>{{ preset.label }}</strong><small>{{ protocolShort[preset.protocol] || preset.protocol }} · {{ host(preset.base_urls[preset.protocol]) }}</small></span>
      </button>
      <button type="button" class="starter-card starter-custom" @click="$emit('pick', null)">
        <span class="starter-plus"><i class="el-icon-plus"></i></span>
        <span><strong>自定义 / 中转站</strong><small>手动填写协议与接口地址</small></span>
      </button>
    </div>
  </div>
</template>

<script>
import { PROTOCOL_SHORT } from "@/utils/ai-models"
import ProviderLogo from "./ProviderLogo.vue"

export default {
  name: "ProviderStarter",
  components: { ProviderLogo },
  props: {
    presets: { type: Object, default: () => ({}) },
    first: Boolean,
  },
  data() { return { protocolShort: PROTOCOL_SHORT } },
  methods: {
    host(url) { try { return new URL(url).host } catch (_) { return url || "" } },
  },
}
</script>

<style scoped>
.provider-starter { padding: 22px; }
.starter-heading { display: flex; align-items: flex-start; justify-content: space-between; gap: 16px; }
.starter-heading h2 { margin: 0; font-size: 18px; }
.starter-heading p { margin: 6px 0 0; color: var(--text-color-secondary); font-size: 13px; }
.starter-steps { display: flex; flex-wrap: wrap; gap: 8px 22px; margin: 18px 0; padding: 0; list-style: none; color: var(--text-color-secondary); font-size: 13px; }
.starter-steps li { display: flex; align-items: center; gap: 8px; }
.starter-steps b { display: inline-grid; width: 20px; height: 20px; place-items: center; border-radius: 50%; color: #fff; background: var(--primary-color); font-size: 12px; }
.starter-grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(190px, 1fr)); gap: 10px; }
.starter-card { display: flex; min-width: 0; align-items: center; gap: 12px; padding: 12px 14px; border: 1px solid var(--border-color); border-radius: 8px; color: var(--text-color); background: transparent; text-align: left; cursor: pointer; transition: border-color 0.15s, background 0.15s; }
.starter-card:hover, .starter-card:focus-visible { border-color: var(--primary-color); background: var(--bg-color-hover); outline: none; }
.starter-card > span:last-child { display: flex; min-width: 0; flex-direction: column; gap: 4px; }
.starter-card strong { font-size: 14px; }
.starter-plus { display: inline-grid; width: 32px; height: 32px; flex: none; place-items: center; border: 1px dashed var(--border-color); border-radius: 7px; color: var(--text-color-secondary); }
.starter-card small { overflow: hidden; color: var(--text-color-secondary); font-size: 12px; text-overflow: ellipsis; white-space: nowrap; }
.starter-custom { border-style: dashed; }
@media (max-width: 460px) { .provider-starter { padding: 16px; } .starter-grid { grid-template-columns: 1fr 1fr; } }
</style>
