export const TLS_ACCEPT = ".pem,.crt,.cer,.key"

/**
 * 上传 HTTPS 证书或私钥到 Bot 的 data/web_ui/tls 目录
 * @param {object} vm 发起请求的组件
 * @param {"cert"|"key"} kind 证书或私钥
 * @param {File} file 选择的文件
 * @returns {Promise<string>} 文件在 Bot 上的绝对路径
 */
export const uploadTlsFile = async (vm, kind, file) => {
  const data = new FormData()
  data.append("kind", kind)
  data.append("file", file)
  const response = await vm.postRequest(`${vm.$root.prefix}/system/tls/upload`, data)
  if (!response || !response.suc) throw new Error((response && response.info) || "证书上传失败")
  return response.data.path
}
