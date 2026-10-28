/**
 * 高德地图 Web服务 API 封装
 * 接口文档: https://lbs.amap.com/api/webservice/summary
 *
 * ⚠️ 微信小程序要求在 mp.weixin.qq.com 后台「开发管理 → 开发设置 → 服务器域名」
 *    把 https://restapi.amap.com 加入 request 合法域名，真机才能调用。
 *    开发者工具里勾选「不校验合法域名」即可本地调试（project.config.json 已配 urlCheck:false）。
 */
const config = require('./config');

/** 高德错误码 -> 人话（给非技术用户看） */
const INFO_HINT = {
  INVALID_USER_KEY: '高德 Key 无效，请检查 utils/config.js',
  INVALID_USER_SCODE: '高德 Key 类型不对，需要「Web服务」类型的 Key',
  USER_KEY_RESTRICT: '高德 Key 被限制，请到高德控制台检查 Key 的域名/来源限制',
  DAILY_QUERY_OVER_LIMIT: '高德接口今日免费额度用完了，明天再用',
  ACCESS_TOO_FREQUENT: '请求太频繁，歇一会再试',
  SERVICE_NOT_AVAILABLE: '高德服务暂时不可用，请稍后再试',
  INVALID_PARAMS: '请求参数有误（请反馈）',
  ENGINE_RESPONSE_DATA_ERROR: '高德返回数据异常，请重试',
};

function hintOf(d) {
  const info = (d && d.info) || '';
  const code = (d && d.infocode) || '';
  if (INFO_HINT[info]) {
    // 友好提示 + 原始 info，方便排查（也便于自动化断言）
    return INFO_HINT[info] + '（' + info + (code && code !== info ? ' / ' + code : '') + '）';
  }
  return '高德接口错误：' + (info || code || '未知错误');
}

/** 微信请求失败提示（最常见的是没配合法域名） */
function failHint(err) {
  const msg = String((err && err.errMsg) || err || '');
  if (/domain|域名|not in domain/i.test(msg)) {
    return '网络请求被微信拦截：请在小程序后台把 https://restapi.amap.com 加入「request 合法域名」，或在开发者工具里勾选「不校验合法域名」';
  }
  if (/timeout/i.test(msg)) return '网络超时，请检查手机网络后重试';
  if (/abort/i.test(msg)) return '请求被取消';
  return '网络请求失败：' + (msg || '未知错误');
}

// 可注入的请求实现，方便单元测试；默认走 wx.request
let requestImpl = null;
function setRequestImpl(fn) {
  requestImpl = fn;
}

function request(path, params) {
  const doRequest = requestImpl || function (url, data, cb) {
    wx.request({
      url,
      data,
      method: 'GET',
      timeout: 10000,
      success(res) { cb(null, res); },
      fail(err) { cb(err, null); },
    });
  };
  return new Promise((resolve, reject) => {
    doRequest(config.AMAP_BASE + path, Object.assign({ key: config.AMAP_KEY }, params), (err, res) => {
      if (err) {
        reject(new Error(failHint(err)));
        return;
      }
      const d = (res && res.data) || {};
      // 高德统一返回格式: status=1 成功
      if (d.status === '1' || d.status === 1) {
        resolve(d);
      } else {
        reject(new Error(hintOf(d)));
      }
    });
  });
}

/** IP 定位 — GPS 不可用时的兜底，返回 {province, city, adcode, rectangle} */
function ipLocate() {
  return request('/ip', {});
}

/** 逆地理编码 — 坐标转地址（base 已含 formatted_address / addressComponent） */
function regeo(location) {
  return request('/geocode/regeo', {
    location,
    radius: 1000,
    extensions: 'base',
  });
}

/** 地理编码 — 地址文本转坐标 */
function geocode(address, city) {
  return request('/geocode/geo', { address, city: city || '' });
}

/**
 * 周边搜索 — 核心接口：找附近商家
 * @param {string} location '经度,纬度'
 * @param {number} radius   半径（米）
 * @param {object} opts     { types, keywords, offset, page, sortrule }
 *                          ⚠️ types 一定要传，否则会搜到快递驿站、住宅小区
 */
function aroundSearch(location, radius, opts) {
  const o = opts || {};
  return request('/place/around', {
    location,
    radius: Math.min(radius || 1000, 50000),
    types: o.types || '',
    keywords: o.keywords || '',
    offset: o.offset || config.PAGE_SIZE,
    page: o.page || 1,
    sortrule: o.sortrule || 'distance',
    extensions: 'all', // 带上 biz_ext: 评分/人均/营业时间，以及 photos/tag
  });
}

/** 周边搜索（只要餐饮） */
function aroundFood(location, radius, opts) {
  return aroundSearch(location, radius, Object.assign({}, opts, {
    types: config.AMAP_TYPES.FOOD,
  }));
}

/** 周边搜索（只要购物：水果生鲜 / 生活杂货） */
function aroundShop(location, radius, opts) {
  return aroundSearch(location, radius, Object.assign({}, opts, {
    types: config.AMAP_TYPES.SHOP,
  }));
}

/** 关键词搜索地点（地址搜索用） */
function placeText(keywords, city) {
  return request('/place/text', {
    keywords,
    city: city || '',
    offset: 10,
    page: 1,
    extensions: 'base',
  });
}

module.exports = {
  setRequestImpl,
  ipLocate,
  regeo,
  geocode,
  aroundSearch,
  aroundFood,
  aroundShop,
  placeText,
};
