export function valueType(value) {
  if (value === null) return "null"
  if (Array.isArray(value)) return "array"
  if (typeof value === "number") return Number.isInteger(value) ? "integer" : "number"
  return typeof value === "undefined" ? "string" : typeof value
}

export function resolveReference(schema = {}, root = schema, seen = new Set()) {
  if (!schema || typeof schema !== "object") return {}
  if (schema["x-root-schema"]) root = schema["x-root-schema"]
  if (schema.$ref) {
    if (seen.has(schema.$ref)) return { ...schema, "x-recursive": true }
    seen.add(schema.$ref)
    const value = schema.$ref.replace(/^#\//, "").split("/")
      .reduce((node, key) => node?.[key.replace(/~1/g, "/").replace(/~0/g, "~")], root)
    if (value) {
      const { $ref, ...siblings } = schema
      return resolveReference({ ...value, ...siblings }, root, seen)
    }
  }
  if (Array.isArray(schema.allOf)) {
    const { allOf, ...base } = schema
    return allOf.reduce((result, item) => {
      const next = resolveReference(item, root, new Set(seen))
      return { ...result, ...next, properties: { ...result.properties, ...next.properties }, required: [...new Set([...(result.required || []), ...(next.required || [])])] }
    }, base)
  }
  return schema
}

export function matchesSchema(value, schema, root) {
  const resolved = resolveReference(schema, root)
  if (resolved.anyOf && !resolved.anyOf.some(item => matchesSchema(value, item, root))) return false
  if (resolved.oneOf && resolved.oneOf.filter(item => matchesSchema(value, item, root)).length !== 1) return false
  if (Object.prototype.hasOwnProperty.call(resolved, "const") && value !== resolved.const) return false
  if (resolved.enum && !resolved.enum.includes(value)) return false
  const type = valueType(value)
  if (resolved.type && !(Array.isArray(resolved.type) ? resolved.type : [resolved.type]).some(item => item === type || item === "number" && type === "integer")) return false
  if (resolved.required && (!value || resolved.required.some(key => !Object.prototype.hasOwnProperty.call(value, key)))) return false
  if (value && type === "object" && Object.entries(resolved.properties || {}).some(([key, child]) => Object.prototype.hasOwnProperty.call(value, key) && !matchesSchema(value[key], child, root))) return false
  if (Array.isArray(value) && value.some((item, index) => !matchesSchema(item, resolved.prefixItems?.[index] || (Array.isArray(resolved.items) ? resolved.items[index] : resolved.items) || {}, root))) return false
  if (value && type === "object" && Object.entries(value).some(([key, item]) => !Object.prototype.hasOwnProperty.call(resolved.properties || {}, key) && (resolved.additionalProperties === false || typeof resolved.additionalProperties === "object" && !matchesSchema(item, resolved.additionalProperties, root)))) return false
  if (typeof value === "number" && (resolved.minimum !== undefined && value < resolved.minimum || resolved.maximum !== undefined && value > resolved.maximum)) return false
  return true
}

export function emptyValue(schema = {}) {
  if (Object.prototype.hasOwnProperty.call(schema, "default")) return JSON.parse(JSON.stringify(schema.default))
  if (schema.enum?.length) return schema.enum[0]
  if (schema.type === "null") return null
  return { object: {}, array: [], boolean: false, integer: 0, number: 0 }[schema.type] ?? ""
}

export function valueSummary(value) {
  if (value === undefined) return "未设置"
  if (value === null) return "null"
  if (Array.isArray(value)) return `${value.length} 项 · ${JSON.stringify(value).slice(0, 100)}`
  if (typeof value === "object") return `${Object.keys(value).length} 个字段 · ${Object.keys(value).slice(0, 4).join("、")}`
  return String(value).slice(0, 100) || "空字符串"
}

export function fieldMatches(query, path, schema = {}, value, root = schema, depth = 0, seen = new Set()) {
  const needle = query.trim().toLowerCase()
  if (!needle) return true
  const resolved = resolveReference(schema, root)
  if (`${path} ${resolved.title || ""} ${resolved.description || ""}`.toLowerCase().includes(needle)) return true
  if (depth >= 16) return false
  if (schema.$ref && seen.has(schema.$ref) && value === undefined) return false
  const nextSeen = new Set(seen)
  if (schema.$ref) nextSeen.add(schema.$ref)
  const properties = resolved.properties || {}
  const keys = new Set([...Object.keys(properties), ...(value && typeof value === "object" ? Object.keys(value) : [])])
  return [...keys].some(key => fieldMatches(query, `${path}.${key}`, properties[key] || resolved.items || resolved.additionalProperties || {}, value?.[key], root, depth + 1, nextSeen)) ||
    (resolved.anyOf || resolved.oneOf || []).some(branch => fieldMatches(query, path, branch, value, root, depth + 1, nextSeen))
}

export function validateField(value, schema = {}, root = schema, path = "", required = false, depth = 0) {
  if (value === undefined) return required ? [{ path, message: "必填字段未设置" }] : []
  if (depth > 32) return [{ path, message: "结构过深，请通过原文校验" }]
  const resolved = resolveReference(schema, root)
  const branches = resolved.oneOf || resolved.anyOf
  if (branches) {
    const results = branches.map(branch => validateField(value, branch, root, path, required, depth + 1))
    const matches = results.filter(issues => !issues.length)
    if (!matches.length || resolved.oneOf && matches.length !== 1) return [{ path, message: "值不符合联合类型，请检查类型及内容" }]
    return []
  }
  if (!matchesSchema(value, { ...resolved, properties: undefined, required: undefined, items: undefined, prefixItems: undefined, additionalProperties: undefined }, root)) return [{ path, message: "值不符合字段类型" }]
  if (typeof value === "number" && (!Number.isFinite(value) || resolved.minimum !== undefined && value < resolved.minimum || resolved.maximum !== undefined && value > resolved.maximum)) return [{ path, message: "数值超出允许范围" }]
  if (typeof value === "string") {
    if (resolved.minLength !== undefined && value.length < resolved.minLength || resolved.maxLength !== undefined && value.length > resolved.maxLength) return [{ path, message: "文本长度不符合要求" }]
    if (resolved.pattern) { try { if (!new RegExp(resolved.pattern).test(value)) return [{ path, message: "文本格式不符合要求" }] } catch (_) { /* Backend validates non-JavaScript patterns. */ } }
  }
  if (Array.isArray(value)) {
    if (resolved.minItems !== undefined && value.length < resolved.minItems || resolved.maxItems !== undefined && value.length > resolved.maxItems) return [{ path, message: "条目数不符合要求" }]
    return value.flatMap((item, index) => validateField(item, resolved.prefixItems?.[index] || (Array.isArray(resolved.items) ? resolved.items[index] : resolved.items) || {}, root, `${path}.${index}`, true, depth + 1))
  }
  if (value && typeof value === "object") {
    const properties = resolved.properties || {}
    return [...new Set([...Object.keys(properties), ...Object.keys(value)])].flatMap(key => {
      if (!properties[key] && resolved.additionalProperties === false) return [{ path: `${path}.${key}`, message: "不允许新增此字段" }]
      return validateField(value[key], properties[key] || resolved.additionalProperties || {}, root, path ? `${path}.${key}` : key, (resolved.required || []).includes(key), depth + 1)
    })
  }
  return []
}
