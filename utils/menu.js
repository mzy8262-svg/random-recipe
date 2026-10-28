/**
 * 商家菜单：只展示「有真实来源」的菜，绝不编造。
 *
 * 数据来源优先级：
 *   1) utils/seed-menus.js 人工录入的真实菜单（含真实价格，标「真实菜单」）
 *   2) 高德 POI 的 tag / atag 推荐菜关键词（真实数据，但没有价格，标「高德推荐菜」）
 *   3) 都没有 -> 返回 kind: 'none'，页面提示「线上暂无菜单，导航到店选」。
 *
 * 之前的实现会根据「品类 + 人均」凭空生成 8 道菜并缩放价格，
 * 用户看到的鱼香肉丝 ¥22、麻婆豆腐 ¥18 全是假的，已删除。
 */
const seedMenus = require('./seed-menus');
const poi = require('./poi');

// 商家 POI 类型/店名 -> 菜品品类 id（顺序敏感：粥/烘焙/饮品要排在「面」前面）
function merchantCatId(merchant) {
  const s = ((merchant && merchant.type) || '') + ' ' + ((merchant && merchant.name) || '');
  const rules = [
    [/粥/, 'congee'],
    [/蛋糕|烘焙|面包|甜品|西点|糕点|糕/, 'bakery'],
    [/咖啡|奶茶|茶饮|茶室|茶馆|果汁|饮品|拿铁/, 'drink'],
    [/火锅|串串|涮/, 'hotpot'],
    [/烧烤|烤肉|铁板|bbq|BBQ|串/, 'bbq'],
    [/寿司|日料|日本|韩国|韩式|石锅|拌饭/, 'jpkr'],
    [/泰国|东南亚|越南|咖喱|新加坡/, 'sea'],
    [/沙拉|轻食|素食|健康餐/, 'salad'],
    [/快餐|便当|盖饭|盖浇|汉堡|肯德基|麦当劳|德克士|华莱士|真功夫|吉野家|真鲜/, 'fastfood'],
    [/包子|饺子|馄饨|小吃|煎饼|肉夹馍|锅贴|生煎|炸鸡|薯条/, 'snack'],
    [/水果|果切|鲜果|果捞/, 'fruit'],
    [/便利|超市|杂货/, 'grocery'],
    [/面|粉|米线|拉面|烩面|刀削|拌面/, 'noodle'],
    [/家常|炒菜|中餐|小炒|农家|鲁菜|川菜|湘菜|饭店|餐厅|酒楼|自助/, 'chinese'],
  ];
  for (let i = 0; i < rules.length; i++) {
    if (rules[i][0].test(s)) return rules[i][1];
  }
  return 'chinese';
}

// 按菜名猜个表情（纯展示用，不影响数据）
function guessEmoji(name) {
  const s = String(name || '');
  if (/奶茶|茶|咖啡|拿铁|果汁|饮/.test(s)) return '🧋';
  if (/蛋糕|面包|挞|泡芙|甜|糕|欧包/.test(s)) return '🍰';
  if (/汉堡|薯条|炸鸡|鸡块/.test(s)) return '🍔';
  if (/披萨|比萨/.test(s)) return '🍕';
  if (/寿司|刺身|三文鱼/.test(s)) return '🍣';
  if (/面|粉|米线|拉面/.test(s)) return '🍜';
  if (/饭|盖饭|拌饭|煲仔/.test(s)) return '🍚';
  if (/火锅|汤|锅/.test(s)) return '🍲';
  if (/串|烧烤|烤/.test(s)) return '🍢';
  if (/饺|包|馄饨/.test(s)) return '🥟';
  if (/卷|饼|馍/.test(s)) return '🌯';
  if (/沙拉|菜|蔬/.test(s)) return '🥗';
  if (/肉|排|鸡|鸭|鱼|虾|蟹/.test(s)) return '🍖';
  return '🍽️';
}

/**
 * 获取该商家的菜单
 * @param {object} merchant 归一化后的商家 { id, name, type, cost, dishes }
 * @returns {object} {
 *   kind: 'seed' | 'amap' | 'none',
 *   real: boolean,        // 是否真实来源
 *   source: string,       // '饿了么' / '高德推荐菜' / ''
 *   dishes: [{ name, emoji, price:Number|null, kcal:Number|null, star:Boolean }]
 * }
 */
function buildMenu(merchant) {
  const m = merchant || {};

  // 1) 人工录入的真实菜单（含价格）
  const seed = seedMenus.findSeed(m);
  if (seed && seed.dishes && seed.dishes.length) {
    return {
      kind: 'seed',
      real: true,
      source: seed.source || '真实菜单',
      dishes: seed.dishes.map((d) => ({
        name: d.name,
        emoji: d.emoji || guessEmoji(d.name),
        kcal: d.kcal || null,
        price: d.price,
        star: !!d.star,
      })),
    };
  }

  // 2) 高德推荐菜关键词（真实数据，没有价格）
  const names = (m.dishes && m.dishes.length) ? m.dishes : poi.extractDishNames(m, 8);
  if (names.length) {
    return {
      kind: 'amap',
      real: true,
      source: '高德推荐菜',
      dishes: names.map((name, i) => ({
        name,
        emoji: guessEmoji(name),
        kcal: null,
        price: null,
        star: i < 2,
      })),
    };
  }

  // 3) 没有任何真实菜品数据：返回空，页面给出「到店选」提示
  return { kind: 'none', real: false, source: '', dishes: [] };
}

module.exports = { merchantCatId, buildMenu, guessEmoji };
