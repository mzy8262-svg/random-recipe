const data = require('../../utils/data');
const store = require('../../utils/store');

Page({
  data: {
    prefs: data.PREFERENCES,
    goals: data.GOALS,
    selectedPrefs: [],
    prefOn: {}, // 预计算选中表：WXML 不支持 indexOf
    selectedGoal: 'normal',
    history: [],
    historyVisible: false,
  },

  onLoad() {
    const selectedPrefs = store.getPrefs();
    this.setData({
      selectedPrefs,
      prefOn: this.toOnMap(selectedPrefs),
      selectedGoal: store.getGoal(),
    });
  },

  toOnMap(list) {
    const map = {};
    (list || []).forEach((id) => { map[id] = true; });
    return map;
  },

  onShow() {
    this.setData({ history: store.getHistory() });
  },

  togglePref(e) {
    const id = e.currentTarget.dataset.id;
    const arr = this.data.selectedPrefs.slice();
    const i = arr.indexOf(id);
    if (i >= 0) arr.splice(i, 1); else arr.push(id);
    this.setData({ selectedPrefs: arr, prefOn: this.toOnMap(arr) });
    store.setPrefs(arr); // 即时保存，抽签页立即生效
  },

  pickGoal(e) {
    const id = e.currentTarget.dataset.id;
    this.setData({ selectedGoal: id });
    store.setGoal(id);
  },

  toggleHistory() {
    this.setData({ historyVisible: !this.data.historyVisible });
  },

  clearHistory() {
    wx.showModal({
      title: '清空抽签历史？',
      success: (res) => {
        if (res.confirm) {
          wx.setStorageSync('rs_history', []);
          this.setData({ history: [] });
        }
      },
    });
  },

  clearAll() {
    wx.showModal({
      title: '重置所有偏好？',
      content: '忌口、饮食目标、抽签历史都会清空',
      success: (res) => {
        if (res.confirm) {
          store.setPrefs([]);
          store.setGoal('normal');
          wx.setStorageSync('rs_history', []);
          this.setData({ selectedPrefs: [], prefOn: {}, selectedGoal: 'normal', history: [] });
          wx.showToast({ title: '已重置', icon: 'success' });
        }
      },
    });
  },

  onShareAppMessage() {
    return {
      title: '随机食谱 — 忌口也能安心抽，附近 5km 真实商家',
      path: '/pages/index/index',
    };
  },
});
