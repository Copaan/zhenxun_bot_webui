import axios from "axios"
import { getBaseUrl } from "./api"
import { setAuthToken } from "./auth-token"

export async function localLogin(username, password) {
  const url = new URL(`${getBaseUrl()}/zhenxun/api/login`, window.location.href)
  if (url.origin !== window.location.origin) throw new Error("请在实例自己的管理入口重新登录")
  const response = await axios({ url: url.href, method: "post", data: new URLSearchParams({ username, password }), authFailureMode: "local", suppressErrorToast: true })
  if (!response?.suc || !response.data?.access_token) throw new Error(response?.info || "登录失败")
  setAuthToken(`${response.data.token_type} ${response.data.access_token}`)
}
