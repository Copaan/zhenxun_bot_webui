import { resolveReference } from './schema-utils'

export function environmentCategories(descriptors, matches, source, customCount) {
  const groups = [
    { key: 'access', title: '访问与 HTTPS', icon: 'el-icon-lock', description: '管理 WebUI 监听与安全访问入口。', keys: ['HOST', 'PORT', 'WEBUI_HTTPS_ENABLED', 'WEBUI_TLS_CERTFILE', 'WEBUI_TLS_KEYFILE', 'WEBUI_HTTP_MODE', 'WEBUI_HTTP_REDIRECT_PORT'] },
    { key: 'bot', title: '机器人与命令', icon: 'el-icon-chat-dot-round', description: '设置机器人称呼、消息与命令行为。', keys: ['NICKNAME', 'SELF_NICKNAME', 'COMMAND_START', 'COMMAND_SEP', 'ALCONNA_USE_COMMAND_START', 'IMAGE_TO_BYTES'] },
    { key: 'permissions', title: '权限与会话', icon: 'el-icon-user', description: '管理超级用户范围与交互会话。', keys: ['SUPERUSERS', 'PLATFORM_SUPERUSERS', 'SESSION_EXPIRE_TIMEOUT'] },
    { key: 'runtime', title: '日志与扩展', icon: 'el-icon-document', description: '调整日志级别与扩展插件路径。', keys: ['LOG_LEVEL', 'EXT_PATH'] },
    { key: 'storage', title: '数据库与缓存', icon: 'el-icon-coin', description: '此处仅供查看，修改请前往「数据与缓存」页面，保存前会先测试连接。', keys: ['DB_URL', 'CACHE_MODE', 'REDIS_HOST', 'REDIS_PASSWORD', 'REDIS_PORT'] },
    { key: 'adapters', title: '适配器配置', icon: 'el-icon-link', description: '按协议维护机器人连接配置。', keys: [] },
    { key: 'plugins', title: '插件环境项', icon: 'el-icon-connection', description: '由已注册配置模型声明，详细信息中可查看来源。', keys: [] },
  ]
  const known = new Set(groups.flatMap(group => group.keys))
  return [...groups.map(group => {
    const fields = descriptors.filter(field => group.keys.includes(field.key) || (!known.has(field.key) && (field.category || 'plugins') === group.key))
    if (group.key === 'plugins') fields.sort((a, b) => source(a).localeCompare(source(b)))
    return { ...group, fields, count: fields.filter(matches).length }
  }), { key: 'custom', title: '自定义变量', icon: 'el-icon-edit-outline', count: customCount }]
}

const advancedLabels = {
  'client_settings.timeout': { label: '请求超时', unit: '秒', description: '单次 API 请求的超时上限。' },
  'client_settings.max_retries': { label: '最大重试次数', unit: '次', description: '控制请求失败后的重试上限，实际重试仍遵循安全发送策略。' },
  'client_settings.retry_delay': { label: '重试延迟', unit: '秒', description: '连续重试之间的基础等待时间。' },
  'client_settings.structured_retries': { label: '结构化校验重试', unit: '次', description: '模型输出未通过结构化校验时的重试上限。' },
  'debug_log.show_tools': { label: '记录工具定义', description: '在调试日志中展示工具定义的 JSON Schema。' },
  'debug_log.show_schema': { label: '记录响应 Schema', description: '在调试日志中展示结构化输出格式。' },
  'debug_log.show_safety': { label: '记录安全设置', description: '在调试日志中展示发送给厂商的安全设置。' },
  'provider_settings.gemini.safety_threshold': { label: '安全过滤阈值', description: 'Gemini 的内容安全过滤级别，是否允许取决于厂商策略。', options: [ { value: 'BLOCK_NONE', label: '不额外过滤 · BLOCK_NONE' }, { value: 'BLOCK_ONLY_HIGH', label: '仅高风险 · BLOCK_ONLY_HIGH' }, { value: 'BLOCK_MEDIUM_AND_ABOVE', label: '中高风险 · BLOCK_MEDIUM_AND_ABOVE' }, { value: 'BLOCK_LOW_AND_ABOVE', label: '低风险及以上 · BLOCK_LOW_AND_ABOVE' } ] },
  'provider_settings.gemini.allow_mixed_tools': { label: '允许混合工具', description: '允许同时使用本地工具与 Gemini 云端内置工具。' },
}

export function valueAt(value, path) { return (Array.isArray(path) ? path : path.split('.')).reduce((current, key) => current?.[key], value) }

export function updateAt(value, path, nextValue) {
  const result = JSON.parse(JSON.stringify(value || {}))
  const parts = Array.isArray(path) ? path : path.split('.')
  let node = result
  for (const key of parts.slice(0, -1)) {
    if (!Object.prototype.hasOwnProperty.call(node, key) || !node[key] || typeof node[key] !== 'object') {
      if (nextValue === undefined) return result
      Object.defineProperty(node, key, { value: {}, enumerable: true, writable: true, configurable: true })
    }
    node = node[key]
  }
  const key = parts[parts.length - 1]
  if (nextValue === undefined) delete node[key]
  else Object.defineProperty(node, key, { value: nextValue, enumerable: true, writable: true, configurable: true })
  return result
}

const thresholdHint = '不大于 1 时按上下文窗口的比例计算，大于 1 时按 Token 数计算。'
const aiSectionSettings = {
  context: [
    { key: 'llm_summary', title: '对话总结', icon: 'el-icon-chat-line-square', description: '对话较长时由模型总结较早的历史，压缩发送给模型的上下文。', fields: {
      'llm_summary.enable': { label: '启用对话总结', description: '达到触发条件后，用一段总结替换较早的对话历史。' },
      'llm_summary.trigger_threshold': { label: '触发阈值', description: thresholdHint },
      'llm_summary.max_history_turns': { label: '触发轮数', unit: '轮', description: '历史对话超过该轮数时也会触发总结；0 表示只按阈值触发。' },
      'llm_summary.keep_recent_turns': { label: '保留最近对话', unit: '轮', description: '总结时原样保留的最近对话轮数。' },
      'llm_summary.summarization_model': { label: '总结模型', description: '执行总结的模型，未选择时使用默认对话模型。', modelTask: 'chat' },
      'llm_summary.summarization_prompt': { label: '总结提示词', description: '指导模型如何总结对话的系统提示词。', component: 'textarea' },
    } },
    { key: 'tool_pruning', title: '工具结果修剪', icon: 'el-icon-scissors', description: '工具输出累积过长时，修剪较早的工具结果。', fields: {
      'tool_pruning.enable': { label: '启用工具结果修剪', description: '达到触发条件后，把较早的长工具结果替换为简短占位。' },
      'tool_pruning.trigger_threshold': { label: '触发阈值', description: thresholdHint },
      'tool_pruning.max_history_turns': { label: '触发轮数', unit: '轮', description: '工具消息超过该轮数时也会触发修剪；0 表示只按阈值触发。' },
      'tool_pruning.keep_recent_turns': { label: '保留最近工具结果', unit: '轮', description: '修剪时原样保留的最近工具消息轮数。' },
    } },
    { key: 'vision', title: '多模态窗口', icon: 'el-icon-picture-outline', description: '控制图片等多模态原始数据在上下文中保留的范围。', fields: {
      vision_window_size: { label: '多模态窗口', unit: '轮', description: '只保留最近若干轮消息中的多模态原始数据，更早的替换为占位符；0 表示不限制。' },
    } },
  ],
  agent: [
    { key: 'loop', title: '循环与重试', icon: 'el-icon-refresh', description: '限制工具调用循环次数，防止任务失控。', fields: {
      max_cycles: { label: '单次最大循环', unit: '次', description: '单次请求中模型调用工具的最大循环次数。' },
      global_max_cycles: { label: '全局最大循环', unit: '次', description: '整个会话（含嵌套智能体）的模型循环总上限。' },
      reflexion_retries: { label: '反思重试', unit: '次', description: '工具调用出错后让模型反思并重试的次数。' },
      enable_fallback_summary: { label: '兜底总结', description: '达到循环上限时让模型总结已有结果，而不是直接报错。' },
    } },
    { key: 'tools', title: '工具与协作', icon: 'el-icon-connection', description: '设置工具调用方式与外部服务的驻留时间。', fields: {
      enable_parallel_calls: { label: '并行工具调用', description: '允许模型在一轮中同时调用多个工具。' },
      enable_hitl: { label: '允许向用户求助', description: '允许智能体挂起任务并向用户提问后继续。' },
      mcp_cleanup_timeout: { label: 'MCP 闲置回收', unit: '秒', description: 'MCP 服务闲置超过该时间后自动关闭；0 表示常驻不回收。' },
    } },
  ],
  sandbox: [
    { key: 'runtime', title: '沙箱运行环境', icon: 'el-icon-box', restart: true, description: '沙箱开关和驱动需要重启后生效，镜像与清理参数影响新会话。', fields: {
      enable_sandbox: { label: '启用沙箱', restart: true, description: '关闭时不加载 Docker 等沙箱驱动，启动更快。' },
      sandbox_type: { label: '沙箱驱动', restart: true, requires: 'enable_sandbox', description: '沙箱使用的底层驱动。', options: [{ value: 'docker', label: 'Docker' }] },
      docker_image: { label: 'Docker 镜像', requires: 'enable_sandbox', description: '新建沙箱会话时使用的镜像。' },
      cleanup_timeout: { label: '闲置清理', unit: '秒', requires: 'enable_sandbox', description: '沙箱闲置超过该时间后自动清理；0 表示不自动清理。' },
      enable_vfs_helper: { label: 'VFS 路径防护', requires: 'enable_sandbox', description: '阻止沙箱内的路径逃逸，遇到兼容性问题时可关闭。' },
    } },
  ],
}

/**
 * 生成 AI 配置分区的设置分组，嵌套字段展开为带中文说明的独立设置项
 * @param {string} section 分区名称（context / agent / sandbox）
 * @param {object} sectionSchema 分区的 JSON Schema
 * @param {object} rootSchema 根 Schema，用于解析引用
 * @param {object} draft 分区草稿
 * @returns {object[]} 设置分组，未声明的顶层字段归入最后一组的“其他参数”
 */
export function aiSectionGroups(section, sectionSchema, rootSchema, draft) {
  const groups = aiSectionSettings[section] || []
  const known = new Set(groups.flatMap(group => Object.keys(group.fields).map(path => path.split('.')[0])))
  const schemaAt = segments => segments.reduce((node, key) => resolveReference(node, rootSchema).properties?.[key] || {}, sectionSchema)
  function row(path, meta = {}, sectionLabel = '') {
    const segments = path.split('.')
    const fieldSchema = schemaAt(segments)
    const resolved = resolveReference(fieldSchema, rootSchema)
    return { path, segments, schema: fieldSchema, section: sectionLabel, label: meta.label || resolved.title || path, ui: { description: resolved.description || '', ...meta } }
  }
  const unknown = Object.keys(draft || {}).filter(key => !known.has(key))
  return groups.map((group, index) => ({ ...group, fields: [
    ...Object.entries(group.fields).map(([path, meta]) => row(path, meta)),
    ...(index === groups.length - 1 ? unknown.map(key => row(key, {}, '其他参数')) : []),
  ] }))
}

export function advancedSettingGroups(schema, draft) {
  const groups = [
    { key: 'client_settings', title: '请求与重试', icon: 'el-icon-timer', description: '平衡请求等待与恢复次数，适用于本体托管的 AI 客户端。' },
    { key: 'provider_settings', title: '厂商参数', icon: 'el-icon-connection', description: '按厂商设置特有行为，未知参数会原样保留。' },
    { key: 'debug_log', title: '调试日志', icon: 'el-icon-document', description: '只控制调试日志展示的内容，不改变模型回答。' },
  ]
  function row(segments, fieldSchema, section = '') {
    const path = segments.join('.')
    const meta = advancedLabels[path] || {}
    const resolved = resolveReference(fieldSchema, schema)
    return { path, segments, schema: fieldSchema, section, label: meta.label || resolved.title || path.split('.').pop(), ui: { description: resolved.description || '', ...meta } }
  }
  function fields(segments, fieldSchema, flattenProvider = false) {
    const resolved = resolveReference(fieldSchema, schema)
    if (!resolved.properties) return [row(segments, fieldSchema)]
    const value = valueAt(draft, segments)
    // Keep explicit null and unexpected scalar values editable without coercion.
    if (value !== undefined && (value === null || typeof value !== 'object' || Array.isArray(value))) return [row(segments, fieldSchema)]
    return [...new Set([...Object.keys(resolved.properties), ...Object.keys(value || {})])].flatMap(key => {
      const childSchema = resolved.properties[key] || (typeof resolved.additionalProperties === 'object' ? resolved.additionalProperties : {})
      const childPath = [...segments, key]
      return flattenProvider ? fields(childPath, childSchema).map(field => ({ ...field, section: key === 'gemini' ? 'Gemini' : key })) : [row(childPath, childSchema)]
    })
  }
  return groups.map(group => ({ ...group, fields: [
    ...fields([group.key], schema.properties?.[group.key] || {}, group.key === 'provider_settings'),
    ...(group.key === 'provider_settings' ? Object.keys(draft || {}).filter(key => !groups.some(item => item.key === key)).map(key => row([key], schema.properties?.[key] || {}, '其他参数')) : []),
  ] }))
}
