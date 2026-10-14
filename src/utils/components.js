import Vue from "vue"

Vue.prototype.$confirmAction = function ({
  title = "提示",
  message = "",
  confirmButtonText = "确定",
  cancelButtonText = "取消",
  type = "warning",
} = {}) {
  return this.$confirm(message, title, {
    confirmButtonText,
    cancelButtonText,
    type,
    closeOnClickModal: false,
  }).then(
    () => true,
    () => false,
  )
}
