/**
 * 地理计算：Haversine 距离 / 体感描述
 */

// 两坐标球面距离（米）
function distanceMeters(lat1, lng1, lat2, lng2) {
  const R = 6371000;
  const toRad = (d) => (d * Math.PI) / 180;
  const dLat = toRad(lat2 - lat1);
  const dLng = toRad(lng2 - lng1);
  const a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLng / 2) * Math.sin(dLng / 2);
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

// 米 -> 展示文本
function formatDistance(m) {
  if (m == null || isNaN(m)) return '距离未知';
  if (m < 1000) return Math.round(m) + 'm';
  return (m / 1000).toFixed(1) + 'km';
}

// 距离 -> 出行建议文本
function travelHint(m) {
  if (m == null || isNaN(m)) return '';
  const walkMin = Math.round(m / 80); // 步行约 4.8km/h
  const rideMin = Math.round(m / 250); // 骑行约 15km/h
  if (m < 800) return '步行约 ' + walkMin + ' 分钟';
  return '骑行约 ' + rideMin + ' 分钟';
}

module.exports = { distanceMeters, formatDistance, travelHint };
