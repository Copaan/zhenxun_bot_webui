import Vue from "vue"
import Vuex from "vuex"
import createPersistedState from "vuex-persistedstate"
import statusWebSocket from "@/utils/websocket/status-websocket"
import logWebSocket from "@/utils/websocket/log-websocket"
import chatWebSocket from "@/utils/websocket/chat-websocket"
import { handleWebuiRevision } from "@/utils/webui-revision"

Vue.use(Vuex)

export default new Vuex.Store({
  plugins: [
    createPersistedState({
      reducer: (state) => {
        return {
          botType: state.botType,
          selectedBotKey: state.selectedBotKey,
        }
      },
    }),
  ],
  state: {
    botType: null,
    botInfo: null,
    selectedBotKey: null,
    chatObj: {}, // 聊天ws信息存储
    _chatId: null,
    wsStatusData: null,
    runtimeGeneration: 0,
    webuiRevision: "",
    wsStatusObj: {
      cpuList: [],
      memoryList: [],
      diskList: [],
      timeList: [],
    },
    pluginOperation: {
      visible: false,
      active: false,
      status: "idle",
      action: "",
      pluginName: "",
      title: "",
      message: "",
      applyMode: "",
      restartAvailable: false,
      accessUrls: [],
      accessTargets: [],
    },
  },
  getters: {
    getWsStatusData(state) {
      return state.wsStatusData
    },
    getWsStatusObj(state) {
      return state.wsStatusObj
    },
  },
  mutations: {
    SET_BOT_TYPE(state, botType) {
      state.botType = botType
    },
    SET_BOT(state, botInfo) {
      state.botInfo = botInfo
      if (botInfo && botInfo.bot_key) state.selectedBotKey = botInfo.bot_key
    },
    START_PLUGIN_OPERATION(state, payload) {
      state.pluginOperation = {
        visible: true,
        active: true,
        status: "running",
        action: payload.action,
        pluginName: payload.pluginName,
        title: payload.title,
        message: payload.message,
        applyMode: "",
        restartAvailable: false,
        accessUrls: [],
        accessTargets: [],
      }
    },
    FINISH_PLUGIN_OPERATION(state, payload) {
      state.pluginOperation = {
        ...state.pluginOperation,
        visible: true,
        active: false,
        status: payload.status,
        title: payload.title,
        message: payload.message,
        applyMode: payload.applyMode || "",
        restartAvailable: Boolean(payload.restartAvailable),
        accessUrls: payload.accessUrls || [],
        accessTargets: payload.accessTargets || [],
      }
    },
    CLEAR_PLUGIN_OPERATION(state) {
      state.pluginOperation = {
        visible: false,
        active: false,
        status: "idle",
        action: "",
        pluginName: "",
        title: "",
        message: "",
        applyMode: "",
        restartAvailable: false,
        accessUrls: [],
        accessTargets: [],
      }
    },
    SET_CHAT_ID(state, chatId) {
      state._chatId = chatId
    },
    SET_WS_STATUS_DATA(state, data) {
      state.runtimeGeneration = Number(data.runtime_generation || 0)
      state.webuiRevision = data.webui_revision || ""
      handleWebuiRevision(data)
      state.wsStatusObj.timeList.push(data.check_time.split("T")[1])
      state.wsStatusObj.cpuList.push(data.cpu)
      state.wsStatusObj.memoryList.push(data.memory)
      state.wsStatusObj.diskList.push(data.disk)
      if (state.wsStatusObj.timeList.length > 10) {
        state.wsStatusObj.timeList.splice(0, 1)
        state.wsStatusObj.cpuList.splice(0, 1)
        state.wsStatusObj.memoryList.splice(0, 1)
        state.wsStatusObj.diskList.splice(0, 1)
      }
      state.wsStatusData = data
    },
    ADD_CHAT_MSG(state, data) {
      const chatObj = { ...state.chatObj }
      if (!chatObj[data.chatId]) {
        chatObj[data.chatId] = {
          unreadCount: 0,
          msgList: [],
          time: 0,
        }
      }
      if (data.obj) {
        chatObj[data.chatId].msgList.push(data.obj)
        chatObj[data.chatId].time = Date.now()

        if (data.chatId != state._chatId) {
          chatObj[data.chatId].unreadCount += 1
        }
        if (chatObj[data.chatId].msgList.length > 50) {
          chatObj[data.chatId].msgList.splice(0, 1)
        }
      }
      state.chatObj = chatObj
    },
    READ_CHAT(state, chatId) {
      let chatObj = { ...state.chatObj }
      if (chatObj[chatId]) {
        chatObj[chatId].unreadCount = 0
        state.chatObj = chatObj
      }
    },
    CLEAR_CHAT(state, chatId) {
      let chatObj = { ...state.chatObj }
      if (chatId) {
        chatObj[chatId] = {
          unreadCount: 0,
          msgList: [],
          time: 0,
        }
      } else {
        chatObj = {}
      }
      state.chatObj = chatObj
    },
  },
  actions: {
    initStatusSocket({ commit }) {
      statusWebSocket.initWebSocket((event) => {
        const data = JSON.parse(event.data)

        commit("SET_WS_STATUS_DATA", data)
      })
    },
    initLogSocket(context, callable) {
      logWebSocket.initWebSocket((event) => {
        callable(event.data)
      })
    },
    initChatSocket(context, callable) {
      chatWebSocket.initWebSocket()
    },
  },
})
