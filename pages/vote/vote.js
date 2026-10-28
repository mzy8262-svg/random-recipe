const data = require('../../utils/data');
const store = require('../../utils/store');

/**
 * 多人一起选（投票）
 * 思路：本机先抽出 4 个候选（符合当前偏好），
 * 参与者在同一台手机上依次点自己想吃的，实时显示得票，
 * 也可以点「分享」把候选发给朋友让 TA 们各自表态。
 */
Page({
  data: {
    candidates: [],
    votes: {},      // name -> 票数
    voterCount: 0,
    finished: false,
    winner: null,
    voterName: '',
  },

  onLoad() {
    this.buildCandidates();
  },

  buildCandidates() {
    const prefs = store.getPrefs();
    const goal = store.getGoal();
    const pool = data.filterDishes({ prefs, goal });
    const picked = [];
    const used = {};
    while (picked.length < 4 && picked.length < pool.length) {
      const i = Math.floor(Math.random() * pool.length);
      if (!used[i]) { used[i] = true; picked.push(pool[i]); }
    }
    const votes = {};
    picked.forEach((p) => (votes[p.name] = 0));
    this.setData({ candidates: picked, votes, voterCount: 0, finished: false, winner: null });
  },

  onNameInput(e) {
    this.setData({ voterName: e.detail.value });
  },

  vote(e) {
    if (this.data.finished) return;
    const name = e.currentTarget.dataset.name;
    const votes = Object.assign({}, this.data.votes);
    if (votes[name] == null) return;
    votes[name]++;
    this.setData({ votes, voterCount: this.data.voterCount + 1 });
    wx.showToast({ title: (this.data.voterName || '朋友') + ' 投了 ' + name, icon: 'none' });
  },

  finishVote() {
    if (!this.data.voterCount) {
      wx.showToast({ title: '还没人投票呢', icon: 'none' });
      return;
    }
    let winner = null, max = -1;
    Object.keys(this.data.votes).forEach((k) => {
      if (this.data.votes[k] > max) { max = this.data.votes[k]; winner = k; }
    });
    const dish = this.data.candidates.find((c) => c.name === winner);
    this.setData({ finished: true, winner: dish });
  },

  resetVote() {
    this.buildCandidates();
  },

  onShareAppMessage() {
    const names = this.data.candidates.map((c) => c.name).join('、');
    return {
      title: '今天吃什么？帮我在「' + names + '」里选一个！',
      path: '/pages/vote/vote',
    };
  },
});
