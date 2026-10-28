App({
  globalData: {
    // 当前定位 { lat, lng, address, source }
    location: null,
    // 定位来源说明：gps / ip / address / cache
    locSource: '',
    // 当前查看的商家（首页 -> 详情页）
    currentMerchant: null,
    // 详情页「就吃这个」带回来的菜，首页 onShow 消费后清空
    pickedDish: null,
  },

  onLaunch() {
    // 启动时恢复上次定位，秒开体验
    try {
      const store = require('./utils/store');
      const last = store.getLastLoc();
      if (last && last.lat && last.lng) {
        this.globalData.location = last;
        this.globalData.locSource = last.source || 'cache';
      }
    } catch (e) {
      // 读缓存失败不影响启动
    }
  },
});
