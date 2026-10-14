export function getHeaderHeight() {
  return 85
}

export function formatBytes(value) {
  if (value == null || value === "") return "-"
  const units = ["B", "KB", "MB", "GB", "TB", "PB"]
  let size = Number(value)
  let index = 0
  while (size >= 1024 && index < units.length - 1) {
    size /= 1024
    index += 1
  }
  return `${index ? size.toFixed(1) : size} ${units[index]}`
}
