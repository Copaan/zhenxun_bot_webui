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
const length = value => Array.from(value || "").reduce((n, c) => n + (c.codePointAt(0) < 128 ? 1 : 2), 0)
const required = (value, limit, label) => { if (typeof value !== "string" || !value.trim() || length(value) > limit) throw new Error(label + "为空或超过字符限制（中文计 2）。") }
const link = value => { if (!safeHttpsUrl(value)) throw new Error("请填写有效的公网 HTTPS 地址。") }

export const validatePresentation = (type, value) => {
  if (type === "cards") {
    for (const [kind, card] of Object.entries(value)) {
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
