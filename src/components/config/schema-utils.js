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
  return true
}

export function emptyValue(schema = {}) {
  if (Object.prototype.hasOwnProperty.call(schema, "default")) return JSON.parse(JSON.stringify(schema.default))
  if (schema.enum?.length) return schema.enum[0]
  if (schema.type === "null") return null
  return { object: {}, array: [], boolean: false, integer: 0, number: 0 }[schema.type] ?? ""
}
