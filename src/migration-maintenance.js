import Vue from "vue"
import ElementUI from "element-ui"
import "element-ui/lib/theme-chalk/index.css"
import MigrationMaintenance from "./views/about/MigrationMaintenance.vue"

Vue.use(ElementUI)
Vue.config.productionTip = false
new Vue({ render: h => h(MigrationMaintenance) }).$mount("#app")
