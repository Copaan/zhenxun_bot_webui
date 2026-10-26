import axios from "axios"
import { deleteRequest, getRequest, postRequest, putRequest } from "./api"

const MAX_RETRIES = 3

const wait = (ms) => new Promise((resolve) => setTimeout(resolve, ms))

class UploadRejected extends Error {}

/**
 * 分片上传备份包：每片单独请求以避开反向代理的请求体上限，网络中断时从服务端已接收的位置续传
 * @param {string} base 备份接口前缀，如 `${prefix}/backup`
 * @param {File} file 备份包
 * @param {{ config?: object, onProgress?: (loaded: number, total: number) => void }} options
 * @returns {Promise<string>} 保存后的备份包文件名
 */
export const uploadBackupInChunks = async (base, file, { config = {}, onProgress } = {}) => {
  const quiet = { ...config, timeout: 0, suppressErrorToast: true }
  const started = await postRequest(`${base}/upload`, { name: file.name, size: file.size }, quiet)
  if (!started?.suc) throw new Error(started?.info || "上传失败")
  const { id, chunk_size: chunkSize } = started.data
  const url = `${base}/upload/${id}`
  let offset = 0
  let failures = 0
  try {
    while (offset < file.size) {
      const start = offset
      try {
        const result = await putRequest(`${url}?offset=${start}`, file.slice(start, start + chunkSize), {
          ...quiet,
          headers: { ...config.headers, "Content-Type": "application/octet-stream" },
          onUploadProgress: (event) => onProgress?.(Math.min(file.size, start + (event.loaded || 0)), file.size),
        })
        if (result?.code === 409 && Number.isInteger(result.details?.offset)) {
          offset = result.details.offset
          continue
        }
        if (!result?.suc) throw new UploadRejected(result?.info || "上传失败")
        offset = result.data
        failures = 0
        onProgress?.(offset, file.size)
      } catch (error) {
        if (error instanceof UploadRejected || axios.isCancel(error) || error?.response?.status === 401) throw error
        if (++failures > MAX_RETRIES) throw error
        await wait(1000 * failures)
        const progress = await getRequest(url, null, quiet).catch(() => null)
        if (progress?.suc) offset = progress.data
      }
    }
    const finished = await postRequest(`${url}/finish`, {}, quiet)
    if (!finished?.suc) throw new UploadRejected(finished?.info || "上传失败")
    return finished.data
  } catch (error) {
    if (!axios.isCancel(error)) deleteRequest(url, null, quiet).catch(() => null)
    throw error
  }
}
