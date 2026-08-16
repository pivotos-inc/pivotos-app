<script setup lang="ts">
import { onLaunch, onShow, onHide } from "@dcloudio/uni-app";
import {
  startUnreadBadgePolling,
  stopUnreadBadgePolling,
  syncUnreadBadge,
} from "@/composables/useUnreadBadge";

onLaunch(() => {
  console.log("App Launch");
});
onShow(() => {
  // S84：前台回归即刷消息角标 + 启动轮询，覆盖子包页面停留期间的新消息
  syncUnreadBadge();
  startUnreadBadgePolling();
});
onHide(() => {
  stopUnreadBadgePolling();
});
</script>
<style></style>
