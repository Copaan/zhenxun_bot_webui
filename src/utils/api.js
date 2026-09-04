import axios from "axios"
import { Message } from "element-ui"
import {
  handleAuthenticationExpired,
  isLocalAuthRecoveryRequest,
} from "./auth-session"
import { clearAuthToken, getAuthToken, setAuthToken } from "./auth-token"

let lastErrorKey = ""
let lastErrorAt = 0

const showErrorOnce = (message) => {
  const value = String(message || "请求处理失败，请稍后重试。")
  const now = Date.now()
  if (value === lastErrorKey && now - lastErrorAt < 5000) return
  lastErrorKey = value
  lastErrorAt = now
  Message.error({ message: value })
}

// 请求拦截器
axios.interceptors.request.use(
  (config) => {
    const token = getAuthToken()
    if (token) {
      //请求携带自定义token
      config.headers["Authorization"] = token
    }
    return config
  },
  (error) => {
    console.log(error)
  }
)

// 响应拦截器
axios.interceptors.response.use(
  (success) => {
    const { status, data } = success
    // 业务逻辑错误
    if (status == 200) {
      return success.data
    }
    if (success.status && success.status == 200) {
      if ([500, 999, 998].includes(data.status)) {
        return Message.error({ message: data.info })
      }
      // if (data.message) {
      //   Message.success({ message: success.data.message });
      // }
    }
    return success.data
  },
  (error) => {
    const response = error.response
    const suppressToast = Boolean(error.config?.suppressErrorToast)
    if (!response) {
      if (!suppressToast) {
        showErrorOnce("无法连接到真寻服务，请检查服务状态和地址设置。")
      }
      return Promise.reject(error)
    }
    const { status, data } = response
    const detail = Array.isArray(data?.detail)
      ? data.detail[0]?.msg
      : data?.detail && typeof data.detail === "object"
      ? data.detail.issues?.[0]?.message || data.detail.message
      : data?.detail
    if (status === 401) {
      if (!isLocalAuthRecoveryRequest(error.config)) {
        handleAuthenticationExpired(!suppressToast)
      } else if (!suppressToast) {
        showErrorOnce(detail || "当前恢复会话已失效。")
      }
    } else if (suppressToast) {
      return Promise.reject(error)
    } else if (status === 403) {
      showErrorOnce(detail || "当前来源或账户无权执行此操作。")
    } else if (status === 404) {
      showErrorOnce("请求的服务接口不存在，请检查前后端版本。")
    } else if (status === 405) {
      showErrorOnce("服务地址或请求方式不正确。")
    } else if (status === 504) {
      showErrorOnce("服务响应超时，请稍后重试。")
    } else {
      showErrorOnce(detail || "请求处理失败，请稍后重试。")
    }
    return Promise.reject(error)
  }
)

const pageUrl = new URL(window.location.origin)
const formatHostname = (hostname) => {
  const normalized = String(hostname || "localhost").replace(/^\[|\]$/g, "")
  return normalized.includes(":") ? `[${normalized}]` : normalized
}
const pageHostname = formatHostname(pageUrl.hostname)
const pageBaseUrl = `${pageUrl.protocol}//${pageHostname}`
const pagePort =
  pageUrl.port || (pageUrl.protocol === "https:" ? "443" : "80")

let baseApiUrl = pageBaseUrl

export const getBrowserBaseApiUrl = () => pageBaseUrl

export const getBrowserPort = () => pagePort

export const getBaseUrl = () => {
  return getBaseApiUrl() + ":" + getPort()
}

export const setPort = (port) => {
  localStorage.setItem("port", String(port))
}

export const getPort = () => {
  return localStorage.getItem("port") || pagePort
}

export const setBaseApiUrl = (url) => {
  let normalized = String(url || "").trim()
  if (
    normalized[normalized.length - 1] == "/" ||
    normalized[normalized.length - 1] == "\\"
  ) {
    normalized = normalized.slice(0, -1)
  }
  if (normalized != "") {
    const value = normalized.includes("://")
      ? normalized
      : `http://${normalized}`
    const parsed = new URL(value)
    const hostname = formatHostname(parsed.hostname)
    baseApiUrl = `${parsed.protocol}//${hostname}`
    if (parsed.port) {
      setPort(parsed.port)
    }
    setBaseUrlLocalStorage(baseApiUrl)
  } else {
    baseApiUrl = pageBaseUrl
    setBaseUrlLocalStorage(baseApiUrl)
    setPort(pagePort)
  }
}

export const syncApiWithBrowserLocation = () => {
  setBaseApiUrl(getBrowserBaseApiUrl())
  setPort(getBrowserPort())
}

export const getBaseApiUrl = () => {
  return baseApiUrl
}

//传送json格式的post请求
export const postRequest = (url, params, config = {}) => {
  if (!url.startsWith("http")) {
    url = `${getBaseUrl()}${url}`
  }
  return axios({
    ...config,
    method: "post",
    url: url,
    data: params,
  })
}
//传递json的put请求
export const putRequest = (url, params) => {
  if (!url.startsWith("http")) {
    url = `${getBaseUrl()}${url}`
  }
  return axios({
    method: "put",
    url: url,
    data: params,
  })
}
//传递json的get请求
export const getRequest = (url, params, config = {}) => {
  if (params && Object.keys(params).length) {
    url += "?"
    Object.keys(params).forEach((e) => {
      if (params[e] != null) {
        if (Array.isArray(params[e])) {
          params[e].forEach((x) => {
            url += e + "=" + x + "&"
          })
        } else {
          url += e + "=" + params[e] + "&"
        }
      }
    })
    url = url.substring(0, url.length - 1)
  }
  if (!url.startsWith("http")) {
    url = `${getBaseUrl()}${url}`
  }
  return axios({
    ...config,
    method: "get",
    url: url,
    data: params,
  })
}
//传递json的delete请求
export const deleteRequest = (url, params, config = {}) => {
  if (!url.startsWith("http")) {
    url = `${getBaseUrl()}${url}`
  }
  return axios({
    ...config,
    method: "delete",
    url: url,
    data: params,
  })
}

//设置localStorage
export const setBaseUrlLocalStorage = (value) => {
  localStorage.setItem("baseUrl", value)
}
//取出localStorage
export const getBaseUrlLocalStorage = () => {
  const savedUrl = localStorage.getItem("baseUrl")
  const savedPort = localStorage.getItem("port")
  const pageIsLocal = ["localhost", "127.0.0.1", "::1"].includes(
    pageUrl.hostname
  )
  const isLegacyDefault =
    ["http://localhost", "http://127.0.0.1"].includes(savedUrl) &&
    (!savedPort || savedPort === "8080")
  if (isLegacyDefault && !pageIsLocal) {
    localStorage.removeItem("baseUrl")
    localStorage.removeItem("port")
    return null
  }
  return savedUrl
}

//设置cookie方法
export const setCookie = (name, value, days = 7) => {
  if (name === "tokenStr") {
    setAuthToken(value)
    return
  }
  var Days = days
  var exp = new Date()
  exp.setTime(exp.getTime() + Days * 24 * 60 * 60 * 1000)
  const secure = window.location.protocol === "https:" ? ";Secure" : ""
  document.cookie = `${name}=${encodeURIComponent(
    value
  )};expires=${exp.toUTCString()};path=/;SameSite=Strict${secure}`
}

//获取cookie方法
export const getCookie = (name) => {
  if (name === "tokenStr") return getAuthToken()
  var arr,
    reg = new RegExp("(^| )" + name + "=([^;]*)(;|$)")
  if (document.cookie.match(reg)) {
    arr = document.cookie.match(reg)
    return decodeURIComponent(arr[2])
  } else return null
}

export const clearCookie = (name) => {
  if (name === "tokenStr") {
    clearAuthToken()
    return
  }
  setCookie(name, "", -1)
}
