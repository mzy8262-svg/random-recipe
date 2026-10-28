/**
 * 高德 Key 模板（提交到仓库；真实 Key 放 config.local.js，不要提交）
 *
 * 用法：把本文件复制成同目录的 config.local.js，填入你自己申请的高德 Web 服务 Key。
 * 没有 Key 时：定位/附近商家会报「高德 Key 无效」，抽签、筛选、偏好、投票仍然可用。
 */
(function () {
  var KEY = 'PUT_YOUR_AMAP_KEY_HERE';
  if (typeof module !== 'undefined' && module.exports) {
    module.exports = { AMAP_KEY: KEY };
  }
  if (typeof window !== 'undefined') {
    window.__LOCAL_AMAP_KEY__ = KEY;
  }
})();
