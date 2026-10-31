export const TASK_LABELS = { chat: "对话", embedding: "向量嵌入", rerank: "文本重排", image: "图像生成", tts: "语音合成", stt: "语音转文字" }
export const MODALITY_LABELS = { text: "文本", image: "图片", audio: "音频", video: "视频", file: "文件" }
export const PROTOCOL_LABELS = { openai_chat: "OpenAI Chat Completions", openai_responses: "OpenAI Responses", anthropic: "Anthropic Messages", gemini: "Gemini" }
export const PROTOCOL_SHORT = { openai_chat: "Chat", openai_responses: "Responses", anthropic: "Anthropic", gemini: "Gemini" }
export const SOURCE_LABELS = { default: "协议默认", hint: "名称推断", catalog: "能力库", discovery: "模型发现", observed: "实测", user: "手动" }
export const STRUCTURED_LABELS = { json_schema: "JSON Schema", json_object: "JSON 模式", none: "仅提示词" }
export const NATIVE_TOOL_LABELS = { web_search: "网页搜索", code_execution: "代码执行", url_context: "网页读取" }
export const CHECK_LABELS = { chat: "基本对话", tools: "工具调用", structured_output: "结构化输出", image: "图片输入", reasoning: "推理", web_search: "网页搜索", url_context: "网页读取" }
export const DEFAULT_CHECK_ITEMS = ["chat", "tools", "structured_output", "image", "reasoning"]
export const PAID_CHECK_ITEMS = ["web_search", "url_context"]
export const REASONING_LEVELS = ["none", "minimal", "low", "medium", "high", "xhigh", "max"]
export const CHECK_STATES = { checked: { label: "已核验", type: "success" }, skipped: { label: "跳过核验", type: "info" }, unchecked: { label: "未核验", type: "warning" } }
const CHECK_RESULT_LABELS = { supported: "支持", unsupported: "不支持", unknown: "未确认", skipped: "跳过", failed: "失败" }
const CHECK_RESULT_TYPES = { supported: "success", unsupported: "info", unknown: "warning", skipped: "info", failed: "danger" }

/**
 * 按接口地址的域名识别厂商官方接口
 * @param {object} presets 厂商预设
 * @param {string} url 接口地址
 * @returns {string|null} 预设名称，中转站为 null
 */
export function presetOfUrl(presets, url) {
  const hostOf = (value) => { try { return new URL(value).host } catch (_) { return "" } }
  const host = hostOf(url)
  if (!host) return null
  return Object.keys(presets || {}).find((name) => Object.values(presets[name].base_urls || {}).some((item) => hostOf(item) === host)) || null
}

export const clone = (value) => JSON.parse(JSON.stringify(value ?? null))
export const uid = () => `${Date.now()}-${Math.random().toString(16).slice(2)}`
export const jsonText = (value) => value && Object.keys(value).length ? JSON.stringify(value, null, 2) : ""

/**
 * 解析 JSON 对象文本，空文本视为空对象
 * @param {string} text JSON 文本
 * @returns {object} 解析结果
 */
export function parseJsonObject(text) {
  if (!String(text || "").trim()) return {}
  const value = JSON.parse(text)
  if (!value || typeof value !== "object" || Array.isArray(value)) throw new Error("需要填写 JSON 对象")
  return value
}

/**
 * 校验 JSON 对象文本
 * @param {string} text JSON 文本
 * @returns {string} 错误信息，无错误时为空
 */
export function jsonError(text) {
  try { parseJsonObject(text); return "" } catch (error) { return error instanceof SyntaxError ? "JSON 格式错误" : error.message }
}

/**
 * 合并后端解析的能力档案与模型配置中手动填写的能力字段
 * @param {object} model 模型配置
 * @returns {object} 能力档案
 */
export function modelProfile(model) {
  return { tasks: ["chat"], ...(model.resolved_profile || {}), ...(model.profile || {}) }
}

/**
 * 模型的主要任务，能对话的模型视为对话模型
 * @param {object} model 模型配置
 * @returns {string} 任务键
 */
export function modelTask(model) {
  const tasks = modelProfile(model).tasks
  return tasks.includes("chat") ? "chat" : tasks[0] || "chat"
}

/**
 * 模型列表中展示的能力标签；手动关闭的能力标记为 off
 * @param {object} model 模型配置
 * @returns {{ label: string, off?: boolean }[]} 标签
 */
export function capabilityTags(model) {
  const profile = modelProfile(model)
  if (!profile.tasks.includes("chat")) return []
  const forced = model.profile || {}
  const tags = []
  if ((profile.input_modalities || []).some((item) => item !== "text")) tags.push({ label: "多模态" })
  if ((profile.reasoning_levels || []).length || (profile.reasoning_param && profile.reasoning_param !== "none")) tags.push({ label: "推理" })
  if (forced.tools === false) tags.push({ label: "工具", off: true })
  else if (profile.tools) tags.push({ label: "工具" })
  if ((forced.native_tools_off || []).includes("web_search")) tags.push({ label: "联网", off: true })
  else if ((profile.native_tools || []).includes("web_search")) tags.push({ label: "联网" })
  return tags
}

const PROVIDER_LOGOS = ["openai", "deepseek", "ark", "glm", "kimi", "mimo", "dashscope", "siliconflow", "minimax", "openrouter", "jina", "gemini", "anthropic"]

/**
 * 厂商预设的 Logo 地址
 * @param {string} preset 厂商预设
 * @returns {string} 图片地址，没有 Logo 时为空
 */
export function providerLogo(preset) { return PROVIDER_LOGOS.includes(preset) ? `${process.env.BASE_URL}provider-logos/${preset}.svg` : "" }

/**
 * 模型的核验状态
 * @param {object} model 模型配置
 * @returns {{ label: string, type: string }} 状态文本与标签类型
 */
export function checkState(model) { return CHECK_STATES[model.check?.status] || CHECK_STATES.unchecked }

export function checkResultText(row) { return row.item === "structured_output" && row.status === "supported" ? STRUCTURED_LABELS[row.value] || row.value : CHECK_RESULT_LABELS[row.status] || row.status }
export function checkResultType(row) { return CHECK_RESULT_TYPES[row.status] || "info" }

/**
 * 把核验结果转换为一行摘要
 * @param {object[]} results 逐项结果
 * @returns {string} 摘要文本
 */
export function checkSummary(results) {
  return (results || []).filter((row) => row.item !== "chat").map((row) => `${CHECK_LABELS[row.item] || row.item} ${checkResultText(row)}`).join("，")
}

/**
 * 精简核验失败原因：去掉模型前缀与请求编号，过长时截断
 * @param {string} detail 原始原因
 * @returns {string} 精简后的原因
 */
export function briefDetail(detail) {
  const text = String(detail || "").replace(/^\[[^\]]+\]\s*/, "").replace(/\s*\(request[_ ]id:[^)]*\)/gi, "").trim()
  const match = text.match(/^HTTP (\d{3}):\s*([\s\S]*)$/)
  const body = match ? `接口返回 ${match[1]}：${match[2]}` : text
  return body.length > 80 ? `${body.slice(0, 80)}…` : body
}

/**
 * 把 Token 数格式化为 K / M
 * @param {number} value Token 数
 * @returns {string} 格式化文本
 */
export function formatTokens(value) {
  if (!value) return "未知"
  const base = value % 1024 === 0 ? 1024 : 1000
  const format = (number) => `${Number(number.toFixed(1))}`
  if (value >= base * base) return `${format(value / base / base)}M`
  if (value >= base) return `${format(value / base)}K`
  return String(value)
}
