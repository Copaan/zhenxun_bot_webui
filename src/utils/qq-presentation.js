import { v4 as uuid } from "uuid"

export const newOperationId = () => uuid()
export const clonePresentation = value => JSON.parse(JSON.stringify(value))
export const emptyCard = () => ({ enabled: false, title: "", image_url: "", body: "", quote: "", rows: [] })
export const emptyCards = () => ({ help: emptyCard(), welcome_friend: emptyCard(), welcome_group: emptyCard() })
export const safeHttpsUrl = value => {
  try {
    const url = new URL(value)
    const host = url.hostname.toLowerCase().replace(/\.$/, "")
    if (url.protocol !== "https:" || url.username || url.password || /[\s\\]/.test(value) || !host.includes(".") || /(^|\.)(localhost|local|localdomain)$/.test(host)) return false
    if (/^\d+\.\d+\.\d+\.\d+$/.test(host)) {
      const [a, b, c] = host.split(".").map(Number)
      if (a === 0 || a === 10 || a === 127 || a >= 224 || (a === 100 && b >= 64 && b <= 127) || (a === 169 && b === 254) || (a === 172 && b >= 16 && b <= 31) || (a === 192 && (b === 168 || (b === 0 && [0, 2].includes(c)))) || (a === 198 && (b === 18 || b === 19 || (b === 51 && c === 100))) || (a === 203 && b === 0 && c === 113)) return false
    }
    return true
  } catch (error) { return false }
}
export const textLength = value => Array.from(value || "").reduce((n, c) => n + (c.codePointAt(0) < 128 ? 1 : 2), 0)
const length = textLength
export const fitLabel = (value, limit) => { let result = ""; for (const c of Array.from(value || "")) { if (length(result + c) > limit) break; result += c } return result }
export const commandOptions = plugins => {
  const seen = new Set(), options = []
  for (const plugin of plugins || []) {
    if (!plugin.status || plugin.parked) continue
    for (const command of plugin.commands || []) {
      if (typeof command !== "string" || !command.trim() || seen.has(command)) continue
      seen.add(command); options.push({ value: command, label: command + " · " + plugin.plugin_name, name: plugin.plugin_name, enabled: plugin.default_status !== false, block: plugin.block_type })
    }
  }
  return options
}
export const generateItems = (options, panel, scope = "c2c") => {
  const items = [], used = new Set()
  for (const option of options) {
    if (!option.enabled || used.has(option.name) || option.block === "ALL" || option.block === (["group", "channel"].includes(scope) ? "GROUP" : "PRIVATE")) continue
    if (panel && length(option.value) > 14) continue
    used.add(option.name)
    items.push(panel ? { name: option.value, type: "command", desc: fitLabel(option.name, 30), only_admin: false } : { name: fitLabel(option.name || option.value, 10), type: "send_message", send_message: option.value })
    if (items.length === (panel ? 20 : 10)) break
  }
  return items
}
export const panelName = item => item.panel?.remark || item.remark || (item.panel?.items || []).slice(0, 3).map(value => value.name).filter(Boolean).join("、") || "未命名面板"
export const describeChanges = (before, after, actor = "远端") => {
  const changes = [], fields = { name: "名称／指令", send_message: "指令", link: "链接", type: "类型", desc: "说明", remark: "备注", enabled: "启用状态", title: "标题", body: "正文", image_url: "图片", quote: "引用说明", rows: "按钮", switch: "开关设置", only_admin: "管理员限制", help: "帮助卡片", welcome_friend: "好友欢迎", welcome_group: "入群欢迎" }
  const walk = (old, next, path) => {
    if (JSON.stringify(old) === JSON.stringify(next)) return
    if (Array.isArray(old) && Array.isArray(next)) {
      const identity = item => item?.panel_id || item?.id || item?.switch?.switch_id || item?.send_message || item?.name
      const a = old.map(identity), b = next.map(identity)
      const unique = a.every(Boolean) && b.every(Boolean) && new Set(a).size === a.length && new Set(b).size === b.length
      if (unique && a.length === b.length && a.every(key => b.includes(key)) && a.some((key, i) => b[i] !== key)) changes.push(actor + "调整了" + path + "顺序")
      const paired = new Set()
      next.forEach((item, i) => {
        const found = unique ? a.indexOf(b[i]) : i < old.length ? i : -1
        const label = item?.name || item?.panel?.remark || "第 " + (i + 1) + " 项"
        if (found < 0) changes.push(actor + "新增了" + path + "『" + label + "』")
        else { paired.add(found); walk(old[found], item, path + "『" + label + "』") }
      })
      old.forEach((item, i) => { if (!paired.has(i)) changes.push(actor + "删除了" + path + "『" + (item?.name || item?.panel?.remark || "第 " + (i + 1) + " 项") + "』") })
    } else if (old && next && typeof old === "object" && typeof next === "object") {
      for (const key of new Set([...Object.keys(old), ...Object.keys(next)])) {
        if (key === "version") continue
        if (["items", "sub_menu_items", "panels"].includes(key)) walk(old[key] || [], next[key] || [], path + (key === "panels" ? "面板" : "菜单项"))
        else if (JSON.stringify(old[key]) !== JSON.stringify(next[key])) changes.push(actor + "修改了" + path + (fields[key] || "扩展设置"))
      }
    } else changes.push(actor + "修改了" + (path || "配置"))
  }
  walk(before, after, "")
  return [...new Set(changes)]
}
const required = (value, limit, label) => { if (typeof value !== "string" || !value.trim() || length(value) > limit) throw new Error(label + "为空或超过字符限制（中文计 2）。") }
const link = value => { if (!safeHttpsUrl(value)) throw new Error("请填写有效的公网 HTTPS 地址。") }

export const validatePresentation = (type, value) => {
  if (type === "cards") {
    for (const [kind, card] of Object.entries(value)) {
     const cardName = { help: "帮助卡片", welcome_friend: "好友欢迎", welcome_group: "入群欢迎" }[kind] || "卡片"
     try {
      for (const [field, limit] of [["title", 200], ["body", 8000], ["quote", 2000]]) {
        if (length(card[field]) > limit) throw new Error("的" + ({ title: "标题", body: "正文", quote: "引用说明" }[field]) + "超过 " + limit + " 个字符（中文计 2）。")
      }
      if (card.enabled && !card.title.trim() && !card.body.trim()) throw new Error("启用的卡片需要标题或正文。")
      if (card.image_url) link(card.image_url)
      if (card.rows.length > 5) throw new Error("卡片最多 5 行按钮。")
      for (const row of card.rows) {
        if (row.buttons.length > 5) throw new Error("每行最多 5 个按钮。")
        for (const button of row.buttons) {
          required(button.label, 10, "按钮文字")
          if (button.type === "link") link(button.data)
          else required(button.data, 2000, "按钮指令")
          if (kind === "welcome_group" && button.enter) throw new Error("群聊不能直接发送按钮指令。")
        }
      }
     } catch (error) { throw new Error(cardName + (error.message.startsWith("的") ? "" : "：") + error.message) }
    }
    return
  }
  const check = (items, child = false) => {
    const limit = type === "panel" ? 20 : child ? 5 : 10
    if (items.length > limit) throw new Error("项目数量超过上限 " + limit)
    for (const item of items) {
      required(item.name, type === "panel" || child ? 14 : 10, "项目名称")
      if (item.type === "link") link(item.link)
      else if (item.type === "send_message") required(item.send_message, 2000, "指令")
      else if (item.type === "menu") { if (child) throw new Error("子菜单不能继续嵌套。"); check(item.sub_menu_items || [], true) }
      else if (item.type === "switch") required(item.switch?.switch_id, 100, "开关标识")
      else if (item.type !== "command" || type !== "panel") throw new Error("存在暂不支持的项目类型，请保留配置。")
      if (type === "panel" && length(item.desc) > 30) throw new Error("面板说明最多 30 个字符。")
    }
  }
  check(value.items || [])
}
