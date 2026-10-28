/**
 * 本地存储：口味偏好 / 忌口 / 饮食目标 / 抽签历史
 */
const KEYS = {
  prefs: 'rs_prefs',
  goal: 'rs_goal',
  history: 'rs_history',
  loc: 'rs_last_loc',
};

function getPrefs() {
  return wx.getStorageSync(KEYS.prefs) || [];
}

function setPrefs(prefs) {
  wx.setStorageSync(KEYS.prefs, prefs || []);
}

function getGoal() {
  return wx.getStorageSync(KEYS.goal) || 'normal';
}

function setGoal(goal) {
  wx.setStorageSync(KEYS.goal, goal || 'normal');
}

/** 抽签历史（最多留 50 条） */
function getHistory() {
  return wx.getStorageSync(KEYS.history) || [];
}

function addHistory(dish) {
  const h = getHistory();
  h.unshift({ name: dish.name, price: dish.price, kcal: dish.kcal, emoji: dish.emoji, time: Date.now() });
  wx.setStorageSync(KEYS.history, h.slice(0, 50));
}

/** 最近一次定位，用于秒开 */
function getLastLoc() {
  return wx.getStorageSync(KEYS.loc) || null;
}

function setLastLoc(loc) {
  wx.setStorageSync(KEYS.loc, loc);
}

module.exports = { getPrefs, setPrefs, getGoal, setGoal, getHistory, addHistory, getLastLoc, setLastLoc };
