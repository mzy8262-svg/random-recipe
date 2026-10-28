/**
 * 高德 POI 清洗与判定
 *
 * 高德 Web 服务返回的字段有三个坑，直接透传给页面会出事：
 *   1) 缺字段时返回的是【空数组 []】，不是空字符串 —— `tel: []`、`biz_ext.cost: []`
 *      旧代码 `p.tel || ''` 会把 [] 原样留下，详情页就出现「📞」后面空一行；
 *      `parseFloat([])` 会得到 NaN，出现「人均 ¥NaN」。
 *   2) type 形如「餐饮服务;中餐厅;中餐厅」或「生活服务;物流速递;物流速递」，
 *      不显式传 types 参数时周边搜索会把快递驿站、住宅小区一起返回。
 *   3) 名称里的「店名」和「推荐菜」混在 tag / atag 字段里（逗号分隔），
 *      这是唯一能拿到的「真实菜品线索」，之前完全没用上。
 *
 * 本文件只做纯数据转换，不调用 wx.*，方便 Node 单测。
 */
const data = require('./data');

// 高德缺字段时的占位值（数组 / 空串 / 字符串 "[]"）
const EMPTY_TOKENS = ['[]', 'undefined', 'null', 'None'];

/** 任意值 -> 安全字符串；数组/对象一律当「没有」 */
function toStr(v) {
  if (v === null || v === undefined) return '';
  if (Array.isArray(v)) return '';
  if (typeof v === 'object') return '';
  const s = String(v).trim();
  if (!s || EMPTY_TOKENS.indexOf(s) >= 0) return '';
  return s;
}

/** 任意值 -> 安全数字（>=0）；非法值返回 null，绝不返回 NaN */
function toNum(v) {
  if (v === null || v === undefined || Array.isArray(v)) return null;
  if (typeof v === 'object') return null;
  if (typeof v === 'number') return isFinite(v) && v >= 0 ? v : null;
  const s = String(v).trim();
  if (!s || EMPTY_TOKENS.indexOf(s) >= 0) return null;
  const n = parseFloat(s);
  if (!isFinite(n) || n < 0) return null;
  return n;
}

/** 字符串或字符串数组 -> 去空字符串数组 */
function toStrList(v) {
  if (Array.isArray(v)) return v.map(toStr).filter((s) => s.length > 0);
  const s = toStr(v);
  if (!s) return [];
  return s
    .split(/[,，、;；|]/)
    .map((x) => x.trim())
    .filter((x) => x.length > 0);
}

/** 高德 tel 可能为 'a;b;c' 字符串，也可能是 []。只取第一个像电话的号码 */
function firstTel(v) {
  const list = toStrList(v);
  for (let i = 0; i < list.length; i++) {
    const phone = list[i];
    if (/[\d]{5,}/.test(phone.replace(/[-\s()（）]/g, ''))) return phone;
  }
  return '';
}

const JUNK_TAG = /套餐|组合|三件套|桶|系列|礼包|优惠|代金|券|满减|起送|配送|会员|新品|限时/;
// 整体就是“套餐/系列/（2-3人餐）”这种词，不是菜名，直接丢掉
const PURE_JUNK = /(套餐|组合|三件套|人餐|系列|礼包|优惠券?|代金券|满减|起送|配送|会员卡?|新品|限时|超值嗨餐|桶|私房菜|大排档|特色菜|家常菜|素菜|自助|旋转|热饮|冷饮|酒水|饮料|坯子)$/;
const WRAPPED_ONLY = /^[（(][^）)]*[）)]$/;
// 菜名里夹着「套餐/系列/桶」之类营销词的，整体丢（如「家有金桶（汉堡版）」「安格斯系列」）
const CONTAIN_JUNK = /(套餐|人餐|组合|系列|礼包|代金|满减|起送|配送|会员卡|新品|限时|嗨餐)/;
// 结尾是「（汉堡版）」「（脆鸡版）」这种规格后缀的，不是菜名本身
const VERSION_SUFFIX = /[（(][^）)]{0,8}(版|装|桶|份)[）)]$/;
// 「全家桶」「金桶」这类桶装组合
const BUCKET = /桶/;

/**
 * 从 tag / atag 里提取「招牌菜名」（高德没有完整菜单，但推荐菜关键词是真实数据）
 * 规则：优先短词（更像单个菜名），套路套餐/优惠类词降权，最多 max 个。
 */
function extractDishNames(p, max) {
  const n = max || 8;
  const src = p || {};
  const tagList = toStrList(src.tag);
  const list = tagList.length ? tagList : toStrList(src.atag);
  const seen = {};
  const scored = [];
  for (let i = 0; i < list.length; i++) {
    const name = list[i];
    if (name.length < 2 || name.length > 16) continue;
    if (WRAPPED_ONLY.test(name) || PURE_JUNK.test(name)) continue;
    if (VERSION_SUFFIX.test(name) || CONTAIN_JUNK.test(name) || BUCKET.test(name)) continue;
    const key = name.toLowerCase();
    if (seen[key]) continue;
    seen[key] = true;
    let penalty = 0;
    if (JUNK_TAG.test(name)) penalty += 2;
    if (name.length > 8) penalty += 1;
    scored.push({ name, penalty, len: name.length, idx: i });
  }
  scored.sort((a, b) => (a.penalty - b.penalty) || (a.len - b.len) || (a.idx - b.idx));
  return scored.slice(0, n).map((x) => x.name);
}

const NON_FOOD_TYPE = /商务住宅|住宅区|住宅小区|物流速递|生活服务|金融保险|银行|公司企业|政府机构|科教文化服务|医疗保健|交通设施|道路附属设施|地名地址|风景名胜|公共设施/;
const EXPRESS_NAME = /快递|驿站|菜鸟|丰巢|物流|邮局|邮政|菜鸟驿站/;

/** 是否餐饮类 POI（列表里只该出现这些） */
function isFoodPoi(p) {
  const src = p || {};
  const type = toStr(src.type);
  const typecode = toStr(src.typecode);
  const bizType = toStr(src.biz_type);
  const name = toStr(src.name);

  if (EXPRESS_NAME.test(name + ' ' + type)) return false;
  if (NON_FOOD_TYPE.test(type)) return false;

  if (bizType === 'diner') return true;
  if (type.indexOf('餐饮') >= 0) return true;

  const codes = typecode.split('|').map((c) => c.trim()).filter(Boolean);
  for (let i = 0; i < codes.length; i++) {
    if (codes[i].slice(0, 2) === '05') return true;
  }
  return false;
}

/** 是否购物类 POI（水果生鲜 / 生活杂货用） */
function isShopPoi(p) {
  const src = p || {};
  const type = toStr(src.type);
  const name = toStr(src.name);
  if (EXPRESS_NAME.test(name)) return false;
  if (type.indexOf('购物') >= 0) return true;
  const codes = toStr(src.typecode).split('|').map((c) => c.trim()).filter(Boolean);
  for (let i = 0; i < codes.length; i++) {
    if (codes[i].slice(0, 2) === '06') return true;
  }
  return false;
}

/** POI 是否属于某个菜品分类（fruit/grocery 走购物，其余走餐饮） */
function poiMatchesCat(p, catId) {
  const cat = data.CATEGORIES.find((c) => c.id === catId);
  if (cat && cat.amap === 'shop') return isShopPoi(p);
  return isFoodPoi(p);
}

/** 品类短标签：如「快餐厅」「中餐厅」「超级市场」 */
function cuisineLabel(p) {
  const src = p || {};
  const type = toStr(src.type);
  const keytag = toStr(src.keytag);
  const parts = type.split(';').map((s) => s.trim()).filter(Boolean);
  if (keytag && keytag.length <= 6) return keytag;
  if (parts.length >= 2) {
    const t = parts[1];
    if (t === '餐饮相关场所' || t === '餐饮相关' || t === '购物相关场所' || t === '购物相关') return '';
    return t.replace(/\/.*$/, '');
  }
  return keytag;
}

/** 高德 POI -> 页面统一商家结构（所有字段都保证类型安全） */
function normalizePoi(p) {
  const src = p || {};
  const ll = toStr(src.location).split(',');
  const lng = parseFloat(ll[0]);
  const lat = parseFloat(ll[1]);
  const biz = src.biz_ext && typeof src.biz_ext === 'object' && !Array.isArray(src.biz_ext) ? src.biz_ext : {};
  const rawPhotos = Array.isArray(src.photos) ? src.photos : [];
  const photos = rawPhotos
    .map((x) => toStr(x && x.url))
    .filter((u) => /^https?:\/\//.test(u))
    .slice(0, 3);
  const name = toStr(src.name);
  const type = toStr(src.type);

  return {
    id: toStr(src.id) || name + '@' + toStr(src.location),
    name: name || '未命名商家',
    address: toStr(src.address) || '地址未登记',
    lat: isFinite(lat) ? lat : 0,
    lng: isFinite(lng) ? lng : 0,
    distance: toNum(src.distance),
    rating: toNum(biz.rating),
    cost: toNum(biz.cost),
    openTime: toStr(biz.opentime2) || toStr(biz.opentime) || toStr(biz.open_time),
    tel: firstTel(src.tel),
    type,
    typecode: toStr(src.typecode),
    bizType: toStr(src.biz_type),
    keytag: toStr(src.keytag),
    cuisine: cuisineLabel(src),
    photos,
    dishes: extractDishNames(src, 8),
    isFood: isFoodPoi(src),
  };
}

module.exports = {
  toStr,
  toNum,
  toStrList,
  firstTel,
  extractDishNames,
  isFoodPoi,
  isShopPoi,
  poiMatchesCat,
  cuisineLabel,
  normalizePoi,
};
