/**
 * 全局配置
 */
/**
 * 高德 Key 解析顺序（仓库里绝不出现真实 Key）：
 *   1) utils/config.local.js（本机私有，已被 .gitignore 忽略）
 *   2) 浏览器里 window.__LOCAL_AMAP_KEY__（web-demo 先加载 config.local.js）
 *   3) 占位符 → 定位/商家导航会提示「高德 Key 无效」，其余功能照常可用
 */
function resolveKey() {
  try {
    if (typeof require === 'function') {
      // eslint-disable-next-line global-require
      var local = require('./config.local');
      if (local && local.AMAP_KEY) return local.AMAP_KEY;
    }
  } catch (e) {
    /* 本地没放 config.local.js：用占位符，不影响抽签等功能 */
  }
  if (typeof window !== 'undefined' && window.__LOCAL_AMAP_KEY__) {
    return window.__LOCAL_AMAP_KEY__;
  }
  return 'PUT_YOUR_AMAP_KEY_HERE';
}

module.exports = {
  // 高德地图 Web服务 Key（个人开发者，实测已验证可用）
  AMAP_KEY: resolveKey(),

  // 搜索半径上限（公里）。高德周边搜索 radius 上限 50000 米，30km 仍在接口允许范围内。
  MAX_RADIUS_KM: 30,

  // 半径档位（公里）。0.3 / 0.5 用于“就在楼下、同一栋楼”的精确定位场景：
  // 配合「地图选点」或高精度 GPS，能把结果收敛到步行 5 分钟内；
  // 10 / 20 / 30 用于“整片城区 / 跨区找个能吃的”场景。
  RADIUS_STEPS: [0.3, 0.5, 1, 2, 3, 5, 10, 20, 30],

  // 高德接口地址
  AMAP_BASE: 'https://restapi.amap.com/v3',

  // POI 类型编码（高德分类编码，见 https://lbs.amap.com/api/webservice/download）
  // 不传 types 时周边搜索会把快递驿站、住宅小区、银行全都搜出来，所以必须显式限定。
  AMAP_TYPES: {
    FOOD: '050000', // 餐饮服务
    SHOP: '060000', // 购物服务（水果生鲜 / 生活杂货用）
  },

  // 单页拉取数量（高德单页最大 50）
  PAGE_SIZE: 25,

  // 首页商家列表最多展示多少条
  // 高德单体周边搜索 count 上限 600、单页 25 条，个人 Key 还有 QPS 限制，
  // 所以“附近全量”按 8 页 × 25 = 200 家封顶，再多就得靠「加载更多」继续翻。
  MAX_MERCHANT_ROWS: 200,

  // reset 时最多翻多少页（25 条/页）；8 页 = 约 200 家，覆盖 1km 内绝大多数餐饮
  MAX_PAGES: 8,

  // 深度翻页的节流间隔（毫秒）。个人 Key 的 QPS 很低，连续请求会返回
  // CUQPS_HAS_EXCEEDED_THE_LIMIT，因此翻页之间必须留间隔。
  DEEP_PAGE_DELAY_MS: 420,

  /**
   * 外部 App 跳转配置（用于「去美团看价」这类按钮）
   *
   * 原理：wx.navigateToMiniProgram 可以从小程序跳到另一个小程序，
   * 需要目标小程序的 appId（并且要用户自己点按钮才会跳，微信不允许自动跳）。
   *
   * - meituan：美团/美团外卖小程序的 appId。appId 为空时按钮自动降级为
   *   「复制店名 + 弹窗指引」，不会出现点了没反应的假按钮。
   *   如果跳转失败（对方限制被跳转、appId 失效等），也会自动降级成复制指引。
   * - taobao：淘宝/淘宝闪购在微信里没有可用的小程序，也打不开淘宝链接，
   *   所以只能复制店名，让用户去淘宝 App 里粘贴搜索。
   */
  EXTERNAL_APPS: {
    meituan: {
      name: '美团',
      appId: 'wxde8ac0a21135c07d',
      // 不指定 path 时打开对方首页，用户在美团里搜索店名即可（避免 path 失效导致跳转失败）
      path: '',
    },
  },
};
