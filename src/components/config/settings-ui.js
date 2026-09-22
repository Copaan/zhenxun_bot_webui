import { resolveReference } from './schema-utils'

export function environmentCategories(descriptors, matches, source, customCount) {
  const groups = [
    { key: 'access', title: '访问与 HTTPS', icon: 'el-icon-lock', description: '管理 WebUI 监听与安全访问入口。', keys: ['HOST', 'PORT', 'WEBUI_HTTPS_ENABLED', 'WEBUI_TLS_CERTFILE', 'WEBUI_TLS_KEYFILE', 'WEBUI_HTTP_MODE', 'WEBUI_HTTP_REDIRECT_PORT'] },
    { key: 'bot', title: '机器人与命令', icon: 'el-icon-chat-dot-round', description: '设置机器人称呼、消息与命令行为。', keys: ['NICKNAME', 'SELF_NICKNAME', 'COMMAND_START', 'COMMAND_SEP', 'ALCONNA_USE_COMMAND_START', 'IMAGE_TO_BYTES'] },
    { key: 'permissions', title: '权限与会话', icon: 'el-icon-user', description: '管理超级用户范围与交互会话。', keys: ['SUPERUSERS', 'PLATFORM_SUPERUSERS', 'SESSION_EXPIRE_TIMEOUT'] },
    { key: 'runtime', title: '日志与扩展', icon: 'el-icon-document', description: '调整日志级别与扩展插件加载路径。', keys: ['LOG_LEVEL', 'EXT_PATH'] },
    { key: 'plugins', title: '插件环境项', icon: 'el-icon-connection', description: '由已注册配置模型声明，详细信息中可查看来源。', keys: [] },
  ]
  const known = new Set(groups.flatMap(group => group.keys))
  return [...groups.map(group => {
    const fields = descriptors.filter(field => group.key === 'plugins' ? !known.has(field.key) : group.keys.includes(field.key))
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
