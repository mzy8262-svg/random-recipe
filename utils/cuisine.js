/**
 * 菜系分类
 *
 * 说明：内置菜库里没有「权威菜系」字段，这里用「菜名显式映射表 + 关键词兜底」判断，
 * 判不出来的统一归到「其他菜」。映射表只影响筛选分组，不改变菜名/价格/热量等真实数据。
 *
 * 另一个用途：菜系 → 高德搜索关键词。其中「其他菜」没有关键词，等于不按菜系过滤商家。
 */

var OTHER = 'other';

var CUISINES = [
  { id: 'sichuan', name: '川菜', emoji: '🌶️', kw: '川菜|川味|水煮鱼|冒菜|麻辣烫' },
  { id: 'hunan', name: '湘菜', emoji: '🌶️', kw: '湘菜|湖南菜|剁椒鱼头' },
  { id: 'canton', name: '粤菜', emoji: '🍲', kw: '粤菜|广东菜|烧腊|煲仔饭' },
  { id: 'shandong', name: '鲁菜', emoji: '🍜', kw: '鲁菜|山东菜|把子肉' },
  { id: 'northeast', name: '东北菜', emoji: '🥘', kw: '东北菜|东北饺子|锅包肉' },
  { id: 'jiangzhe', name: '江浙菜', emoji: '🐟', kw: '江浙菜|本帮菜|杭帮菜|淮扬菜' },
  { id: 'northwest', name: '西北菜', emoji: '🍢', kw: '西北菜|兰州拉面|新疆菜|羊肉泡馍' },
  { id: 'yungui', name: '云贵菜', emoji: '🍲', kw: '云南菜|贵州菜|过桥米线|酸汤鱼' },
  { id: 'western', name: '西餐', emoji: '🍔', kw: '西餐|汉堡|披萨|牛排|意面' },
  { id: 'korean', name: '韩餐', emoji: '🍗', kw: '韩餐|韩国料理|石锅拌饭|炸鸡' },
  { id: 'japanese', name: '日料', emoji: '🍣', kw: '日料|寿司|居酒屋|日式拉面' },
  { id: 'sea', name: '东南亚菜', emoji: '🍛', kw: '东南亚菜|泰国菜|越南菜|咖喱' },
  { id: OTHER, name: '其他菜', emoji: '🍽️', kw: '' }
];

// 菜名 → 菜系（显式映射，优先生效）
var DISH_CUISINE = {
  // 川菜
  '鱼香肉丝': 'sichuan',
  '麻婆豆腐': 'sichuan',
  '回锅肉': 'sichuan',
  '水煮肉片': 'sichuan',
  '宫保鸡丁': 'sichuan',
  '宫保鸡丁盖饭': 'sichuan',
  '麻婆豆腐盖饭': 'sichuan',
  '干煸豆角': 'sichuan',
  '麻辣烫': 'sichuan',
  '冒菜': 'sichuan',
  '串串香（人均）': 'sichuan',
  '重庆小面': 'sichuan',
  '酸辣粉': 'sichuan',
  // 湘菜
  '臭豆腐': 'hunan',
  '剁椒鱼头': 'hunan',
  '农家小炒肉': 'hunan',
  // 粤菜
  '云吞面': 'canton',
  '煲仔饭': 'canton',
  '白切鸡': 'canton',
  '肠粉': 'canton',
  // 鲁菜
  '糖醋里脊': 'shandong',
  '把子肉': 'shandong',
  // 东北菜
  '烤冷面': 'northeast',
  '锅包肉': 'northeast',
  '地三鲜': 'northeast',
  // 江浙菜
  '小笼包一屉': 'jiangzhe',
  '生煎包（4只）': 'jiangzhe',
  '东坡肉': 'jiangzhe',
  // 西北菜
  '凉皮': 'northwest',
  '肉夹馍': 'northwest',
  '兰州拉面': 'northwest',
  '羊肉泡馍': 'northwest',
  '大盘鸡': 'northwest',
  // 云贵菜
  '过桥米线': 'yungui',
  '酸汤鱼': 'yungui',
  // 西餐
  '鸡胸肉沙拉': 'western',
  '牛肉蔬菜沙拉': 'western',
  '藜麦杂粮碗': 'western',
  '全麦三明治': 'western',
  '金枪鱼沙拉': 'western',
  '牛肉汉堡': 'western',
  // 韩餐
  '石锅拌饭': 'korean',
  '部队火锅': 'korean',
  '韩式炸鸡': 'korean',
  '烤肉拌饭': 'korean',
  // 日料
  '寿司拼盘': 'japanese',
  '日式拉面': 'japanese',
  '咖喱猪排饭': 'japanese',
  '天妇罗盖饭': 'japanese',
  '章鱼小丸子': 'japanese',
  '关东煮': 'japanese',
  // 东南亚
  '冬阴功汤': 'sea',
  '泰式炒河粉': 'sea',
  '咖喱鸡配饭': 'sea',
  '越南河粉': 'sea',
  '沙爹肉串': 'sea',
  '咖喱鸡饭': 'sea'
};

// 菜名关键词兜底（映射表没命中时再用）
var RULES = [
  { id: 'sichuan', re: /(鱼香|宫保|回锅|麻婆|水煮|辣子|口水|毛血旺|夫妻肺片|酸菜鱼|担担面|川味|冒菜)/ },
  { id: 'hunan', re: /(剁椒|湘菜|湖南|腊味|小炒肉)/ },
  { id: 'canton', re: /(烧鹅|叉烧|白切鸡|肠粉|虾饺|煲仔|河粉|云吞|粤菜)/ },
  { id: 'shandong', re: /(把子肉|葱烧|九转|糖醋鲤鱼|鲁菜|山东)/ },
  { id: 'northeast', re: /(锅包肉|地三鲜|乱炖|炖粉条|酸菜白肉|东北|大拉皮)/ },
  { id: 'jiangzhe', re: /(东坡肉|狮子头|小笼|生煎|蟹粉|葱油拌面|阳春面|江浙|本帮|杭帮)/ },
  { id: 'northwest', re: /(泡馍|臊子面|肉夹馍|大盘鸡|拉条子|手抓饭|兰州拉面|凉皮|西北|新疆)/ },
  { id: 'yungui', re: /(过桥米线|汽锅鸡|酸汤|米线|云南|贵州)/ },
  { id: 'western', re: /(汉堡|披萨|意面|牛排|三明治|培根|沙拉)/ },
  { id: 'korean', re: /(韩式|石锅|部队锅|泡菜|拌饭)/ },
  { id: 'japanese', re: /(寿司|刺身|天妇罗|鳗鱼|日式|咖喱饭|亲子丼|味噌|关东煮|章鱼小丸子)/ },
  { id: 'sea', re: /(泰式|冬阴功|越南|菠萝饭|咖喱|东南亚)/ }
];

var BY_ID = {};
for (var i = 0; i < CUISINES.length; i++) {
  BY_ID[CUISINES[i].id] = CUISINES[i];
}

function byId(id) {
  return BY_ID[id] || null;
}

/** 菜系命中的高德搜索关键词；「其他菜」返回空串（表示不按菜系过滤商家） */
function keywordOf(id) {
  var c = byId(id);
  return (c && c.kw) || '';
}

/** 菜名 → 菜系 id；永远返回一个合法 id（兜底 other） */
function ofName(name) {
  var n = String(name || '').trim();
  if (!n) return OTHER;
  if (DISH_CUISINE[n]) return DISH_CUISINE[n];
  for (var i = 0; i < RULES.length; i++) {
    if (RULES[i].re.test(n)) return RULES[i].id;
  }
  return OTHER;
}

/** 菜品（对象或菜名）→ 菜系 id */
function ofDish(dish) {
  if (!dish) return OTHER;
  if (typeof dish === 'string') return ofName(dish);
  return ofName(dish.name);
}

function nameOf(id) {
  var c = byId(id);
  return c ? c.name : '';
}

module.exports = {
  OTHER: OTHER,
  CUISINES: CUISINES,
  DISH_CUISINE: DISH_CUISINE,
  byId: byId,
  keywordOf: keywordOf,
  ofName: ofName,
  ofDish: ofDish,
  nameOf: nameOf
};
