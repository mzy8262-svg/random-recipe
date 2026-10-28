/**
 * 真实菜单种子库（人工从外卖平台抄录，自用演示）
 *
 * ⚠️ 数据来源为外卖平台公开菜单，仅供个人演示使用；
 *    正式发布前请替换为「用户上传菜单」或官方开放接口数据。
 *
 * 录入格式见下方 SEEDS 模板。匹配规则（优先级从高到低）：
 *   1) poiId 与高德 POI id 精确相等（最可靠，录数据时记下 id）
 *   2) 店名去分店后缀后相等，如「陕十三肉夹馍(历山路店)」→「陕十三肉夹馍」
 */
const SEEDS = [
  // {
  //   poiId: 'B0FFG7F8K6',              // 高德 POI id（可选，最精确）
  //   name: '陕十三肉夹馍',              // 主店名（必填，用于模糊匹配）
  //   source: '饿了么',                  // 数据来源标注
  //   dishes: [
  //     { name: '肉夹馍（纯瘦）', price: 12, star: true },
  //     { name: '凉皮', price: 10 },
  //     { name: '米线', price: 13, kcal: 450 },   // kcal 可选，没有就不显示热量
  //   ],
  // },
];

// 店名归一化：去掉分店后缀和空白
function normalize(name) {
  return String(name || '')
    .replace(/[（(][^）)]*[）)]/g, '')
    .replace(/\s+/g, '')
    .toLowerCase();
}

/** 在种子库里找该商家的真实菜单，没有返回 null */
function findSeed(merchant) {
  if (!merchant) return null;
  for (const s of SEEDS) {
    if (s.poiId && merchant.id === s.poiId) return s;
  }
  const key = normalize(merchant.name);
  for (const s of SEEDS) {
    if (normalize(s.name) === key) return s;
  }
  return null;
}

module.exports = { SEEDS, findSeed, normalize };
