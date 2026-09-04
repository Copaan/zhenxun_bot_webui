import Vue from "vue"
import VueRouter from "vue-router"
import { clearAuthToken, hasValidAuthToken } from "@/utils/auth-token"
import { MessageBox } from "element-ui"
import Login from "@/views/Login"
import Home from "@/views/Home"
import { clearAllDirtyStates, hasDirtyState } from "@/utils/dirty-state"

const MyApi = () => import(/* webpackChunkName: "address" */ "@/views/MyApi")
const PluginManage = () =>
  import(/* webpackChunkName: "plugins" */ "@/views/plugin/PluginManage")
const StoreManage = () =>
  import(/* webpackChunkName: "store" */ "@/views/store/StoreManage")
const MainCommand = () =>
  import(/* webpackChunkName: "command" */ "@/views/command/MainCommand")
const FriendGroupManage = () =>
  import(/* webpackChunkName: "manage" */ "@/views/manage/FriendGroupManage")
const DatabaseManage = () =>
  import(/* webpackChunkName: "database" */ "@/views/database/DatabaseManage")
const MainDashboard = () =>
  import(/* webpackChunkName: "dashboard" */ "@/views/dashboard/MainDashboard")
const SystemInfo = () =>
  import(/* webpackChunkName: "system" */ "@/views/system/SystemInfo")
const Configure = () =>
  import(/* webpackChunkName: "configure" */ "@/views/configure/Configure")
const About = () =>
  import(/* webpackChunkName: "about" */ "@/views/about/About")
const ProtocolSetting = () =>
  import(/* webpackChunkName: "protocol" */ "@/views/protocol/ProtocolSetting")
const AIConfiguration = () =>
  import(/* webpackChunkName: "ai-configuration" */ "@/views/ai/AIConfiguration")
const ConsoleConnect = () =>
  import(/* webpackChunkName: "connect" */ "@/views/ConsoleConnect")

Vue.use(VueRouter)

const routes = [
  {
    path: "/",
    name: "Login",
    component: Login,
  },
  {
    path: "/myapi",
    name: "MyApi",
    component: MyApi,
  },
  {
    path: "/configure",
    name: "Configure",
    component: Configure,
  },
  {
    path: "/connect",
    name: "ConsoleConnect",
    component: ConsoleConnect,
  },
  {
    path: "/home",
    name: "Home",
    component: Home,
    redirect: "/dashboard",
    children: [
      { path: "/dashboard", name: "仪表盘", component: MainDashboard },
      {
        path: "/command",
        name: "BOT控制台",
        component: MainCommand,
        meta: { requiresBot: true, requiredCapability: "bot_manage" },
      },
      { path: "/plugin", name: "插件列表", component: PluginManage },
      { path: "/store", name: "插件商店", component: StoreManage },
      {
        path: "/manage",
        name: "好友/群组",
        component: FriendGroupManage,
        meta: { requiresBot: true, requiredCapability: "friend_list" },
      },
      { path: "/database", name: "数据库管理", component: DatabaseManage },
      { path: "/protocol", name: "机器人接入", component: ProtocolSetting },
      { path: "/ai", name: "AI 配置", component: AIConfiguration },
      { path: "/system", name: "系统信息", component: SystemInfo },
      { path: "/about", name: "关于我们", component: About },
    ],
  },
]

const router = new VueRouter({
  routes,
  scrollBehavior(to, from, savedPosition) {
    if (savedPosition) {
      return savedPosition
    } else {
      return { x: 0, y: 0 }
    }
  },
})

const CHUNK_RELOAD_KEY = "zhenxunChunkReloadTarget"

function isChunkLoadError(error) {
  const message = String((error && error.message) || error || "")
  return (
    error?.name === "ChunkLoadError" ||
    error?.code === "CSS_CHUNK_LOAD_FAILED" ||
    /Loading (CSS )?chunk \d+ failed/i.test(message)
  )
}

router.onError((error) => {
  if (!isChunkLoadError(error)) {
    console.error(error)
    return
  }

  const target = `${window.location.pathname}${window.location.search}${window.location.hash}`
  if (window.sessionStorage.getItem(CHUNK_RELOAD_KEY) !== target) {
    window.sessionStorage.setItem(CHUNK_RELOAD_KEY, target)
    window.location.reload()
    return
  }

  MessageBox.alert(
    "前后端 WebUI 资源版本不一致，请刷新页面。若问题持续存在，请重新部署完整构建资源。",
    "页面资源加载失败",
    {
      type: "error",
      confirmButtonText: "重新加载",
      callback: () => {
        window.sessionStorage.removeItem(CHUNK_RELOAD_KEY)
        window.location.reload()
      },
    }
  )
})

router.afterEach(() => {
  window.sessionStorage.removeItem(CHUNK_RELOAD_KEY)
})

router.beforeEach(async (to, from, next) => {
  const isAuthenticated = window.sessionStorage.getItem("isAuthenticated")
  const hasToken = hasValidAuthToken()

  if (to.path !== from.path && hasDirtyState()) {
    try {
      await MessageBox.confirm(
        "当前页面有尚未保存的修改，离开后这些修改会丢失。",
        "离开当前页面？",
        {
          confirmButtonText: "放弃修改并离开",
          cancelButtonText: "继续编辑",
          type: "warning",
        }
      )
      clearAllDirtyStates()
    } catch (error) {
      next(false)
      return
    }
  }

  if (
    !["/", "/myapi", "/configure", "/connect"].includes(to.path) &&
    (!isAuthenticated || !hasToken)
  ) {
    clearAuthToken()
    window.sessionStorage.removeItem("isAuthenticated")
    next({ path: "/", query: { redirect: to.fullPath } })
  } else {
    next()
  }
})

export default router
