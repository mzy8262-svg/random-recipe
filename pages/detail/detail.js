const geo = require('../../utils/geo');
const menuLib = require('../../utils/menu');
const poi = require('../../utils/poi');
const jump = require('../../utils/jump');

Page({
  data: {
    merchant: null,
    photos: [],
    distText: '',
    travelText: '',
    dishes: [],
    menuKind: 'none', // seed | amap | none
    menuSource: '',
    mapMarkers: [],
    hasPhone: false,
    copyPanel: { show: false, title: '', text: '' },
  },

  onShow() {
    // 复制失败时改为弹「可长按选中」的面板（C 方案），而不是普通弹窗
    jump.setCopyFallback((text, title) => {
      this.setData({ copyPanel: { show: true, title: title || '复制失败', text: text || '' } });
    });
  },

  onUnload() {
    jump.setCopyFallback(null);
  },

  closeCopyPanel() {
    this.setData({ 'copyPanel.show': false });
  },

  noop() {},

  onLoad() {
    const m = getApp().globalData.currentMerchant;
    if (!m) {
      wx.showToast({ title: '商家信息丢失，请返回重试', icon: 'none' });
      setTimeout(() => wx.navigateBack(), 900);
      return;
    }
    // 统一成类型安全的商家结构（高德字段可能是 []，直接展示会变成空白）
    const merchant = poi.normalizePoi({
      id: m.id,
      name: m.name,
      address: m.address,
      location: m.lat && m.lng ? m.lng + ',' + m.lat : '',
      distance: m.distance,
      tel: m.tel,
      type: m.type,
      typecode: m.typecode,
      keytag: m.cuisine,
      tag: (m.dishes || []).join(','),
      photos: (m.photos || []).map((u) => ({ url: u })),
      biz_ext: { rating: m.rating, cost: m.cost, opentime2: m.openTime },
    });

    const loc = getApp().globalData.location;
    const dist = merchant.distance != null
      ? merchant.distance
      : (loc && loc.lat && merchant.lat ? geo.distanceMeters(loc.lat, loc.lng, merchant.lat, merchant.lng) : null);

    const menu = menuLib.buildMenu(merchant);

    const markers = [];
    if (merchant.lat && merchant.lng) {
      markers.push({
        id: 1,
        latitude: merchant.lat,
        longitude: merchant.lng,
        title: merchant.name,
        width: 32,
        height: 32,
      });
    }

    this.setData({
      merchant,
      photos: merchant.photos,
      distText: geo.formatDistance(dist),
      travelText: dist != null ? geo.travelHint(dist) : '',
      dishes: menu.dishes,
      menuKind: menu.kind,
      menuSource: menu.source,
      mapMarkers: markers,
      hasPhone: !!poi.firstTel(merchant.tel),
    });
  },

  previewPhoto(e) {
    const idx = Number(e.currentTarget.dataset.idx) || 0;
    const urls = this.data.photos;
    if (!urls.length) return;
    wx.previewImage({ current: urls[idx], urls });
  },

  openLocation() {
    const m = this.data.merchant;
    if (!m || !m.lat || !m.lng) {
      wx.showToast({ title: '这家店没有坐标，可以复制地址再导航', icon: 'none' });
      return;
    }
    wx.openLocation({
      latitude: m.lat,
      longitude: m.lng,
      name: m.name,
      address: m.address || '',
      scale: 16,
    });
  },

  /** 复制店名（有地址就一起复制），成功/失败都给明确反馈 */
  copyAddress() {
    const m = this.data.merchant;
    if (!m || !m.name) return;
    const addr = (m.address && m.address !== '地址未登记') ? m.address : '';
    const text = [m.name, addr].filter(Boolean).join('\n');
    return jump.copyText(text, '已复制店名：' + m.name);
  },

  /** 只复制地址（地址行右侧按钮用） */
  copyAddrOnly() {
    const m = this.data.merchant;
    const addr = (m && m.address) || '';
    return jump.copyText(addr, '已复制地址：' + addr);
  },

  /** 只复制店名（按钮/长按用） */
  copyName() {
    const m = this.data.merchant;
    if (!m || !m.name) return;
    return jump.copyText(m.name, '已复制店名：' + m.name);
  },

  callPhone() {
    const m = this.data.merchant;
    const phone = poi.firstTel(m && m.tel);
    if (!phone) {
      wx.showToast({ title: '该商家没有登记电话', icon: 'none' });
      return;
    }
    wx.makePhoneCall({ phoneNumber: phone });
  },

  /** 菜品不再只是“贴图”：点一下可以选中/复制 */
  onDishTap(e) {
    const idx = Number(e.currentTarget.dataset.idx);
    const dish = this.data.dishes[idx];
    if (!dish) return;
    const m = this.data.merchant;
    wx.showActionSheet({
      itemList: ['就吃这个，记到首页', '复制菜名', '去美团搜这道菜', '去淘宝搜这道菜'],
      success: (res) => {
        if (res.tapIndex === 0) {
          getApp().globalData.pickedDish = {
            name: dish.name,
            emoji: dish.emoji || '🍽️',
            merchantId: m.id,
            merchantName: m.name,
          };
          wx.showToast({ title: '已记下：' + dish.name, icon: 'none' });
          setTimeout(() => wx.navigateBack(), 500);
        } else if (res.tapIndex === 1) {
          wx.setClipboardData({ data: dish.name });
        } else if (res.tapIndex === 2) {
          jump.openMeituan(dish.name);
        } else if (res.tapIndex === 3) {
          jump.copyForTaobao(dish.name);
        }
      },
    });
  },

  /** 去美团看这家店的实时价格（跳转失败会自动复制店名并弹窗指引） */
  onOpenMeituan() {
    const m = this.data.merchant;
    return jump.openMeituan((m && m.name) || '');
  },

  /** 复制店名，去淘宝/淘宝闪购里搜（微信内打不开淘宝） */
  onCopyForTaobao() {
    const m = this.data.merchant;
    return jump.copyForTaobao((m && m.name) || '');
  },

  onShareAppMessage() {
    const m = this.data.merchant;
    return {
      title: m ? ('附近发现：' + m.name + '，一起去？') : '随机食谱',
      path: '/pages/index/index',
    };
  },
});
