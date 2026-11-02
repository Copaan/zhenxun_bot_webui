<template>
  <div
    class="route-progress"
    :class="{ 'is-visible': progress.visible }"
    role="progressbar"
    aria-label="页面加载进度"
    :aria-hidden="String(!progress.visible)"
    :aria-valuenow="Math.round(progress.value)"
  >
    <div class="route-progress-bar" :style="{ transform: `scaleX(${progress.value / 100})` }" />
  </div>
</template>

<script>
import { routeProgress } from "@/utils/route-progress"

export default {
  name: "RouteProgress",
  data() {
    return { progress: routeProgress }
  },
}
</script>

<style scoped>
.route-progress {
  position: fixed;
  top: 0;
  left: 0;
  right: 0;
  z-index: 3000;
  height: 2px;
  pointer-events: none;
  opacity: 0;
  transition: opacity 200ms ease;
}
.route-progress.is-visible {
  opacity: 1;
}
.route-progress-bar {
  height: 100%;
  background: var(--primary-color);
  box-shadow: 0 0 6px var(--primary-color);
  transform-origin: left center;
  transition: transform 200ms ease;
}
@media (prefers-reduced-motion: reduce) {
  .route-progress-bar {
    transition: none;
  }
}
</style>
