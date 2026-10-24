import { validateField } from "./schema-utils"

const clone = value => value === undefined ? undefined : JSON.parse(JSON.stringify(value))

/**
 * 记录配置组字段的原始值，用于计算未保存修改
 * @param {object[]} groups 接口返回的配置组
 * @returns {object[]} 带 originalValue 的配置组
 */
export function normalizeGroups(groups) {
  return (groups || []).map(group => ({ ...group, fields: (group.fields || []).map(field => ({ ...field, originalValue: JSON.stringify(field.value) })) }))
}

/**
 * 计算配置组中被修改的字段
 * @param {object[]} groups 配置组
 * @returns {object} 按配置组名归类的修改，值为 undefined 表示恢复未设置
 */
export function collectChanges(groups) {
  const changes = {}
  for (const group of groups || []) {
    const changed = (group.fields || []).filter(field => JSON.stringify(field.value) !== field.originalValue)
    if (changed.length) changes[group.module] = Object.fromEntries(changed.map(field => [field.key, field.value]))
  }
  return changes
}

/**
 * 只校验被修改的字段，未改动的历史值不阻止保存
 * @param {object[]} groups 配置组
 * @param {object} changes collectChanges 的结果
 * @returns {object[]} 校验问题，path 为“配置组.配置键”
 */
export function changeIssues(groups, changes) {
  return (groups || []).filter(group => changes[group.module]).flatMap(group => (group.fields || [])
    .filter(field => Object.prototype.hasOwnProperty.call(changes[group.module], field.key))
    .flatMap(field => validateField(field.value, field.schema || {}, field.schema?.["x-root-schema"] || field.schema || {}, field.key)
      .map(issue => ({ ...issue, path: `${group.module}.${issue.path}` }))))
}

/**
 * 保存配置修改到 config.yaml
 * @param {object} vm 发起请求的组件
 * @param {string} revision 读取时的文件版本
 * @param {object} changes collectChanges 的结果
 * @returns {Promise<object>} 接口响应
 */
export async function saveSimpleConfig(vm, revision, changes) {
  const fields = {}
  const unsetFields = []
  Object.entries(changes).forEach(([module, values]) => {
    Object.entries(values).forEach(([key, value]) => {
      if (value === undefined) unsetFields.push([module, key])
      else (fields[module] = fields[module] || {})[key] = clone(value)
    })
  })
  const response = await vm.putRequest(`${vm.$root.prefix}/system/configuration/files/simple`, { expected_revision: revision, fields, unset_fields: unsetFields })
  if (!response.suc) throw new Error(response.info)
  return response
}

/**
 * 保存成功后把提交的值记为原始值
 * @param {object[]} groups 配置组
 * @param {object} changes 已提交的修改
 */
export function markSaved(groups, changes) {
  for (const group of groups || []) {
    const saved = changes[group.module] || {}
    group.fields.forEach(field => {
      if (Object.prototype.hasOwnProperty.call(saved, field.key)) field.originalValue = JSON.stringify(saved[field.key])
    })
  }
}

/**
 * 配置组能否匹配搜索词
 * @param {object} group 配置组
 * @param {string} query 搜索词
 * @returns {boolean} 是否匹配
 */
export function groupMatches(group, query) {
  const keyword = String(query || "").trim().toLowerCase()
  if (!keyword) return true
  const owners = (group.plugins || []).map(item => `${item.name} ${item.module}`).join(" ")
  const fields = (group.fields || []).map(field => `${field.key} ${field.help || ""} ${field.ui?.label || ""}`).join(" ")
  return `${group.name} ${group.module} ${owners} ${fields}`.toLowerCase().includes(keyword)
}
