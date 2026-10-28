const amap = require('../../utils/amap');
const data = require('../../utils/data');
const geo = require('../../utils/geo');
const store = require('../../utils/store');
const config = require('../../utils/config');
const poi = require('../../utils/poi');
const dishpool = require('../../utils/dishpool');
const jump = require('../../utils/jump');

Page({
  data: {
    // 定位
    locText: '定位中…',
    locSourceText: '',
    locState: 'loading', // loading | ok | fail
    locFailText: '',
    locHint: '', // 定位精度提示（如“IP 定位只到城市，建议地图选点”）
    addrInput: '',
    showAddrBox: false,
    addrResults: [],

    // 网络状态：false 时只能做本地功能（抽签、筛选、投票），定位和附近商家需要联网
    online: true,

    // 范围（0.3/0.5km 用于“就在楼下/同一栋楼”的精确定位场景）
    radiusSteps: config.RADIUS_STEPS.map((km) => ({
      km,
      label: km < 1 ? Math.round(km * 1000) + 'm' : km + 'km',
    })),
    radius: 1,
    listTip: '',
    copyPanel: { show: false, title: '', text: '' },

    // 筛选
    scenes: data.SCENES,
    categories: data.CATEGORIES,
    cuisines: data.CUISINES,
    budgets: data.BUDGETS,
    tags: data.TAGS,
    scene: data.currentScene(),
    catIds: [],
    catOn: {}, // WXML 里不能用 indexOf，用预计算的选中表驱动高亮
    cuisineId: '', // 菜系单选（川菜/湘菜/粤菜…其他菜）
    budgetId: '',
    tagIds: [],
    tagOn: {},

    // 抽签
    slotText: '点击下方按钮，让随机食谱帮你决定',
    slotRunning: false,
    result: null, // { dish, reason, merchants, fromDetail }
    resultLoading: false,
    resultEmpty: false,
    poolCount: 0,
    poolSourceText: '', // 菜品池来源：范围内商家菜单 / 内置菜库

    // 商家列表
    merchants: [],
    loadingMerchants: false,
    exhausted: false,
    page: 1,
    sortBy: 'distance',
    sortIndex: 0,
    sortOptions: [
      { id: 'distance', name: '距离最近' },
      { id: 'rating', name: '评分最高' },
      { id: 'cost', name: '人均最低' },
    ],

    // 范围内菜品全览（把范围内所有商家的推荐菜列出来，点一下就能选中）
    rangeDishRows: [],
    rangeDishPreview: [],
    rangeDishTotal: 0,
    showAllRangeDishes: false,
    rangeDishesLoading: false,
  },

  onLoad() {
    this.refreshPool();
    this.watchNetwork();
    this.initLocation();
  },

  onShow() {
    // 复制失败时改用「可长按选中」的面板（C 方案）
    jump.setCopyFallback((text, title) => {
      this.setData({ copyPanel: { show: true, title: title || '复制失败', text: text || '' } });
    });
    // 从偏好页回来后，抽签池要按新忌口重算
    this.refreshPool();
    // 从商家详情页点了「就吃这道」
    this.consumePickedDish();
  },

  onPullDownRefresh() {
    const done = () => wx.stopPullDownRefresh();
    this.refreshPool();
    if (this.data.locState === 'ok') {
      this.loadMerchants(true).then(done, done);
    } else {
      this.initLocation(true).then(done, done);
    }
  },

  // ================= 网络 =================
  /**
   * 断网时抽签、筛选、投票都还能用（菜库全部打包在代码包里），
   * 但定位、附近商家、导航必须联网。这里把状态显式告诉用户，
   * 避免断网时看起来像"按钮坏了"。
   */
  watchNetwork() {
    const apply = (online) => {
      if (online === this.data.online) return;
      this.setData({ online });
      if (online) {
        this.setData({ locHint: '' });
        if (this.data.locState === 'ok') this.loadMerchants(true);
        else this.initLocation();
      } else {
        this.setData({ locHint: '当前没有网络：抽签、筛选可用；定位和附近商家需要联网' });
      }
    };

    if (typeof wx.getNetworkType === 'function') {
      wx.getNetworkType({
        success: (res) => {
          if (res && res.networkType) apply(res.networkType !== 'none');
        },
        fail: () => {},
      });
    }

    if (typeof wx.onNetworkStatusChange === 'function') {
      this._onNetChange = (res) => apply(!!(res && res.isConnected));
      wx.onNetworkStatusChange(this._onNetChange);
    }
  },

  // ================= 定位 =================
  /**
   * 微信 2023 年起要求用户先同意「隐私保护指引」才能调 getLocation/位置相关接口，
   * 没处理时真机上会直接 fail（errMsg 带 privacy），页面就永远停在「定位中…」。
   * 这里在定位前主动检查并拉起授权弹窗。
   */
  ensurePrivacy() {
    return new Promise((resolve, reject) => {
      if (!wx.getPrivacySetting) {
        resolve();
        return;
      }
      wx.getPrivacySetting({
        success: (res) => {
          if (!res || !res.needAuthorization) {
            resolve();
            return;
          }
          wx.requirePrivacyAuthorize({
            success: () => resolve(),
            fail: () => reject(new Error('privacy')),
          });
        },
        fail: () => resolve(),
      });
    });
  },

  /**
   * 取 GPS 坐标。微信单次 getLocation 有时只给到几百米精度，
   * 所以：先要高精度；精度仍差（>200m）时用持续定位再收 3 秒，取最准的一次。
   */
  getGpsLocation() {
    return new Promise((resolve, reject) => {
      if (typeof wx.getLocation !== 'function') {
        reject(new Error('当前微信版本不支持定位'));
        return;
      }
      wx.getLocation({
        type: 'gcj02',
        isHighAccuracy: true,
        highAccuracyExpireTime: 8000,
        success: (res) => {
          const acc = Number(res && res.accuracy) || 0;
          if (acc > 200 && typeof wx.startLocationUpdate === 'function' && typeof wx.onLocationChange === 'function') {
            this.collectBetterGps(res).then(resolve, () => resolve(res));
          } else {
            resolve(res);
          }
        },
        fail: (err) => {
          // 高精度超时/失败时，退回普通定位再试一次（室内、老机型常见）
          wx.getLocation({
            type: 'gcj02',
            success: resolve,
            fail: () => reject(err),
          });
        },
      });
    });
  },

  /** 持续定位 3 秒，挑 accuracy 最小的（最准的）一次 */
  collectBetterGps(fallback) {
    return new Promise((resolve) => {
      let best = fallback;
      let finished = false;
      let timer = null;
      const onChange = (r) => {
        const acc = Number(r && r.accuracy) || 0;
        const bestAcc = Number(best && best.accuracy) || 99999;
        if (r && r.latitude && r.longitude && (!acc || acc < bestAcc)) best = r;
        if (acc && acc <= 60) finish(); // 够准了，提前结束
      };
      const cleanup = () => {
        finished = true;
        if (timer) clearTimeout(timer);
        if (typeof wx.offLocationChange === 'function') wx.offLocationChange(onChange);
        if (typeof wx.stopLocationUpdate === 'function') wx.stopLocationUpdate({ fail() {} });
      };
      function finish() {
        if (finished) return;
        cleanup();
        resolve(best);
      }
      wx.startLocationUpdate({
        success: () => {
          wx.onLocationChange(onChange);
          timer = setTimeout(finish, 3000);
        },
        fail: () => resolve(fallback),
      });
    });
  },

  async initLocation(force) {
    // 1) 先用上次定位秒开
    const cached = store.getLastLoc();
    if (cached && this.isValidLoc(cached)) {
      this.applyLocation(cached, { skipLoad: !!force });
    }
    this.setData({ locState: 'loading', locFailText: '' });

    // 2) 隐私授权 -> GPS
    let gpsRes = null;
    try {
      await this.ensurePrivacy();
      gpsRes = await this.getGpsLocation();
    } catch (e) {
      const msg = String((e && e.errMsg) || (e && e.message) || '');
      if (msg === 'privacy') {
        this.setData({
          locState: 'fail',
          locFailText: '需要同意隐私保护指引才能使用定位，已先用网络定位',
        });
      } else if (/auth deny|authorize|denied/i.test(msg)) {
        this.setData({
          locState: 'fail',
          locFailText: '定位权限被拒绝，点右侧「去开启」可重新授权',
        });
      }
      // GPS 不可用 -> IP 定位兜底
      await this.locateByIp();
      return;
    }

    const loc = {
      lat: gpsRes.latitude,
      lng: gpsRes.longitude,
      source: 'gps',
      address: '',
      accuracy: Number(gpsRes.accuracy) || null,
    };
    try {
      // 逆地理用更大半径，街道/乡镇信息更稳
      const rg = await amap.regeo(loc.lng + ',' + loc.lat);
      loc.address = this.addressFromRegeo(rg);
    } catch (e) { /* 逆地理失败不影响定位 */ }
    this.applyLocation(loc);
  },

  isValidLoc(loc) {
    return !!(loc && isFinite(loc.lat) && isFinite(loc.lng) && Math.abs(loc.lat) > 0.0001 && Math.abs(loc.lng) > 0.0001);
  },

  addressFromRegeo(rg) {
    const rc = rg && rg.regeocode;
    if (!rc) return '';
    const comp = rc.addressComponent || {};
    const city = poi.toStr(comp.city) || poi.toStr(comp.province);
    const district = poi.toStr(comp.district);
    const township = poi.toStr(comp.township);
    const street = poi.toStr(comp.street);
    const number = poi.toStr(comp.streetNumber);
    let text = (city + district + (township || street || '')).trim();
    if (text && number) text += number;
    if (text) return text;
    return poi.toStr(rc.formatted_address);
  },

  async locateByIp() {
    try {
      const d = await amap.ipLocate();
      const rect = poi.toStr(d.rectangle).split(';');
      let lat = 0;
      let lng = 0;
      if (rect.length === 2) {
        const p1 = rect[0].split(',');
        const p2 = rect[1].split(',');
        lng = (parseFloat(p1[0]) + parseFloat(p2[0])) / 2;
        lat = (parseFloat(p1[1]) + parseFloat(p2[1])) / 2;
      }
      if (!isFinite(lat) || !isFinite(lng) || !lat || !lng) throw new Error('IP 定位无效');
      const loc = {
        lat,
        lng,
        source: 'ip',
        address: poi.toStr(d.city) || poi.toStr(d.province),
      };
      this.applyLocation(loc, { keepFailTip: true });
    } catch (e) {
      this.setData({
        locState: 'fail',
        locFailText: this.data.locFailText || '定位失败，可点「搜地址」手动选择位置',
      });
      this.refreshPool(); // 定位失败也要能抽签（只是搜不了附近商家）
    }
  },

  applyLocation(loc, opts) {
    const o = opts || {};
    if (!this.isValidLoc(loc)) {
      this.setData({ locState: 'fail', locFailText: '定位失败，可点「搜地址」手动选择位置' });
      return;
    }
    const app = getApp();
    const prev = app.globalData.location;
    const moved = !prev || Math.abs(prev.lat - loc.lat) > 0.0005 || Math.abs(prev.lng - loc.lng) > 0.0005;
    app.globalData.location = loc;
    app.globalData.locSource = loc.source;
    store.setLastLoc(loc);

    // 把“有多准”直接告诉用户：GPS 精度多少米、IP 只到城市
    const acc = Number(loc.accuracy) || 0;
    const accText = acc
      ? ' · 精度约 ±' + (acc >= 1000 ? (acc / 1000).toFixed(1) + 'km' : Math.round(acc) + 'm')
      : '';
    const srcName = {
      gps: 'GPS 定位' + accText,
      ip: '网络定位 · 城市级（可能偏差几公里）',
      address: '地址搜索',
      map: '地图选点',
      cache: '上次定位',
    }[loc.source] || '';

    let hint = '';
    if (loc.source === 'ip') {
      hint = 'IP 定位只能到城市，点「地图选点」可以精确到楼下（推荐）';
    } else if (loc.source === 'gps' && acc > 150) {
      hint = '当前精度约 ±' + Math.round(acc) + 'm，点「地图选点」可精确选位置';
    }

    this.setData({
      locText: loc.address || (loc.lat.toFixed(4) + ',' + loc.lng.toFixed(4)),
      locSourceText: srcName,
      locHint: o.keepFailTip ? (this.data.locHint || hint) : hint,
      locState: 'ok',
      locFailText: o.keepFailTip ? this.data.locFailText : '',
    });
    // 首次进入时，缓存定位和 GPS 定位常常是同一个点（moved=false），
    // 只靠 moved 判断会导致“定位成功但附近商家列表一直空着”，所以列表为空时也要拉一次。
    const needFirstLoad = !moved && !this.data.merchants.length && !this.data.loadingMerchants;
    if (!o.skipLoad && (moved || needFirstLoad)) this.loadMerchants(true);
  },

  onRelocate() {
    this.setData({ locText: '定位中…', locSourceText: '', locState: 'loading', locFailText: '', locHint: '' });
    this.initLocation(true);
  },

  onOpenSetting() {
    wx.openSetting({
      success: () => this.onRelocate(),
      fail: () => wx.showToast({ title: '打开设置失败，请在系统设置里允许定位', icon: 'none' }),
    });
  },

  /**
   * 地图选点：用户在地图上拖着选，最准（不受 GPS 漂移影响），
   * GPS 精度差、IP 定位、或在商场/校区里分不清楼时用这个。
   */
  onChooseOnMap() {
    if (typeof wx.chooseLocation !== 'function') {
      wx.showToast({ title: '当前微信版本不支持地图选点', icon: 'none' });
      return;
    }
    wx.chooseLocation({
      success: (r) => {
        if (!r || !isFinite(r.latitude) || !isFinite(r.longitude)) {
          wx.showToast({ title: '没有选中位置，再试一次', icon: 'none' });
          return;
        }
        this.applyLocation({
          lat: r.latitude,
          lng: r.longitude,
          source: 'map',
          address: poi.toStr(r.name) || poi.toStr(r.address) || '地图选点位置',
          accuracy: null,
        });
      },
      fail: (e) => {
        const msg = String((e && e.errMsg) || '');
        if (/cancel/i.test(msg)) return;
        const auth = /auth|permission|privacy/i.test(msg);
        wx.showToast({
          title: auth ? '需要位置权限才能地图选点' : '地图选点失败，可改用「搜地址」',
          icon: 'none',
        });
      },
    });
  },

  // 地址搜索（输入地址 -> 坐标）
  toggleAddrBox() {
    this.setData({ showAddrBox: !this.data.showAddrBox, addrResults: [] });
  },

  onAddrInput(e) {
    this.setData({ addrInput: e.detail.value });
  },

  async onAddrSearch() {
    const kw = (this.data.addrInput || '').trim();
    if (!kw) return;
    wx.showLoading({ title: '搜索中…' });
    try {
      let results = [];
      const d = await amap.placeText(kw);
      results = (d.pois || []).map((p) => this.addrFromPoi(p)).filter(Boolean);
      // 地点搜索没有结果时，用地理编码再兜一次（行政区/道路更准）
      if (!results.length) {
        const g = await amap.geocode(kw);
        results = (g.geocodes || []).map((item) => {
          const ll = poi.toStr(item.location).split(',');
          const lat = parseFloat(ll[1]);
          const lng = parseFloat(ll[0]);
          if (!isFinite(lat) || !isFinite(lng)) return null;
          return {
            name: poi.toStr(item.formatted_address) || kw,
            address: [poi.toStr(item.province), poi.toStr(item.city), poi.toStr(item.district)].join(' '),
            lat,
            lng,
          };
        }).filter(Boolean);
      }
      this.setData({ addrResults: results.slice(0, 8) });
      if (!results.length) wx.showToast({ title: '没找到这个地址，换个说法试试', icon: 'none' });
    } catch (e) {
      wx.showToast({ title: e.message || '搜索失败', icon: 'none' });
    } finally {
      wx.hideLoading();
    }
  },

  addrFromPoi(p) {
    const ll = poi.toStr(p.location).split(',');
    const lat = parseFloat(ll[1]);
    const lng = parseFloat(ll[0]);
    if (!isFinite(lat) || !isFinite(lng)) return null;
    return { name: poi.toStr(p.name), address: poi.toStr(p.address), lat, lng };
  },

  onPickAddr(e) {
    const idx = Number(e.currentTarget.dataset.idx);
    const r = this.data.addrResults[idx];
    if (!r) return;
    this.applyLocation({ lat: r.lat, lng: r.lng, source: 'address', address: r.name });
    this.setData({ showAddrBox: false, addrInput: '', addrResults: [] });
  },

  // ================= 筛选 =================
  onPickScene(e) {
    const id = e.currentTarget.dataset.id;
    this.setData({ scene: this.data.scene === id ? '' : id });
    this.refreshPool();
  },

  // 把 id 数组转成 { id: true } 的选中表，供 WXML 直接判断（WXML 不支持 indexOf 之类的函数调用）
  toOnMap(list) {
    const map = {};
    (list || []).forEach((id) => { map[id] = true; });
    return map;
  },

  onPickCat(e) {
    const id = e.currentTarget.dataset.id;
    const arr = this.data.catIds.slice();
    const i = arr.indexOf(id);
    if (i >= 0) arr.splice(i, 1);
    else arr.push(id);
    this.setData({ catIds: arr, catOn: this.toOnMap(arr) });
    this.refreshPool();
    this.loadMerchants(true);
  },

  // 菜系：单选，再点一下取消；同时影响抽签菜库和附近商家搜索关键词
  onPickCuisine(e) {
    const id = e.currentTarget.dataset.id;
    const cu = this.data.cuisines.find((x) => x.id === id) || {};
    const next = this.data.cuisineId === id ? '' : id;
    this.setData({ cuisineId: next });
    this.refreshPool();

    // 只选了菜系但当前时段没这类菜：自动放开时段，否则用户只会看到「可选 0 道菜」
    if (next && !this.pool.length && this.data.scene) {
      this.setData({ scene: '' });
      this.refreshPool();
      if (this.pool.length) {
        wx.showToast({ title: '这个时段没有' + cu.name + '，已取消时段限制', icon: 'none' });
      }
    }
    if (next && !this.pool.length) {
      wx.showToast({ title: cu.name + '暂时没有符合条件的菜，放宽预算/要求再试', icon: 'none' });
    }
    this.loadMerchants(true);
  },

  clearCuisine() {
    this.setData({ cuisineId: '' });
    this.refreshPool();
    this.loadMerchants(true);
  },

  // 按菜系快抽：点一下 = 选中该菜系 + 立刻在这类菜里随机抽一道
  onQuickCuisine(e) {
    const id = e.currentTarget.dataset.id;
    const cu = this.data.cuisines.find((x) => x.id === id) || {};
    this.setData({ cuisineId: id });
    this.refreshPool();

    // 这个时段没有该菜系的菜时，自动放开「什么时候吃」，别让用户觉得点了没反应
    if (!this.pool.length && this.data.scene) {
      this.setData({ scene: '' });
      this.refreshPool();
      if (this.pool.length) {
        wx.showToast({ title: '这个时段没有' + cu.name + '，已取消时段限制', icon: 'none' });
      }
    }
    if (!this.pool.length) {
      wx.showToast({ title: cu.name + '暂时没有符合条件的菜，放宽预算/要求再试', icon: 'none' });
      return;
    }
    if (this.data.slotRunning) return; // 正在抽就等它抽完，不叠加动画
    this.loadMerchants(true);
    this.spin();
  },

  onPickBudget(e) {
    const id = e.currentTarget.dataset.id;
    this.setData({ budgetId: this.data.budgetId === id ? '' : id });
    this.refreshPool();
  },

  onPickTag(e) {
    const id = e.currentTarget.dataset.id;
    const arr = this.data.tagIds.slice();
    const i = arr.indexOf(id);
    if (i >= 0) arr.splice(i, 1);
    else arr.push(id);
    this.setData({ tagIds: arr, tagOn: this.toOnMap(arr) });
    this.refreshPool();
  },

  onRadius(e) {
    const km = parseFloat(e.currentTarget.dataset.km);
    if (!isFinite(km) || km <= 0) return;
    this.setData({ radius: Math.min(km, config.MAX_RADIUS_KM) });
    this.loadMerchants(true);
    this.refreshPool();
  },

  radiusText() {
    const step = (config.RADIUS_STEPS || []).find((k) => Math.abs(k - this.data.radius) < 1e-9);
    const km = step == null ? this.data.radius : step;
    return km < 1 ? Math.round(km * 1000) + 'm' : km + 'km';
  },

  centerText() {
    const loc = getApp().globalData.location || {};
    const src = {
      gps: '当前精准定位',
      map: '地图选点位置',
      address: '搜索的地址',
      cache: '上次定位',
      ip: '网络定位中心',
    }[loc.source] || '定位点';
    return src;
  },

  clearCats() {
    this.setData({ catIds: [], catOn: {} });
    this.refreshPool();
    this.loadMerchants(true);
  },

  // ================= 抽签 =================
  refreshPool() {
    const prefs = store.getPrefs();
    const goal = store.getGoal();
    const filters = {
      scene: this.data.scene,
      catIds: this.data.catIds,
      cuisineId: this.data.cuisineId,
      budgetId: this.data.budgetId,
      tagIds: this.data.tagIds,
      prefs,
      goal,
    };

    // ① 优先用「所选范围内商家真实菜单」：这样抽到的菜，附近一定有店能做
    let pool = [];
    let source = 'lib';
    if (this.rangeDishes && this.rangeDishes.length) {
      pool = dishpool.filter(this.rangeDishes, filters);
      if (pool.length) source = 'range';
    }

    // ② 范围内商家没菜单 / 没对上筛选条件时，退回内置菜库，并在界面说明原因
    if (!pool.length) {
      pool = data.filterDishes(filters);
      source = this.rangeDishes && this.rangeDishes.length ? 'lib-fallback' : 'lib';
    }

    this.pool = pool;
    this.dishSource = source;
    this.setData({
      poolCount: pool.length,
      poolSourceText: source === 'range'
        ? '范围内商家菜单'
        : (source === 'lib-fallback' ? '范围内没匹配的菜单，用内置菜库' : ''),
    });
  },

  spin() {
    if (this.data.slotRunning) return;
    if (!this.pool || !this.pool.length) {
      wx.showToast({ title: '当前条件下没有可选菜品，放宽筛选试试', icon: 'none' });
      return;
    }
    this.setData({ slotRunning: true, result: null, resultEmpty: false });

    // 老虎机滚动动画：快速闪过随机菜名，逐步减速后定格
    let t = 0;
    const total = 18;
    const step = () => {
      t++;
      const pick = this.pool[Math.floor(Math.random() * this.pool.length)];
      this.setData({ slotText: pick.emoji + ' ' + pick.name });
      if (t < total) {
        const delay = 60 + Math.pow(t / total, 2) * 400;
        this._timer = setTimeout(step, delay);
      } else {
        this.finishSpin();
      }
    };
    step();
  },

  finishSpin() {
    const dish = this.pool[Math.floor(Math.random() * this.pool.length)];
    const sceneName = this.data.scene ? (this.data.scenes.find((s) => s.id === this.data.scene) || {}).name : '';
    const reasons = [];
    if (sceneName) reasons.push(sceneName + '时段');
    if (this.data.budgetId) {
      const b = this.data.budgets.find((x) => x.id === this.data.budgetId);
      if (b) reasons.push('预算 ' + b.name);
    }
    if (this.data.tagIds.length) {
      reasons.push(this.data.tagIds.map((t) => (this.data.tags.find((x) => x.id === t) || {}).name).join('/'));
    }
    if (this.data.cuisineId) {
      const cu = this.data.cuisines.find((x) => x.id === this.data.cuisineId);
      if (cu) reasons.push(cu.name);
    }
    reasons.push(this.data.radius + 'km 内');
    if (this.dishSource === 'range') reasons.push('范围内商家菜单');
    store.addHistory(dish);

    // 菜来自范围内某家店的真实菜单时，直接把那家店摆在结果里（不用再猜关键词去搜）
    let direct = null;
    if (dish.merId) {
      direct = (this.data.merchants || []).find((m) => m.id === dish.merId) || null;
    }

    this.setData({
      slotText: dish.emoji + ' ' + dish.name,
      slotRunning: false,
      result: {
        dish,
        reason: '因为你选了：' + (reasons.join(' · ') || '随便什么'),
        merchants: direct ? [direct] : [],
        fromDetail: false,
      },
      resultEmpty: false,
    });

    // 抽中后找附近能吃到这个的商家（范围内菜单来源时已经知道是哪家店，跳过）
    if (!direct) this.findMerchantsForDish(dish);
  },

  // 从商家详情页带回来的「就吃这道」
  consumePickedDish() {
    const app = getApp();
    const picked = app.globalData.pickedDish;
    if (!picked) return;
    app.globalData.pickedDish = null;
    const emoji = picked.emoji || '🍽️';
    this.setData({
      slotText: emoji + ' ' + picked.name,
      slotRunning: false,
      result: {
        dish: { name: picked.name, emoji, price: null, kcal: null },
        reason: '你在「' + (picked.merchantName || '商家') + '」选了这道菜',
        merchants: [],
        fromDetail: true,
        merchantName: picked.merchantName || '',
        merchantId: picked.merchantId || '',
      },
      resultEmpty: false,
    });
  },

  async findMerchantsForDish(dish) {
    const loc = getApp().globalData.location;
    if (!loc || !loc.lat) {
      this.setData({ resultEmpty: true });
      return;
    }
    const cat = data.CATEGORIES.find((c) => c.id === dish.cat);
    const isShop = !!(cat && cat.amap === 'shop');
    const kw = data.dishSearchKeyword(dish) || dish.name;
    this.setData({ resultLoading: true, resultEmpty: false });
    // 找“附近能吃到这道菜的店”时至少搜 1km，避免用户把范围调到 300m 后什么都搜不到
    const dishRadius = Math.max(this.data.radius * 1000, 1000);
    try {
      const d = isShop
        ? await amap.aroundShop(loc.lng + ',' + loc.lat, dishRadius, { keywords: kw, offset: 5 })
        : await amap.aroundFood(loc.lng + ',' + loc.lat, dishRadius, { keywords: kw, offset: 5 });
      const list = (d.pois || [])
        .filter((p) => (isShop ? poi.isShopPoi(p) : poi.isFoodPoi(p)))
        .slice(0, 3)
        .map((p) => {
          const m = poi.normalizePoi(p);
          m.distText = geo.formatDistance(m.distance);
          return m;
        });
      this.setData({ 'result.merchants': list, resultLoading: false, resultEmpty: !list.length });
    } catch (e) {
      this.setData({ resultLoading: false, resultEmpty: true });
    }
  },

  // ================= 商家列表 =================
  /**
   * 分类 + 菜系 -> 高德查询参数。
   * 不选分类时只搜「餐饮服务(050000)」，这一步是「快递驿站混进列表」的根因修复；
   * 水果生鲜/生活杂货走「购物服务(060000)」，所以可能拆成两组并发请求。
   * 菜系有关键词时（如川菜），餐饮组的 keywords 用菜系关键词，这样列表里只出现该菜系的店。
   */
  buildQueryGroups(catIds, cuisineId) {
    const ids = catIds || [];
    const cats = ids
      .map((id) => data.CATEGORIES.find((c) => c.id === id))
      .filter(Boolean);
    const cuisineKw = data.cuisine.keywordOf(cuisineId); // 「其他菜」为空串
    if (!cats.length) {
      return [{ types: config.AMAP_TYPES.FOOD, keywords: cuisineKw }];
    }
    const food = cats.filter((c) => c.amap !== 'shop');
    const shop = cats.filter((c) => c.amap === 'shop');
    const groups = [];
    if (food.length || cuisineKw) {
      groups.push({
        types: config.AMAP_TYPES.FOOD,
        keywords: cuisineKw || food.map((c) => c.kw).join('|'),
      });
    }
    if (shop.length) {
      groups.push({ types: config.AMAP_TYPES.SHOP, keywords: shop.map((c) => c.kw).join('|') });
    }
    return groups;
  },

  // 并发请求一组查询，并把 POI 清洗成商家行；返回 { rows, exhausted }
  async searchGroups(groups, loc, page) {
    const results = await Promise.all(
      groups.map((g) => amap.aroundSearch(loc.lng + ',' + loc.lat, this.data.radius * 1000, {
        types: g.types,
        keywords: g.keywords,
        page,
        offset: config.PAGE_SIZE,
      }))
    );
    const rows = [];
    results.forEach((d, gi) => {
      const group = groups[gi];
      const isShopGroup = group.types === config.AMAP_TYPES.SHOP;
      (d.pois || []).forEach((p) => {
        // 双保险：即使高德仍返回无关 POI，也在这里过滤掉（快递驿站/住宅/银行等）
        if (isShopGroup) {
          if (!poi.isShopPoi(p)) return;
        } else if (!poi.isFoodPoi(p)) {
          return;
        }
        rows.push(poi.normalizePoi(p));
      });
    });
    const exhausted = results.every((d) => ((d.pois || []).length < config.PAGE_SIZE));
    return { rows, exhausted };
  },

  async loadMerchants(reset) {
    const loc = getApp().globalData.location;
    if (!loc || !loc.lat || !loc.lng) {
      this.setData({ locState: this.data.locState === 'fail' ? 'fail' : 'loading', listTip: '' });
      return Promise.resolve();
    }
    if (this.data.loadingMerchants && !reset) return Promise.resolve();

    const seq = (this._reqSeq = (this._reqSeq || 0) + 1);
    const page = reset ? 1 : (this.data.page || 1) + 1;
    const cuisineKw = data.cuisine.keywordOf(this.data.cuisineId);
    const cuisineName = (this.data.cuisines.find((c) => c.id === this.data.cuisineId) || {}).name || '';
    this.setData({ loadingMerchants: true, exhausted: false, rangeDishesLoading: reset });

    const groups = this.buildQueryGroups(this.data.catIds, this.data.cuisineId);

    try {
      if (reset) {
        // 先把第一页（25 家）画出来，后面几页在后台补全：用户不用盯着转圈等 5 秒
        const r = await this.searchGroups(groups, loc, 1);
        if (seq !== this._reqSeq) return;

        let rows = r.rows;
        let exhausted = r.exhausted;
        let tipPrefix = '';

        // 附近没有该菜系的店时，退回「全部餐饮」，避免列表整片空白
        if (!rows.length && cuisineKw) {
          const fb = await this.searchGroups(this.buildQueryGroups(this.data.catIds, ''), loc, 1);
          if (seq !== this._reqSeq) return;
          if (fb.rows.length) {
            rows = fb.rows;
            exhausted = fb.exhausted;
            tipPrefix = '附近没搜到「' + cuisineName + '」的店，先显示全部餐饮 · ';
          }
        }

        this.applyMerchantRows(rows, true, 1, exhausted, tipPrefix);
        // 后台继续翻第 2~8 页，把「范围内所有商家 + 菜品」补全
        this._deepPromise = this.deepLoadMerchants(groups, loc, seq, 2);
        return;
      }

      const r = await this.searchGroups(groups, loc, page);
      if (seq !== this._reqSeq) return;
      this.applyMerchantRows(r.rows, false, page, r.exhausted, '');
    } catch (e) {
      if (seq !== this._reqSeq) return;
      this.setData({ loadingMerchants: false, rangeDishesLoading: false });
      if (reset) this.showRequestError(e);
      else wx.showToast({ title: (e && e.message) || '加载更多失败', icon: 'none', duration: 2500 });
    }
  },

  /**
   * 把一页（或合并后）的商家写进界面，同时重建抽签池和「范围内菜品」列表
   * @param {Array} rows 本次新增的商家
   * @param {boolean} reset true=替换列表，false=追加
   */
  applyMerchantRows(rows, reset, page, pageExhausted, tipPrefix) {
    const loc = getApp().globalData.location || {};
    const seen = {};
    const merged = [];
    const prev = reset ? [] : (this.data.merchants || []);
    prev.concat(rows || []).forEach((m) => {
      if (!m || !m.id || seen[m.id]) return;
      seen[m.id] = true;
      if (!m.lat || !m.lng) return;
      // 距离以“当前定位点”为准重算（高德缺 distance 时兜底，避免出现空距离）
      if (m.distance == null || !isFinite(m.distance)) {
        m.distance = Math.round(geo.distanceMeters(loc.lat, loc.lng, m.lat, m.lng));
      }
      m.distText = geo.formatDistance(m.distance);
      m.walkText = m.distance != null ? geo.travelHint(m.distance) : '';
      merged.push(m);
    });

    const exhausted = !!pageExhausted || merged.length >= config.MAX_MERCHANT_ROWS;
    const sorted = this.sortMerchants(merged).slice(0, config.MAX_MERCHANT_ROWS);
    const sortName = (this.data.sortOptions[this.data.sortIndex] || {}).name || '距离最近';
    this.setData({
      merchants: sorted,
      page,
      loadingMerchants: false,
      exhausted,
      listTip: (tipPrefix || '') + '以' + this.centerText() + '为中心 · ' + this.radiusText() + '内 · '
        + sorted.length + ' 家 · ' + sortName,
    });

    // 用「范围内商家的真实菜单」重建抽签池：抽到的菜，附近一定有店能做
    this.rangeDishes = dishpool.build(sorted);
    this.buildRangeDishRows();
    this.refreshPool();
  },

  /**
   * 后台深度翻页：把范围内第 2~8 页商家也拉下来（高德个人 Key 有 QPS 限制，必须节流）
   */
  async deepLoadMerchants(groups, loc, seq, fromPage) {
    const maxPage = config.MAX_PAGES || 8;
    const delay = config.DEEP_PAGE_DELAY_MS || 420;
    let page = fromPage;
    while (page <= maxPage && seq === this._reqSeq && this.data.merchants.length < config.MAX_MERCHANT_ROWS) {
      await new Promise((resolve) => setTimeout(resolve, delay));
      if (seq !== this._reqSeq) return;

      let r = null;
      for (let attempt = 0; attempt < 2; attempt++) {
        try {
          r = await this.searchGroups(groups, loc, page);
          break;
        } catch (e) {
          const msg = (e && e.message) || '';
          if (attempt === 1 || !/CUQPS|频繁|TOO_FREQUENT/i.test(msg)) return;
          await new Promise((resolve) => setTimeout(resolve, 800));
        }
      }
      if (!r) return;

      this.applyMerchantRows(r.rows, false, page, r.exhausted, '');
      if (r.exhausted) return;
      if (this.data.merchants.length >= config.MAX_MERCHANT_ROWS) return;
      page++;
    }
  },

  /** 生成「范围内菜品」列表（前 12 条预览 + 全量列表） */
  buildRangeDishRows() {
    const all = (this.rangeDishes || []).map((d, i) => ({
      idx: i,
      name: d.name,
      emoji: d.emoji,
      priceText: d.price != null ? '¥' + d.price : '到店看价',
      merName: d.merName || '',
      merDisText: d.merDistance != null ? geo.formatDistance(d.merDistance) : '',
    }));
    this.setData({
      rangeDishRows: all,
      rangeDishPreview: all.slice(0, 12),
      rangeDishTotal: all.length,
      rangeDishesLoading: false,
    });
  },

  onToggleRangeDishes() {
    this.setData({ showAllRangeDishes: !this.data.showAllRangeDishes });
  },

  /** 点「范围内菜品」里的一道菜 = 直接选中它，并把能做的店摆在结果里 */
  onTapRangeDish(e) {
    const idx = Number(e.currentTarget.dataset.idx);
    const dish = (this.rangeDishes || [])[idx];
    if (!dish) return;
    const merchant = (this.data.merchants || []).find((m) => m.id === dish.merId) || null;
    store.addHistory(dish);
    this.setData({
      slotText: dish.emoji + ' ' + dish.name,
      slotRunning: false,
      result: {
        dish,
        reason: '你从「范围内菜品」里选了这道菜',
        merchants: merchant ? [merchant] : [],
        fromDetail: false,
      },
      resultEmpty: false,
    });
    if (wx.pageScrollTo) this.scrollToSlotCard();
  },

  /** 选中菜后滚到抽签卡，让用户一眼看到结果（避免停在页面最顶上看不到） */
  scrollToSlotCard() {
    const to = (top) => wx.pageScrollTo({ scrollTop: Math.max(0, top - 20), duration: 250 });
    const q = (this.createSelectorQuery && this.createSelectorQuery()) || wx.createSelectorQuery();
    if (!q) {
      wx.pageScrollTo({ scrollTop: 0, duration: 250 });
      return;
    }
    q.select('.slot-card').boundingClientRect();
    q.selectViewport().scrollOffset();
    q.exec((res) => {
      const rect = res && res[0];
      const off = res && res[1];
      if (rect && off && typeof rect.top === 'number') to(off.scrollTop + rect.top);
      else wx.pageScrollTo({ scrollTop: 0, duration: 250 });
    });
  },

  showRequestError(e) {
    const msg = (e && e.message) || '加载失败，请重试';
    if (/合法域名|域名/.test(msg)) {
      wx.showModal({
        title: '网络请求被拦截',
        content: '请在小程序后台「开发管理 → 开发设置 → 服务器域名 → request 合法域名」里添加 https://restapi.amap.com（开发者工具里勾选“不校验合法域名”即可先调试）。',
        showCancel: false,
      });
      return;
    }
    if (!this.data.online || /网络|timeout|超时|fail/i.test(msg)) {
      this.setData({ online: false, listTip: '' });
      wx.showToast({
        title: '网络不可用：抽签还能用，附近商家需要联网',
        icon: 'none',
        duration: 3000,
      });
      return;
    }
    wx.showToast({ title: msg, icon: 'none', duration: 3000 });
  },

  sortMerchants(list) {
    const s = this.data.sortBy;
    const arr = list.slice();
    if (s === 'distance') arr.sort((a, b) => (a.distance == null ? 99999 : a.distance) - (b.distance == null ? 99999 : b.distance));
    if (s === 'rating') arr.sort((a, b) => (b.rating || 0) - (a.rating || 0));
    if (s === 'cost') arr.sort((a, b) => (a.cost == null ? 99999 : a.cost) - (b.cost == null ? 99999 : b.cost));
    return arr;
  },

  onSortChange(e) {
    const idx = Number(e.detail.value);
    const opt = this.data.sortOptions[idx];
    if (!opt) return;
    this.setData({ sortBy: opt.id, sortIndex: idx, merchants: this.sortMerchants(this.data.merchants) });
    if (this.data.merchants.length) {
      this.setData({
        listTip: '以' + this.centerText() + '为中心 · ' + this.radiusText() + '内 · '
          + this.data.merchants.length + ' 家 · ' + opt.name,
      });
    }
  },

  loadMore() {
    if (this.data.exhausted || this.data.loadingMerchants) return;
    this.loadMerchants(false);
  },

  goDetail(e) {
    const idx = Number(e.currentTarget.dataset.idx);
    const m = this.data.merchants[idx];
    if (!m) return;
    if (!m.lat || !m.lng) {
      wx.showToast({ title: '这家店没有坐标，无法导航', icon: 'none' });
      return;
    }
    getApp().globalData.currentMerchant = m;
    wx.navigateTo({ url: '/pages/detail/detail' });
  },

  /** 附近商家行上的「美团」按钮：跳美团小程序，失败自动复制店名 */
  onOpenMeituan(e) {
    const name = (e.currentTarget.dataset && e.currentTarget.dataset.name) || '';
    return jump.openMeituan(name);
  },

  /** 抽签结果里优先用「店名」（附近能吃到的那家），没有店名才退回菜名 */
  resultTargetName() {
    const r = this.data.result;
    if (!r) return '';
    const first = (r.merchants || [])[0];
    if (first && first.name) return first.name;
    return (r.dish && r.dish.name) || '';
  },

  closeCopyPanel() {
    this.setData({ 'copyPanel.show': false });
  },

  noop() {},

  /** 「去淘宝闪购」：先问是否复制店名，复制后引导去淘宝 App 搜 */
  onCopyForTaobao(e) {
    const name = (e.currentTarget.dataset && e.currentTarget.dataset.name) || this.resultTargetName();
    if (!name) {
      wx.showToast({ title: '没拿到店名，先抽一个菜或打开一家店', icon: 'none' });
      return Promise.resolve();
    }
    return jump.copyForTaobao(name);
  },

  /** 去美团看价：有店名就搜店，没有店名才用菜名 */
  onOpenMeituanDish() {
    const name = this.resultTargetName();
    if (!name) {
      wx.showToast({ title: '先抽一个菜，再点这个按钮', icon: 'none' });
      return Promise.resolve();
    }
    return jump.openMeituan(name);
  },

  goDetailFromResult(e) {
    const idx = Number(e.currentTarget.dataset.idx);
    const m = (this.data.result && this.data.result.merchants) || [];
    const item = m[idx];
    if (!item) return;
    getApp().globalData.currentMerchant = item;
    wx.navigateTo({ url: '/pages/detail/detail' });
  },

  onShareAppMessage() {
    const r = this.data.result;
    return {
      title: r ? ('随机食谱帮我决定了：' + r.dish.name + '！') : '随机食谱 — 不知道吃什么？让老虎机帮你决定',
      path: '/pages/index/index',
    };
  },

  onUnload() {
    jump.setCopyFallback(null);
    if (this._timer) {
      clearTimeout(this._timer);
      clearInterval(this._timer);
      this._timer = null;
    }
    if (this._onNetChange && typeof wx.offNetworkStatusChange === 'function') {
      wx.offNetworkStatusChange(this._onNetChange);
      this._onNetChange = null;
    }
  },
});
