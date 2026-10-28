/**
 * 外部平台跳转（美团看价 / 淘宝闪购）
 *
 * 设计原则：
 *   1) 点按钮先问一句「要不要复制店名？」——是：复制后再跳；否：直接跳（淘宝则给出平台限制的说明）。
 *   2) 美团：有 appId 就真跳；跳失败/没配置/基础库不支持 → 自动复制店名 + 弹窗指引，绝不出现「点了没反应」。
 *   3) 淘宝：微信里没有淘宝小程序、也打不开淘宝链接（平台限制），只能复制店名去淘宝 App 搜，
 *      所以按钮会先把「复制店名」这一步问清楚，不复制也会明确告诉用户为什么打不开。
 *
 * 注意：wx.navigateToMiniProgram 必须由用户点击（或点击后的模态框确认）触发，不能自动跳。
 */
const config = require('./config');

function appConf(key) {
  return (config.EXTERNAL_APPS || {})[key] || null;
}

/** 去掉多余空白，防止复制到奇怪字符 */
function clean(text) {
  return String(text == null ? '' : text).replace(/\s+/g, ' ').trim();
}

/** 弹「是否复制店名」：resolve 'copy' | 'skip' */
function askCopy(name, opts) {
  const o = opts || {};
  const kw = clean(name);
  const title = o.title || '要复制店名吗？';
  const content = o.content
    || ('将复制：' + (kw || '（这家店）') + '\n复制后可直接在美团/淘宝里粘贴搜索（不复制也能继续）');
  return new Promise((resolve) => {
    if (!wx.showModal) return resolve('skip');
    wx.showModal({
      title: title,
      content: content,
      confirmText: o.confirmText || '复制并继续',
      cancelText: o.cancelText || '不复制',
      success: (res) => resolve(res && res.confirm ? 'copy' : 'skip'),
      fail: () => resolve('skip'),
    });
  });
}

/** 只复制：失败自动重试一次；返回 Promise<boolean>（不依赖读回校验，避免误报失败） */
function copyOnly(text) {
  const data = clean(text);
  if (!data) return Promise.resolve(false);
  const write = () => new Promise((resolve) => {
    if (!wx.setClipboardData) return resolve(false);
    wx.setClipboardData({
      data: data,
      success: () => resolve(true),
      fail: () => resolve(false),
    });
  });
  return write().then((ok) => (ok ? true : write()));
}

/**
 * 复制失败时的展示方式：
 * 默认用 wx.showModal（弹窗里的字不一定能长按选中）；
 * 页面可以注册一个「可选中文本面板」，把要复制的内容用 <text user-select> 显示出来，让用户手动选。
 */
let copyFallback = null;

function setCopyFallback(fn) {
  copyFallback = typeof fn === 'function' ? fn : null;
}

function copyFail(text, title, content) {
  const data = clean(text);
  if (copyFallback) {
    try {
      copyFallback(data, title || '复制失败', content || '请长按下面的文字，手动选择复制');
      return;
    } catch (e) {
      /* 面板出错就退回弹窗 */
    }
  }
  tipModal(title || '复制失败', content || ('请手动记下：' + data));
}

/** 复制一段文本，并给出明确反馈（成功 toast / 失败弹窗），返回 Promise<boolean> */
function copyText(text, okTitle) {
  const data = clean(text);
  if (!data) {
    tipModal('没拿到可复制的文字', '先抽一个菜或打开一家店，再点复制。');
    return Promise.resolve(false);
  }
  return copyOnly(data).then((ok) => {
    if (ok) {
      if (wx.showToast) wx.showToast({ title: okTitle || ('已复制：' + data), icon: 'none', duration: 2000 });
      return true;
    }
    copyFail(data, '复制失败', '剪贴板不可用，请长按下面的文字手动选择复制');
    return false;
  });
}

function tipModal(title, content, confirmText) {
  if (wx.showModal) {
    wx.showModal({ title: title, content: content, showCancel: false, confirmText: confirmText || '知道了' });
  } else if (wx.showToast) {
    wx.showToast({ title: title, icon: 'none' });
  }
}

/** 复制 + 弹窗指引（兜底路径） */
function copyWithTip(text, title, content) {
  const kw = clean(text);
  if (!kw) {
    tipModal('没拿到店名', '先抽一个菜/打开一家店，再点这个按钮；也可以直接在微信里搜店名。');
    return Promise.resolve({ jumped: false, copied: false });
  }
  return copyOnly(kw).then((ok) => {
    if (ok) {
      tipModal(title || '店名已复制', content || ('已复制「' + kw + '」，去对应 App 粘贴搜索即可。'));
      return { jumped: false, copied: true };
    }
    copyFail(kw, '复制失败', '剪贴板不可用，请长按下面的文字手动选择复制');
    return { jumped: false, copied: false };
  });
}

/**
 * 去美团看价：先问是否复制店名 → 是则复制后跳转，否直接跳转；跳失败自动降级为复制 + 指引
 * @param {string} keyword 店名（或菜名）
 */
async function openMeituan(keyword) {
  const kw = clean(keyword);
  const conf = appConf('meituan') || {};
  const choice = await askCopy(kw, {
    title: '去美团看价',
    content: '将复制：' + (kw || '（这家店）') + '\n\n「复制并跳转」：先复制店名，再打开美团，进店直接粘贴搜索\n「直接跳转」：不复制，直接打开美团首页',
    confirmText: '复制并跳转',
    cancelText: '直接跳转',
  });
  let copied = false;
  if (choice === 'copy') copied = await copyOnly(kw);

  const failTip = (extra) => {
    if (copied) {
      // 店名已经复制过了，只补一句指引，避免重复复制打断用户
      tipModal(
        '美团没跳过去，店名已复制',
        '微信不允许直接跳时，可以：打开美团 App → 搜索框长按粘贴「' + kw + '」→ 看菜单和价格。'
          + (extra ? '\n（' + extra + '）' : '')
      );
      return Promise.resolve({ jumped: false, copied: true });
    }
    return copyWithTip(
      kw,
      '美团没跳过去，店名已复制',
      '微信不允许直接跳时，可以：打开美团 App → 搜索框长按粘贴「' + kw + '」→ 看菜单和价格。'
        + (extra ? '\n（' + extra + '）' : '')
    );
  };

  if (!conf.appId) return failTip('还没配置美团 appId');
  if (!wx.navigateToMiniProgram) return failTip('当前微信版本不支持小程序跳转');

  return new Promise((resolve) => {
    wx.navigateToMiniProgram({
      appId: conf.appId,
      path: conf.path || '',
      extraData: { keyword: kw },
      envVersion: 'release',
      success: () => resolve({ jumped: true, copied: copied }),
      fail: (err) => {
        const msg = (err && (err.errMsg || err.message)) || '跳转失败';
        // 先等「复制 + 弹窗指引」执行完再 resolve，保证调用方 await 之后 UI 已经就绪
        failTip(msg.replace(/^navigateToMiniProgram:fail\s*/, '')).then(() => {
          resolve({ jumped: false, copied: true });
        });
      },
    });
  });
}

/**
 * 去淘宝闪购：微信内无法直接打开淘宝，先问是否复制店名；
 * 不复制也给一次明确说明 + 二次机会，绝不「点了没反应」。
 */
async function copyForTaobao(keyword) {
  const kw = clean(keyword);
  const choice = await askCopy(kw, {
    title: '去淘宝闪购',
    content: '将复制：' + (kw || '（这家店）')
      + '\n\n微信里没有淘宝小程序、也打不开淘宝链接（平台限制），需要复制店名后打开淘宝 App 粘贴搜索。',
    confirmText: '复制店名',
    cancelText: '不复制',
  });

  if (choice === 'copy') {
    const ok = await copyOnly(kw);
    if (ok) {
      tipModal(
        '店名已复制',
        '已复制「' + kw + '」。打开手机上的「淘宝」或「淘宝闪购」→ 搜索框长按粘贴 → 就能搜到这家店看实时价格。'
      );
      return { jumped: false, copied: true };
    }
    copyFail(kw, '复制失败', '剪贴板不可用，请长按下面的文字手动选择复制');
    return { jumped: false, copied: false };
  }

  // 用户选了「不复制」：说明原因，并给二次机会
  const again = await new Promise((resolve) => {
    if (!wx.showModal) return resolve(false);
    wx.showModal({
      title: '微信打不开淘宝',
      content: '微信里没有淘宝小程序，也没法直接打开淘宝闪购。\n要现在复制店名「' + (kw || '这家店') + '」，去淘宝 App 搜索吗？',
      confirmText: '复制店名',
      cancelText: '算了',
      success: (res) => resolve(!!(res && res.confirm)),
      fail: () => resolve(false),
    });
  });
  if (again) {
    const ok = await copyOnly(kw);
    if (ok) {
      tipModal('店名已复制', '打开淘宝 App → 粘贴「' + kw + '」搜索即可。');
      return { jumped: false, copied: true };
    }
  }
  if (wx.showToast) wx.showToast({ title: '已取消，随时可以再点按钮', icon: 'none' });
  return { jumped: false, copied: false };
}

module.exports = {
  clean,
  askCopy,
  copyOnly,
  copyText,
  setCopyFallback,
  openMeituan,
  copyForTaobao,
  copyWithTip,
};
