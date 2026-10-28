/**
 * 范围内菜品池
 * ------------------------------------------------------------------
 * 抽签原来只从内置菜库里随机，和“附近到底有没有这家店”没关系，
 * 用户会抽到「范围内根本吃不到的菜」。
 *
 * 这里把高德返回的每家店的推荐菜（tag/atag 解析出来的真实菜名）
 * 变成候选池：抽到的菜，附近一定有店做（merId/merName/merDistance）。
 * 菜名能和内置菜库对上时，顺手补齐 emoji / 参考价 / 热量 / 标签，
 * 对不上就显示「到店看价」，绝不编造价格。
 */

const data = require('./data');
const cuisine = require('./cuisine');

const UNKNOWN_EMOJI = '🍽️';

/** 菜名规范化：去空白，便于和内置菜库对齐 */
function normName(name) {
  return String(name || '').replace(/\s+/g, '').trim();
}

/** 找内置菜库里的同名菜（用于补价格/热量/emoji/标签） */
function metaOf(name) {
  const key = normName(name);
  if (!key) return null;
  return data.DISHES.find((d) => d.name === key) || null;
}

/**
 * 商家列表 → 候选菜品
 * @param {Array} merchants normalizePoi 之后的商家（含 dishes 字段）
 * @returns {Array} [{ name, emoji, price, kcal, cat, tags, scenes, matched, merId, merName, merDistance }]
 */
function build(merchants) {
  const map = {};
  (merchants || []).forEach((m) => {
    if (!m) return;
    const dishes = m.dishes || [];
    dishes.forEach((raw) => {
      const name = normName(raw);
      if (!name) return;
      const prev = map[name];
      // 同名菜保留离得最近的那家店
      if (prev) {
        if (prev.merDistance == null) {
          // 已有记录没有距离，用有距离的替换
          if (m.distance == null) return;
        } else if (m.distance == null || prev.merDistance <= m.distance) {
          return;
        }
      }
      const meta = metaOf(name);
      map[name] = {
        name,
        emoji: (meta && meta.emoji) || UNKNOWN_EMOJI,
        price: meta && meta.price != null ? meta.price : null,
        kcal: meta && meta.kcal != null ? meta.kcal : null,
        cat: meta ? meta.cat : '',
        tags: meta ? meta.tags.slice() : [],
        scenes: meta ? meta.scenes.slice() : [],
        exclude: meta ? meta.exclude.slice() : [],
        matched: !!meta,
        merId: m.id || '',
        merName: m.name || '',
        merDistance: m.distance == null ? null : m.distance,
      };
    });
  });
  return Object.keys(map).map((k) => map[k]);
}

/**
 * 菜名里的忌口线索（只对“菜名对不上内置菜库”的真实菜单用）
 * 例：noPork 命中「猪肉/排骨/五花/火腿」，vegan 命中任何荤食词。
 */
const NAME_RULES = {
  noSpicy: /辣|麻|椒|剁椒|水煮|红油|香锅|干锅/,
  noSeafood: /鱼|虾|蟹|海鲜|蛤|贝|鱿|鲍|龙虾|海参/,
  noBeef: /牛|肥牛|牛排|牛腩/,
  noPork: /猪|肉|排骨|五花|腊肉|火腿|香肠|肥肠|肘|蹄/,
  vegan: /肉|鸡|鸭|鱼|虾|牛|猪|羊|排|肠|蛋|奶|芝士|黄油|火腿/,
  noMilk: /奶|芝士|黄油|奶油|蛋糕|拿铁|奶茶/,
  noCoriander: /香菜/,
  noOnion: /洋葱|葱/,
};

/**
 * 按筛选条件过滤候选池
 * 说明：范围外的店已经不在池里了；这里只处理菜系/预算/标签/忌口/目标。
 * - 菜系：按菜名判断（和内置菜库同一套规则）
 * - 能对上内置菜库的菜：按参考价/标签/忌口/热量精确过滤
 * - 对不上菜库的真实菜名：价格未知就标「到店看价」不强过滤；
 *   忌口用菜名关键词保守排除（宁可少给，也不推荐忌口菜）
 */
function filter(cands, f) {
  const cond = f || {};
  return (cands || []).filter((d) => {
    // 时段：只对能对上菜库的菜按时段筛（真实菜单对不上的不强判，避免整池被清空）
    if (cond.scene && d.matched && d.scenes.indexOf(cond.scene) < 0) return false;

    // 菜系：用菜名判断，和内置菜库同一套规则
    if (cond.cuisineId && cuisine.ofName(d.name) !== cond.cuisineId) return false;

    // 预算：有参考价就严格比；没有参考价就不过滤（结果里显示「到店看价」）
    if (cond.budgetId) {
      const b = data.BUDGETS.find((x) => x.id === cond.budgetId);
      if (b && d.price != null && (d.price < b.min || d.price > b.max)) return false;
    }

    // 标签：菜名对不上内置菜库就不知道是否满足，此时不过滤
    if (cond.tagIds && cond.tagIds.length && d.matched) {
      for (const t of cond.tagIds) {
        if (d.tags.indexOf(t) < 0) return false;
      }
    }

    // 忌口：能对上菜库的先按 exclude 精确排；再统一用菜名关键词兜一层
    // （真实菜单里很多菜名对不上菜库，靠关键词避免把「水煮鱼」推给不吃辣的人）
    if (cond.prefs && cond.prefs.length) {
      for (const p of cond.prefs) {
        if (d.matched && (d.exclude || []).indexOf(p) >= 0) return false;
        const rule = NAME_RULES[p];
        if (rule && rule.test(d.name)) return false;
      }
    }

    // 饮食目标：热量/价格可控时才过滤
    if (cond.goal === 'losefat' && d.kcal != null && d.kcal > 500) return false;
    if (cond.goal === 'save' && d.price != null && d.price > 20) return false;

    return true;
  });
}

module.exports = { build, filter, metaOf };
