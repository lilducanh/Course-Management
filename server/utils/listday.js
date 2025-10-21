// utils/dateUtils.js
const dayjs = require('dayjs');
const utc = require('dayjs/plugin/utc');
const timezone = require('dayjs/plugin/timezone');
dayjs.extend(utc);
dayjs.extend(timezone);
dayjs.tz.setDefault('Asia/Ho_Chi_Minh');

// Chuyển dayjs().day() (Sun=0..Sat=6) sang kiểu MySQL WEEKDAY (Mon=0..Sun=6)
function toMySQLWeekday(d) {
  return (d + 6) % 7;
}

// Sinh dãy ngày liên tục (bao gồm cả ngày kết thúc)
function* dateRangeInclusive(start, end) {
  let cur = start.startOf('day');
  const last = end.startOf('day');
  while (cur.isBefore(last) || cur.isSame(last, 'day')) {
    yield cur;
    cur = cur.add(1, 'day');
  }
}

// Tiện ích định dạng chuẩn YYYY-MM-DD HH:mm:ss theo giờ VN
function formatDateVN(d) {
  return dayjs(d).tz('Asia/Ho_Chi_Minh').format('YYYY-MM-DD HH:mm:ss');
}

// Xuất ra để file khác sử dụng
module.exports = {
  dayjs,
  toMySQLWeekday,
  dateRangeInclusive,
  formatDateVN
};
