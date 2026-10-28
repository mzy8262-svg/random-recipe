/**
 * 数据层：分类体系 + 生活化菜品库（含估算热量）
 *
 * 菜品定位：打工人日常真实会点的东西，价格参考真实外卖行情。
 * 热量为估算值（千卡/份），用于「营养/热量显示」功能。
 */

// 菜系：按菜名归类（川菜/湘菜/粤菜…其他菜），只用于筛选分组
const cuisine = require('./cuisine');

// ================= 分类体系 =================

// 什么时候吃（按当前时间自动推荐）
const SCENES = [
  { id: 'breakfast', name: '早餐', emoji: '🌅', hours: [6, 10] },
  { id: 'lunch', name: '午餐', emoji: '🌞', hours: [11, 14] },
  { id: 'tea', name: '下午茶', emoji: '🍵', hours: [14, 17] },
  { id: 'dinner', name: '晚餐', emoji: '🌙', hours: [17, 21] },
  { id: 'night', name: '夜宵', emoji: '🦉', hours: [21, 24] },
];

// 吃什么类型（kw 是搜索关键词，amap 是高德 POI 大类：food=餐饮服务，shop=购物服务）
// 注意：fruit / grocery 走「购物服务」大类，其余都走「餐饮服务」大类；
// 这样周边搜索不会再返回快递驿站、住宅小区、银行这类无关 POI。
const CATEGORIES = [
  { id: 'fastfood', name: '快餐便当', emoji: '🍱', kw: '快餐', amap: 'food' },
  { id: 'noodle', name: '面食米粉', emoji: '🍜', kw: '面馆', amap: 'food' },
  { id: 'chinese', name: '家常炒菜', emoji: '🥘', kw: '家常菜', amap: 'food' },
  { id: 'congee', name: '粥饭汤羹', emoji: '🥣', kw: '粥', amap: 'food' },
  { id: 'hotpot', name: '火锅串串', emoji: '🍲', kw: '火锅', amap: 'food' },
  { id: 'bbq', name: '烧烤炸物', emoji: '🍢', kw: '烧烤', amap: 'food' },
  { id: 'snack', name: '小吃早点', emoji: '🥟', kw: '小吃', amap: 'food' },
  { id: 'salad', name: '轻食沙拉', emoji: '🥗', kw: '轻食', amap: 'food' },
  { id: 'jpkr', name: '日韩料理', emoji: '🍣', kw: '日料', amap: 'food' },
  { id: 'sea', name: '东南亚菜', emoji: '🍛', kw: '东南亚菜', amap: 'food' },
  { id: 'bakery', name: '烘焙甜品', emoji: '🍰', kw: '蛋糕', amap: 'food' },
  { id: 'drink', name: '奶茶咖啡', emoji: '🧋', kw: '奶茶', amap: 'food' },
  { id: 'fruit', name: '水果生鲜', emoji: '🍎', kw: '水果店|生鲜', amap: 'shop' },
  { id: 'grocery', name: '生活杂货', emoji: '🛒', kw: '便利店|超市', amap: 'shop' },
];

// 预算分档（元/人）
const BUDGETS = [
  { id: 'b1', name: '10元内', min: 0, max: 10 },
  { id: 'b2', name: '10-20元', min: 10, max: 20 },
  { id: 'b3', name: '20-50元', min: 20, max: 50 },
  { id: 'b4', name: '50元以上', min: 50, max: 99999 },
];

// 标签
const TAGS = [
  { id: 'spicy', name: '辣的', emoji: '🌶️' },
  { id: 'veg', name: '素食', emoji: '🥬' },
  { id: 'protein', name: '高蛋白', emoji: '💪' },
  { id: 'lowcal', name: '低卡', emoji: '🪶' },
  { id: 'cheap', name: '省钱', emoji: '💰' },
  { id: 'fast', name: '快手', emoji: '⚡' },
];

// 口味偏好 / 忌口（用于自动排除）
const PREFERENCES = [
  { id: 'noSpicy', name: '不吃辣' },
  { id: 'noCoriander', name: '不吃香菜' },
  { id: 'noOnion', name: '不吃葱蒜' },
  { id: 'noSeafood', name: '海鲜过敏' },
  { id: 'noBeef', name: '不吃牛肉' },
  { id: 'noPork', name: '不吃猪肉' },
  { id: 'vegan', name: '素食主义' },
  { id: 'noMilk', name: '乳糖不耐' },
];

// 饮食目标
const GOALS = [
  { id: 'normal', name: '正常吃' },
  { id: 'losefat', name: '减脂期' },
  { id: 'gainmuscle', name: '增肌期' },
  { id: 'save', name: '省钱期' },
];

// ================= 菜品库 =================
// { name, price, cat, emoji, kcal, tags, exclude, scenes }
// exclude: 命中偏好 id 就排除；tags: 命中标签筛选
const DISHES = [
  // 早餐早点
  { name: '豆浆油条', price: 6, cat: 'snack', emoji: '🥛', kcal: 450, tags: ['cheap', 'fast'], exclude: ['vegan'], scenes: ['breakfast'] },
  { name: '煎饼果子', price: 8, cat: 'snack', emoji: '🫓', kcal: 520, tags: ['cheap', 'fast'], exclude: ['vegan'], scenes: ['breakfast'] },
  { name: '手抓饼加蛋', price: 7, cat: 'snack', emoji: '🥙', kcal: 480, tags: ['cheap', 'fast'], exclude: ['vegan'], scenes: ['breakfast'] },
  { name: '肉包子+小米粥', price: 9, cat: 'congee', emoji: '🥟', kcal: 430, tags: ['cheap'], exclude: ['vegan', 'noPork'], scenes: ['breakfast'] },
  { name: '茶叶蛋+牛奶', price: 8, cat: 'snack', emoji: '🥚', kcal: 320, tags: ['cheap', 'fast', 'protein'], exclude: ['vegan', 'noMilk'], scenes: ['breakfast'] },
  { name: '胡辣汤配油馍头', price: 10, cat: 'congee', emoji: '🥣', kcal: 510, tags: ['spicy', 'cheap'], exclude: ['noSpicy'], scenes: ['breakfast'] },
  { name: '豆腐脑+烧饼', price: 8, cat: 'snack', emoji: '🍮', kcal: 400, tags: ['cheap', 'veg'], exclude: [], scenes: ['breakfast'] },
  { name: '灌饼加肠', price: 9, cat: 'snack', emoji: '🌯', kcal: 550, tags: ['cheap', 'fast'], exclude: ['vegan'], scenes: ['breakfast'] },
  { name: '皮蛋瘦肉粥', price: 11, cat: 'congee', emoji: '🥣', kcal: 380, tags: ['fast'], exclude: ['vegan'], scenes: ['breakfast', 'night'] },
  { name: '小笼包一屉', price: 12, cat: 'snack', emoji: '🥟', kcal: 460, tags: [], exclude: ['vegan'], scenes: ['breakfast'] },

  // 午餐晚餐 · 快餐便当
  { name: '蛋炒饭', price: 14, cat: 'fastfood', emoji: '🍚', kcal: 680, tags: ['cheap', 'fast'], exclude: ['vegan'], scenes: ['lunch', 'dinner'] },
  { name: '黄焖鸡米饭', price: 18, cat: 'fastfood', emoji: '🍗', kcal: 850, tags: ['fast'], exclude: [], scenes: ['lunch', 'dinner'] },
  { name: '台湾卤肉饭', price: 17, cat: 'fastfood', emoji: '🍛', kcal: 820, tags: ['fast'], exclude: ['noPork'], scenes: ['lunch', 'dinner'] },
  { name: '番茄炒蛋盖饭', price: 15, cat: 'fastfood', emoji: '🍅', kcal: 620, tags: ['cheap', 'fast'], exclude: ['vegan'], scenes: ['lunch', 'dinner'] },
  { name: '青椒肉丝盖饭', price: 16, cat: 'fastfood', emoji: '🫑', kcal: 700, tags: ['fast'], exclude: ['vegan'], scenes: ['lunch', 'dinner'] },
  { name: '宫保鸡丁盖饭', price: 17, cat: 'fastfood', emoji: '🥜', kcal: 750, tags: ['spicy', 'fast'], exclude: ['noSpicy'], scenes: ['lunch', 'dinner'] },
  { name: '咖喱鸡饭', price: 19, cat: 'fastfood', emoji: '🍛', kcal: 800, tags: ['fast'], exclude: [], scenes: ['lunch', 'dinner'] },
  { name: '猪脚饭', price: 22, cat: 'fastfood', emoji: '🍖', kcal: 950, tags: ['protein'], exclude: ['noPork', 'vegan'], scenes: ['lunch', 'dinner'] },
  { name: '烤肉拌饭', price: 20, cat: 'fastfood', emoji: '🥘', kcal: 830, tags: ['protein'], exclude: ['vegan'], scenes: ['lunch', 'dinner'] },
  { name: '麻婆豆腐盖饭', price: 14, cat: 'fastfood', emoji: '🌶️', kcal: 640, tags: ['spicy', 'cheap', 'veg'], exclude: ['noSpicy'], scenes: ['lunch', 'dinner'] },

  // 面食米粉
  { name: '兰州拉面', price: 15, cat: 'noodle', emoji: '🍜', kcal: 600, tags: ['cheap', 'fast'], exclude: ['noBeef'], scenes: ['lunch', 'dinner'] },
  { name: '重庆小面', price: 13, cat: 'noodle', emoji: '🍜', kcal: 580, tags: ['spicy', 'cheap'], exclude: ['noSpicy'], scenes: ['lunch', 'dinner'] },
  { name: '酸辣粉', price: 12, cat: 'noodle', emoji: '🌶️', kcal: 520, tags: ['spicy', 'cheap', 'veg'], exclude: ['noSpicy'], scenes: ['lunch', 'snack'] },
  { name: '螺蛳粉', price: 16, cat: 'noodle', emoji: '🍜', kcal: 660, tags: ['spicy', 'veg'], exclude: ['noSpicy'], scenes: ['lunch', 'dinner', 'night'] },
  { name: '桂林米粉', price: 14, cat: 'noodle', emoji: '🍜', kcal: 590, tags: ['cheap'], exclude: [], scenes: ['lunch', 'dinner'] },
  { name: '武汉热干面', price: 12, cat: 'noodle', emoji: '🍜', kcal: 620, tags: ['cheap', 'fast'], exclude: [], scenes: ['breakfast', 'lunch'] },
  { name: '刀削面', price: 15, cat: 'noodle', emoji: '🍜', kcal: 640, tags: ['cheap'], exclude: [], scenes: ['lunch', 'dinner'] },
  { name: '炸酱面', price: 14, cat: 'noodle', emoji: '🍝', kcal: 670, tags: ['cheap'], exclude: ['noPork'], scenes: ['lunch', 'dinner'] },
  { name: '云吞面', price: 16, cat: 'noodle', emoji: '🥟', kcal: 560, tags: ['fast'], exclude: [], scenes: ['lunch', 'dinner'] },
  { name: '羊肉烩面', price: 20, cat: 'noodle', emoji: '🍜', kcal: 720, tags: [], exclude: [], scenes: ['lunch', 'dinner'] },

  // 家常炒菜
  { name: '鱼香肉丝', price: 22, cat: 'chinese', emoji: '🥡', kcal: 580, tags: ['spicy'], exclude: ['noSpicy', 'noPork'], scenes: ['dinner'] },
  { name: '麻婆豆腐', price: 18, cat: 'chinese', emoji: '🌶️', kcal: 420, tags: ['spicy', 'veg', 'cheap'], exclude: ['noSpicy'], scenes: ['dinner'] },
  { name: '回锅肉', price: 26, cat: 'chinese', emoji: '🥘', kcal: 750, tags: ['spicy'], exclude: ['noSpicy', 'noPork'], scenes: ['dinner'] },
  { name: '水煮肉片', price: 32, cat: 'chinese', emoji: '🥩', kcal: 820, tags: ['spicy', 'protein'], exclude: ['noSpicy'], scenes: ['dinner'] },
  { name: '红烧肉', price: 35, cat: 'chinese', emoji: '🍖', kcal: 980, tags: ['protein'], exclude: ['noPork'], scenes: ['dinner'] },
  { name: '宫保鸡丁', price: 28, cat: 'chinese', emoji: '🥜', kcal: 620, tags: ['spicy', 'protein'], exclude: ['noSpicy'], scenes: ['dinner'] },
  { name: '糖醋里脊', price: 30, cat: 'chinese', emoji: '🥓', kcal: 780, tags: [], exclude: ['noPork'], scenes: ['dinner'] },
  { name: '西红柿炒蛋', price: 16, cat: 'chinese', emoji: '🍅', kcal: 350, tags: ['veg', 'cheap'], exclude: ['vegan'], scenes: ['dinner'] },
  { name: '青椒肉丝', price: 22, cat: 'chinese', emoji: '🫑', kcal: 480, tags: [], exclude: ['vegan'], scenes: ['dinner'] },
  { name: '干煸豆角', price: 18, cat: 'chinese', emoji: '🫘', kcal: 320, tags: ['veg', 'spicy', 'cheap'], exclude: ['noSpicy'], scenes: ['dinner'] },

  // 粥饭汤羹
  { name: '小米南瓜粥', price: 8, cat: 'congee', emoji: '🥣', kcal: 220, tags: ['veg', 'cheap', 'lowcal'], exclude: [], scenes: ['breakfast', 'dinner', 'night'] },
  { name: '八宝粥', price: 9, cat: 'congee', emoji: '🥣', kcal: 280, tags: ['veg', 'cheap', 'lowcal'], exclude: [], scenes: ['breakfast', 'night'] },
  { name: '紫菜蛋花汤', price: 6, cat: 'congee', emoji: '🍲', kcal: 90, tags: ['veg', 'cheap', 'lowcal'], exclude: [], scenes: ['dinner'] },
  { name: '玉米排骨汤', price: 18, cat: 'congee', emoji: '🌽', kcal: 380, tags: ['lowcal', 'protein'], exclude: [], scenes: ['dinner'] },
  { name: '酸辣汤', price: 10, cat: 'congee', emoji: '🥣', kcal: 180, tags: ['spicy', 'cheap', 'lowcal'], exclude: ['noSpicy'], scenes: ['dinner', 'night'] },

  // 火锅串串
  { name: '麻辣烫', price: 16, cat: 'hotpot', emoji: '🍲', kcal: 700, tags: ['spicy', 'fast'], exclude: ['noSpicy'], scenes: ['lunch', 'dinner', 'night'] },
  { name: '冒菜', price: 18, cat: 'hotpot', emoji: '🥘', kcal: 680, tags: ['spicy'], exclude: ['noSpicy'], scenes: ['lunch', 'dinner'] },
  { name: '小火锅（单人）', price: 35, cat: 'hotpot', emoji: '🍲', kcal: 900, tags: ['protein'], exclude: [], scenes: ['dinner'] },
  { name: '关东煮', price: 15, cat: 'hotpot', emoji: '🍢', kcal: 350, tags: ['fast', 'lowcal'], exclude: [], scenes: ['snack', 'night'] },
  { name: '串串香（人均）', price: 45, cat: 'hotpot', emoji: '🍢', kcal: 950, tags: ['spicy', 'protein'], exclude: ['noSpicy'], scenes: ['dinner', 'night'] },

  // 烧烤炸物
  { name: '炸鸡排', price: 12, cat: 'bbq', emoji: '🍗', kcal: 620, tags: ['fast', 'protein'], exclude: [], scenes: ['snack', 'night'] },
  { name: '烤串（10串）', price: 25, cat: 'bbq', emoji: '🍢', kcal: 780, tags: ['spicy', 'protein'], exclude: ['noSpicy'], scenes: ['night'] },
  { name: '烤鸡翅（4个）', price: 16, cat: 'bbq', emoji: '🍗', kcal: 520, tags: ['protein'], exclude: [], scenes: ['snack', 'night'] },
  { name: '臭豆腐', price: 10, cat: 'bbq', emoji: '🟤', kcal: 380, tags: ['spicy', 'cheap', 'veg'], exclude: ['noSpicy'], scenes: ['snack', 'night'] },
  { name: '烤红薯', price: 8, cat: 'bbq', emoji: '🍠', kcal: 260, tags: ['veg', 'cheap', 'lowcal'], exclude: [], scenes: ['snack', 'night'] },
  { name: '韩式炸鸡', price: 32, cat: 'bbq', emoji: '🍗', kcal: 1050, tags: ['protein'], exclude: [], scenes: ['dinner', 'night'] },

  // 小吃
  { name: '凉皮', price: 10, cat: 'snack', emoji: '🥗', kcal: 420, tags: ['spicy', 'cheap', 'veg'], exclude: ['noSpicy'], scenes: ['lunch', 'snack'] },
  { name: '肉夹馍', price: 10, cat: 'snack', emoji: '🥙', kcal: 480, tags: ['cheap', 'fast'], exclude: ['noPork', 'vegan'], scenes: ['lunch', 'snack'] },
  { name: '烤冷面', price: 9, cat: 'snack', emoji: '🫓', kcal: 450, tags: ['spicy', 'cheap'], exclude: ['noSpicy'], scenes: ['snack', 'night'] },
  { name: '章鱼小丸子', price: 12, cat: 'snack', emoji: '🐙', kcal: 380, tags: ['fast'], exclude: ['noSeafood'], scenes: ['snack'] },
  { name: '生煎包（4只）', price: 11, cat: 'snack', emoji: '🥟', kcal: 480, tags: ['cheap'], exclude: ['vegan'], scenes: ['breakfast', 'snack'] },
  { name: '锅贴（8只）', price: 12, cat: 'snack', emoji: '🥟', kcal: 520, tags: ['cheap'], exclude: ['vegan'], scenes: ['snack'] },
  { name: '煎饼卷土豆丝', price: 8, cat: 'snack', emoji: '🌯', kcal: 420, tags: ['veg', 'cheap', 'fast'], exclude: [], scenes: ['breakfast', 'snack'] },

  // 轻食沙拉（减脂期主打）
  { name: '鸡胸肉沙拉', price: 25, cat: 'salad', emoji: '🥗', kcal: 320, tags: ['protein', 'lowcal'], exclude: [], scenes: ['lunch', 'dinner'] },
  { name: '牛肉蔬菜沙拉', price: 28, cat: 'salad', emoji: '🥗', kcal: 380, tags: ['protein', 'lowcal'], exclude: ['noBeef'], scenes: ['lunch', 'dinner'] },
  { name: '藜麦杂粮碗', price: 26, cat: 'salad', emoji: '🥣', kcal: 350, tags: ['veg', 'lowcal'], exclude: [], scenes: ['lunch'] },
  { name: '全麦三明治', price: 18, cat: 'salad', emoji: '🥪', kcal: 320, tags: ['lowcal', 'fast'], exclude: [], scenes: ['breakfast', 'lunch'] },
  { name: '金枪鱼沙拉', price: 27, cat: 'salad', emoji: '🥗', kcal: 340, tags: ['protein', 'lowcal'], exclude: ['noSeafood'], scenes: ['lunch'] },

  // 日韩料理
  { name: '寿司拼盘', price: 28, cat: 'jpkr', emoji: '🍣', kcal: 480, tags: ['lowcal'], exclude: ['noSeafood'], scenes: ['lunch', 'dinner'] },
  { name: '日式拉面', price: 32, cat: 'jpkr', emoji: '🍜', kcal: 720, tags: [], exclude: [], scenes: ['lunch', 'dinner'] },
  { name: '咖喱猪排饭', price: 30, cat: 'jpkr', emoji: '🍛', kcal: 900, tags: ['protein'], exclude: ['noPork'], scenes: ['lunch', 'dinner'] },
  { name: '石锅拌饭', price: 28, cat: 'jpkr', emoji: '🥘', kcal: 750, tags: ['spicy'], exclude: ['noSpicy'], scenes: ['lunch', 'dinner'] },
  { name: '部队火锅', price: 45, cat: 'jpkr', emoji: '🍲', kcal: 880, tags: ['spicy'], exclude: ['noSpicy'], scenes: ['dinner'] },
  { name: '天妇罗盖饭', price: 32, cat: 'jpkr', emoji: '🍤', kcal: 820, tags: [], exclude: ['noSeafood'], scenes: ['lunch', 'dinner'] },

  // 东南亚菜
  { name: '冬阴功汤', price: 32, cat: 'sea', emoji: '🍤', kcal: 380, tags: ['spicy'], exclude: ['noSpicy', 'noSeafood'], scenes: ['dinner'] },
  { name: '泰式炒河粉', price: 26, cat: 'sea', emoji: '🍝', kcal: 680, tags: ['spicy'], exclude: ['noSpicy'], scenes: ['lunch', 'dinner'] },
  { name: '咖喱鸡配饭', price: 28, cat: 'sea', emoji: '🍛', kcal: 780, tags: [], exclude: [], scenes: ['lunch', 'dinner'] },
  { name: '越南河粉', price: 28, cat: 'sea', emoji: '🍜', kcal: 520, tags: ['lowcal'], exclude: [], scenes: ['lunch', 'dinner'] },
  { name: '沙爹肉串', price: 24, cat: 'sea', emoji: '🍢', kcal: 560, tags: ['protein'], exclude: [], scenes: ['dinner', 'night'] },

  // 烘焙甜品
  { name: '蛋挞（2只）', price: 8, cat: 'bakery', emoji: '🥧', kcal: 320, tags: ['cheap', 'fast'], exclude: ['noMilk', 'vegan'], scenes: ['tea'] },
  { name: '提拉米苏', price: 18, cat: 'bakery', emoji: '🍰', kcal: 450, tags: [], exclude: ['noMilk', 'vegan'], scenes: ['tea'] },
  { name: '肉松小贝（2只）', price: 12, cat: 'bakery', emoji: '🧁', kcal: 380, tags: ['fast'], exclude: ['vegan'], scenes: ['tea'] },
  { name: '芝士蛋糕', price: 22, cat: 'bakery', emoji: '🍰', kcal: 520, tags: [], exclude: ['noMilk', 'vegan'], scenes: ['tea'] },
  { name: '泡芙（3只）', price: 10, cat: 'bakery', emoji: '🥐', kcal: 360, tags: ['cheap'], exclude: ['noMilk', 'vegan'], scenes: ['tea'] },
  { name: '全麦欧包', price: 12, cat: 'bakery', emoji: '🍞', kcal: 280, tags: ['lowcal', 'veg'], exclude: [], scenes: ['breakfast', 'tea'] },

  // 奶茶咖啡
  { name: '珍珠奶茶', price: 10, cat: 'drink', emoji: '🧋', kcal: 380, tags: ['cheap', 'fast'], exclude: ['noMilk'], scenes: ['tea'] },
  { name: '杨枝甘露', price: 16, cat: 'drink', emoji: '🥭', kcal: 320, tags: [], exclude: ['noMilk'], scenes: ['tea'] },
  { name: '生椰拿铁', price: 13, cat: 'drink', emoji: '☕', kcal: 180, tags: ['fast'], exclude: ['noMilk'], scenes: ['breakfast', 'tea'] },
  { name: '美式咖啡', price: 10, cat: 'drink', emoji: '☕', kcal: 15, tags: ['lowcal', 'fast', 'cheap'], exclude: [], scenes: ['breakfast', 'tea'] },
  { name: '柠檬茶', price: 8, cat: 'drink', emoji: '🍋', kcal: 120, tags: ['lowcal', 'cheap', 'fast'], exclude: [], scenes: ['tea'] },
  { name: '酸奶水果捞', price: 18, cat: 'drink', emoji: '🍓', kcal: 260, tags: ['lowcal'], exclude: ['noMilk'], scenes: ['tea'] },

  // 水果生鲜
  { name: '水果切盒', price: 15, cat: 'fruit', emoji: '🍉', kcal: 180, tags: ['lowcal', 'veg', 'fast'], exclude: [], scenes: ['tea', 'night'] },
  { name: '鲜切果盘（大份）', price: 25, cat: 'fruit', emoji: '🍇', kcal: 260, tags: ['lowcal', 'veg'], exclude: [], scenes: ['tea'] },
  { name: '烤玉米', price: 6, cat: 'fruit', emoji: '🌽', kcal: 160, tags: ['veg', 'cheap', 'lowcal'], exclude: [], scenes: ['snack', 'night'] },

  // 生活杂货
  { name: '关东煮+饭团套餐', price: 16, cat: 'grocery', emoji: '🍙', kcal: 520, tags: ['fast'], exclude: [], scenes: ['breakfast', 'night'] },
  { name: '泡面加蛋加肠', price: 12, cat: 'grocery', emoji: '🍜', kcal: 620, tags: ['cheap', 'fast'], exclude: [], scenes: ['night'] },
  { name: '速冻水饺（15只）', price: 14, cat: 'grocery', emoji: '🥟', kcal: 680, tags: ['cheap'], exclude: [], scenes: ['dinner', 'night'] },

  // 菜系代表菜（让「菜系」筛选每个档位都有菜可抽）
  { name: '剁椒鱼头', price: 58, cat: 'chinese', emoji: '🐟', kcal: 620, tags: ['spicy'], exclude: ['noSpicy', 'noSeafood'], scenes: ['lunch', 'dinner'] },
  { name: '农家小炒肉', price: 32, cat: 'chinese', emoji: '🥩', kcal: 780, tags: ['spicy'], exclude: ['noSpicy', 'noPork'], scenes: ['lunch', 'dinner'] },
  { name: '把子肉', price: 26, cat: 'chinese', emoji: '🍖', kcal: 850, tags: [], exclude: ['noPork'], scenes: ['lunch', 'dinner'] },
  { name: '锅包肉', price: 34, cat: 'chinese', emoji: '🍖', kcal: 880, tags: [], exclude: ['noPork'], scenes: ['lunch', 'dinner'] },
  { name: '地三鲜', price: 22, cat: 'chinese', emoji: '🥔', kcal: 520, tags: ['veg', 'cheap'], exclude: [], scenes: ['lunch', 'dinner'] },
  { name: '东坡肉', price: 42, cat: 'chinese', emoji: '🍖', kcal: 950, tags: [], exclude: ['noPork'], scenes: ['lunch', 'dinner'] },
  { name: '羊肉泡馍', price: 28, cat: 'chinese', emoji: '🍲', kcal: 830, tags: [], exclude: [], scenes: ['lunch', 'dinner'] },
  { name: '大盘鸡', price: 58, cat: 'chinese', emoji: '🍗', kcal: 1100, tags: ['spicy'], exclude: ['noSpicy'], scenes: ['lunch', 'dinner'] },
  { name: '过桥米线', price: 26, cat: 'noodle', emoji: '🍜', kcal: 620, tags: [], exclude: [], scenes: ['lunch', 'dinner'] },
  { name: '酸汤鱼', price: 52, cat: 'chinese', emoji: '🐟', kcal: 700, tags: ['spicy'], exclude: ['noSpicy', 'noSeafood'], scenes: ['lunch', 'dinner'] },
  { name: '煲仔饭', price: 26, cat: 'fastfood', emoji: '🍚', kcal: 780, tags: [], exclude: ['noPork'], scenes: ['lunch', 'dinner'] },
  { name: '白切鸡', price: 38, cat: 'chinese', emoji: '🐔', kcal: 620, tags: ['protein'], exclude: [], scenes: ['lunch', 'dinner'] },
  { name: '牛肉汉堡', price: 28, cat: 'fastfood', emoji: '🍔', kcal: 750, tags: [], exclude: ['noBeef'], scenes: ['lunch', 'dinner'] },
  { name: '肠粉', price: 12, cat: 'snack', emoji: '🥟', kcal: 380, tags: ['cheap'], exclude: [], scenes: ['breakfast', 'lunch'] },
];

/**
 * 按当前条件过滤菜品
 * @param {object} f { scene, catIds:[], cuisineId, budgetId, tagIds:[], prefs:[], goal }
 */
function filterDishes(f) {
  return DISHES.filter((d) => {
    // 场景（不限则全过）
    if (f.scene && d.scenes.indexOf(f.scene) < 0) return false;
    // 品类多选
    if (f.catIds && f.catIds.length && d.cat && f.catIds.indexOf(d.cat) < 0) return false;
    // 菜系单选（「其他菜」= 判不出菜系的那些）
    if (f.cuisineId && cuisine.ofDish(d) !== f.cuisineId) return false;
    // 预算
    if (f.budgetId) {
      const b = BUDGETS.find((x) => x.id === f.budgetId);
      if (b && (d.price < b.min || d.price > b.max)) return false;
    }
    // 标签多选（全部满足）
    if (f.tagIds && f.tagIds.length) {
      for (const t of f.tagIds) {
        if (d.tags.indexOf(t) < 0) return false;
      }
    }
    // 忌口排除
    if (f.prefs && f.prefs.length) {
      for (const p of f.prefs) {
        if (d.exclude.indexOf(p) >= 0) return false;
      }
    }
    // 饮食目标
    if (f.goal === 'losefat' && d.kcal > 500) return false;
    if (f.goal === 'save' && d.price > 20) return false;
    return true;
  });
}

/** 按当前时间推荐场景 */
function currentScene() {
  const h = new Date().getHours();
  for (const s of SCENES) {
    if (s.hours.length === 2 && h >= s.hours[0] && h < s.hours[1]) return s.id;
  }
  return 'lunch';
}

/** 根据抽中菜品生成「去附近找这类商家」的搜索关键词 */
function dishSearchKeyword(dish) {
  const cat = CATEGORIES.find((c) => c.id === dish.cat);
  return cat ? cat.kw : dish.name;
}

module.exports = {
  SCENES, CATEGORIES, BUDGETS, TAGS, PREFERENCES, GOALS, DISHES, CUISINES: cuisine.CUISINES,
  filterDishes, currentScene, dishSearchKeyword, cuisine,
};
