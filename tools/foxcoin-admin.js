'use strict';
/**
 * ════════════════════════════════════════════════════════════════
 *  FOX COIN ADMIN — پنل مدیریت فاکس کوین
 *  نسخه: 1.0.0 | 2026-08-22 | فاز ۳
 * ════════════════════════════════════════════════════════════════
 *
 *  این ماژول بخش مدیریت فاکس کوین است: آمار، تنظیمات، محصولات،
 *  کاربران، قیمت پلن‌ها و دفتر کل — همه با دکمه، بدون نیاز به
 *  تایپ متن.
 *
 *  چرا ماژول جدا از foxcoin-ui:
 *    رابط کاربریِ کاربرِ عادی نباید بتواند به تنظیمات دست بزند.
 *    جداسازی یعنی حتی اگر دکمه‌ای اشتباه در ربات باشد، درِ ورود
 *    همین‌جا بسته می‌شود؛ نه با مخفی‌بودن دکمه، بلکه با چک دسترسی
 *    در خود مسیریاب.
 *
 *  چرا همه‌چیز با callback_data:
 *    ربات برای دریافت متن از کاربر حالت گفت‌وگویی (state) لازم
 *    دارد و آن حالت در bot.js است. این ماژول نباید به آن وابسته
 *    باشد. پس هر مقداری که کاربر تنظیم می‌کند در خود دکمه حمل
 *    می‌شود و هیچ حالتی در حافظه نمی‌ماند.
 *
 *  چه کسی ادمین است:
 *    ۱. متغیر محیطی FOXCOIN_ADMINS — شناسه‌های عددی، با ویرگول جدا
 *    ۲. config.admins یا config.adminIds یا config.ownerId یا
 *       config.owner در کانفیگی که ربات پاس می‌دهد
 */

const coin = require('./foxcoin');

const T = {
  title: '⚙️ مدیریت فاکس کوین',
  stats: '📊 آمار کامل',
  settings: '⚙️ تنظیمات',
  products: '🛍 محصولات',
  users: '👥 کاربران',
  prices: '💵 قیمت پلن‌ها',
  ledger: '📜 دفتر کل',
  help: '❓ راهنما',
  back: '⬅️ بازگشت',
  coinMenu: '🪙 منوی کوین',
};

const LINE = '➖➖➖➖➖➖➖➖➖➖';

const EVENT_FA = {
  signup: 'جایزه ثبت‌نام',
  mission: 'ماموریت',
  purchase: 'خرید',
  referral: 'زیرمجموعه',
  spend: 'خرید با کوین',
  admin: 'اصلاح ادمین',
  reset: 'صفرسازی',
};

/** برچسب فارسی هر کلید تنظیمات، برای پنل. */
const SETTING_FA = {
  enabled: 'فعال بودن سامانه',
  purchaseMode: 'نرخ کوین بابت خرید',
  purchaseFixed: 'کوین هر خرید (ثابت)',
  purchasePerAmount: 'تومان به ازای هر کوین (نسبی)',
  referralReward: 'پاداش دعوت',
  signupReward: 'جایزه ثبت‌نام',
  dailyCap: 'سقف روزانه',
  reportChatId: 'گروه گزارش',
  reportEvents: 'رویدادهای گزارش',
};

function fa(n) {
  return Number(n || 0).toLocaleString('en-US');
}

function when(ts) {
  const d = new Date(ts);
  const p = (x) => String(x).padStart(2, '0');
  return p(d.getMonth() + 1) + '/' + p(d.getDate()) + ' ' +
         p(d.getHours()) + ':' + p(d.getMinutes());
}

function kb(rows) {
  return { inline_keyboard: rows };
}

function esc(s) {
  return String(s == null ? '' : s);
}

// ───────────────────────── دسترسی ─────────────────────────

/**
 * تنها درِ ورود پنل. هر مسیر admin اول از این گذر می‌کند.
 *
 * ترتیب جستجو: محیط → کانفیگ. اگر هیچ‌کدام تنظیم نشده باشد،
 * هیچ‌کس (حتی سازنده ربات) ادمین نیست — یعنی پنل قفل است تا
 * عمداً باز شود. قفل پیش‌فرض امن‌تر از باز پیش‌فرض است.
 */
function isAdmin(config, uid) {
  uid = String(uid);
  const fromEnv = (process.env.FOXCOIN_ADMINS || '')
    .split(',').map(s => s.trim()).filter(Boolean);
  const c = config || {};
  const raw = [c.admins, c.adminIds, c.admin_ids, c.ownerId,
               c.owner_id, c.owner];
  const ids = [];
  for (const v of raw) {
    if (v == null) continue;
    if (Array.isArray(v)) ids.push(...v);
    else ids.push(v);
  }
  return fromEnv.includes(uid) || ids.map(String).includes(uid);
}

// ───────────────────────── صفحه‌ها ─────────────────────────

function screenMenu() {
  const s = coin.stats();
  const text =
    '<b>' + T.title + '</b>\n' + LINE + '\n\n' +
    '👥 کاربران دارای موجودی\n<code>' + fa(s.holders) + '</code>\n\n' +
    '🪙 کوین در گردش\n<code>' + fa(s.circulating) + '</code>\n\n' +
    '📊 مجموع رویدادها\n<code>' + fa(s.events) + '</code>\n\n' +
    '<i>هر تغییر با دکمه انجام می‌شود و در دفتر کل ثبت می‌شود.</i>';
  return {
    text: text,
    markup: kb([
      [{ text: T.stats, callback_data: 'admin:stats' },
       { text: T.settings, callback_data: 'admin:settings' }],
      [{ text: T.products, callback_data: 'admin:products' },
       { text: T.users, callback_data: 'admin:users' }],
      [{ text: T.prices, callback_data: 'admin:prices' },
       { text: T.ledger, callback_data: 'admin:ledger' }],
      [{ text: T.help, callback_data: 'admin:help', style: 'primary' }],
      [{ text: T.coinMenu, callback_data: 'coin' }],
    ]),
  };
}

function screenStats() {
  const s = coin.stats();
  const led = coin.readLedger();
  const day = new Date().toISOString().slice(0, 10);
  const todayEvents = led.filter(r =>
    new Date(r.ts).toISOString().slice(0, 10) === day);
  const todayIssued = todayEvents.filter(r => r.amount > 0)
    .reduce((a, r) => a + r.amount, 0);
  const todaySpent = todayEvents.filter(r => r.amount < 0)
    .reduce((a, r) => a - r.amount, 0);
  const text =
    '<b>' + T.stats + '</b>\n' + LINE + '\n\n' +
    '📥 مجموع صادرشده\n<code>' + fa(s.issued) + '</code> کوین\n\n' +
    '📤 مجموع خرج‌شده\n<code>' + fa(s.spent) + '</code> کوین\n\n' +
    '🪙 در گردش\n<code>' + fa(s.circulating) + '</code> کوین\n\n' +
    '👥 دارندگان\n<code>' + fa(s.holders) + '</code> کاربر\n\n' +
    '📊 کل رویدادها\n<code>' + fa(s.events) + '</code>\n\n' + LINE + '\n\n' +
    '<b>امروز</b>\n' +
    '📥 <code>' + fa(todayIssued) + '</code> صادر\n' +
    '📤 <code>' + fa(todaySpent) + '</code> خرج\n' +
    '📊 <code>' + fa(todayEvents.length) + '</code> رویداد';
  return { text: text, markup: kb([
    [{ text: T.back, callback_data: 'admin' }],
  ]) };
}

// ───────────────────────── تنظیمات ─────────────────────────

function screenSettings() {
  const c = coin.getSettings();
  const rows = [];
  for (const key of Object.keys(coin.DEFAULTS)) {
    const label = SETTING_FA[key] || key;
    const val = c[key];
    const isNum = typeof val === 'number';
    const isBool = typeof val === 'boolean';
    let shown = esc(val);
    if (isBool) shown = val ? '✅ روشن' : '⛔ خاموش';
    if (key === 'purchaseMode') {
      shown = val === 'relative' ? '📈 نسبی (هر X تومان، ۱ کوین)'
                                 : '💰 ثابت (هر خرید، X کوین)';
    }
    if (key === 'reportChatId' && !val) shown = '(تنظیم نشده)';
    const line = { text: label + ' — ' + shown };
    if (isNum || isBool) {
      line.callback_data = 'admin:set:' + key;
      line.text = label + '\n<code>' + shown + '</code>';
    } else {
      line.text = label + '\n<i>' + shown + '</i>';
    }
    rows.push([line]);
  }
  rows.push([{ text: T.back, callback_data: 'admin' }]);
  const text =
    '<b>' + T.settings + '</b>\n' + LINE + '\n\n' +
    '<i>روی هر آیتم بزنید تا ویرایش شود.\n' +
    'گروه گزارش و رویدادهای گزارش فقط از خط فرمان تغییر می‌کنند.</i>';
  return { text: text, markup: kb(rows) };
}

function screenSetting(key) {
  const c = coin.getSettings();
  const val = c[key];
  const label = SETTING_FA[key] || key;
  const def = coin.DEFAULTS[key];

  let text = '<b>⚙️ ' + label + '</b>\n' + LINE + '\n\n';
  let rows;

  if (typeof val === 'number') {
    text += 'مقدار فعلی\n<code>' + fa(val) + '</code>\n\n' +
            '<i>هر دکمه همان لحظه اعمال می‌شود.</i>';
    rows = [
      [{ text: '➖50', callback_data: 'admin:setv:' + key + ':-50' },
       { text: '➖10', callback_data: 'admin:setv:' + key + ':-10' },
       { text: '➖1', callback_data: 'admin:setv:' + key + ':-1' }],
      [{ text: '➕1', callback_data: 'admin:setv:' + key + ':1' },
       { text: '➕10', callback_data: 'admin:setv:' + key + ':10' },
       { text: '➕50', callback_data: 'admin:setv:' + key + ':50' }],
      [{ text: '↩️ پیش‌فرض: ' + fa(def), callback_data: 'admin:reset:' + key }],
    ];
  } else if (key === 'purchaseMode') {
    text += 'حالت فعلی\n<b>' + (val === 'relative' ? '📈 نسبی' : '💰 ثابت') +
            '</b>\n\n' +
            '<i>نسبی: به ازای هر ' + fa(c.purchasePerAmount) +
            ' تومان خرید، ۱ کوین.\n' +
            'ثابت: هر خرید، ' + fa(c.purchaseFixed) + ' کوین.</i>';
    rows = [
      [{ text: '💰 ثابت', callback_data: 'admin:toggle:purchaseMode' },
       { text: '📈 نسبی', callback_data: 'admin:toggle:purchaseMode' }],
    ];
  } else if (typeof val === 'boolean') {
    text += 'وضعیت فعلی\n<b>' + (val ? '✅ روشن' : '⛔ خاموش') +
            '</b>\n\n' +
            '<i>خاموش‌کردن یعنی همه‌چیز کوین (دریافت، خرج، خرید) متوقف می‌شود.</i>';
    rows = [
      [{ text: '✅ روشن', callback_data: 'admin:toggle:' + key },
       { text: '⛔ خاموش', callback_data: 'admin:toggle:' + key }],
    ];
  } else {
    text += 'مقدار فعلی\n<code>' + esc(val) + '</code>\n\n' +
            '<i>این مورد فقط از خط فرمان تغییر می‌کند:\n' +
            'node foxcoin.js set ' + key + ' <مقدار></i>';
    rows = [];
  }

  rows.push([{ text: T.back, callback_data: 'admin:settings' }]);
  return { text: text, markup: kb(rows) };
}

function applySetting(key, delta) {
  try {
    const cur = Number(coin.getSettings()[key]) || 0;
    const next = Math.max(0, cur + Number(delta));
    coin.setSetting(key, next);
  } catch (e) { /* کلید نامعتبر: صفحه هم‌نام باز نمی‌شود */ }
  return screenSetting(key);
}

function toggleSetting(key) {
  try {
    const c = coin.getSettings();
    if (key === 'purchaseMode') {
      coin.setSetting('purchaseMode',
        c.purchaseMode === 'relative' ? 'fixed' : 'relative');
    } else if (typeof c[key] === 'boolean') {
      coin.setSetting(key, !c[key]);
    }
  } catch (e) { /* ignore */ }
  return screenSetting(key);
}

function resetSetting(key) {
  try {
    coin.setSetting(key, coin.DEFAULTS[key]);
  } catch (e) { /* ignore */ }
  return screenSetting(key);
}

// ───────────────────────── محصولات ─────────────────────────

function screenProducts() {
  const items = coin.listProducts();
  let text = '<b>' + T.products + '</b>\n' + LINE + '\n\n';
  if (!items.length) {
    text += '📭 هنوز محصولی تعریف نشده است.\n\n' +
            '<i>افزودن محصول از خط فرمان:\n' +
            'node foxcoin.js product-add \'{"id":"P1","label":"سی گیگ",' +
            '"planId":"...","cat":"volume","gb":30,"days":30,"coins":100}\'</i>';
    return { text: text, markup: kb([[{ text: T.back, callback_data: 'admin' }]]) };
  }
  text += '<i>' + fa(items.length) + ' محصول فعال — روی قیمت بزنید تا ویرایش شود</i>\n';
  const rows = items.map(p => [
    { text: (p.active === false ? '⏸ ' : '') + p.label + ' — ' +
            fa(p.coins) + ' کوین',
      callback_data: 'admin:pcoins:' + p.id },
    { text: p.active === false ? '▶️ فعال‌سازی' : '⏸ غیرفعال',
      callback_data: 'admin:ptoggle:' + p.id },
    { text: '🗑', callback_data: 'admin:pdel:' + p.id },
  ]);
  rows.push([{ text: T.back, callback_data: 'admin' }]);
  return { text: text, markup: kb(rows) };
}

function toggleProduct(id) {
  const p = coin.getProduct(id);
  if (p) {
    coin.setProduct(Object.assign({}, p, { active: p.active === false }));
  }
  return screenProducts();
}

function confirmDeleteProduct(id) {
  const p = coin.getProduct(id);
  if (!p) return screenProducts();
  const text =
    '<b>🗑 حذف محصول</b>\n' + LINE + '\n\n' +
    '«' + p.label + '» حذف شود؟\n\n' +
    '<i>این عمل برگشت‌پذیر نیست و هیچ‌جا ثبت نمی‌شود.</i>';
  return { text: text, markup: kb([
    [{ text: '✅ حذف', callback_data: 'admin:pdelgo:' + id, style: 'danger' }],
    [{ text: '⬅️ انصراف', callback_data: 'admin:products' }],
  ]) };
}

const busy = new Set();

function doDeleteProduct(id) {
  const key = 'del:' + id;
  if (busy.has(key)) return screenProducts();
  busy.add(key);
  try {
    coin.removeProduct(id);
  } finally {
    busy.delete(key);
  }
  return screenProducts();
}

function screenProductCoins(id) {
  const p = coin.getProduct(id);
  if (!p) return screenProducts();
  const text =
    '<b>💎 قیمت محصول</b>\n' + LINE + '\n\n' +
    '📦 ' + p.label + '\n' +
    (p.gb ? 'حجم <code>' + fa(p.gb) + '</code> گیگ\n' : '') +
    (p.days ? 'مدت <code>' + fa(p.days) + '</code> روز\n' : '') +
    'پلن: <code>' + p.planId + '</code>\n\n' +
    'قیمت کوینی فعلی\n<code>' + fa(p.coins) + '</code> کوین\n\n' +
    '<i>هر دکمه همان لحظه اعمال می‌شود.</i>';
  return { text: text, markup: kb([
    [{ text: '➖100', callback_data: 'admin:pcoinsv:' + id + ':-100' },
     { text: '➖10', callback_data: 'admin:pcoinsv:' + id + ':-10' },
     { text: '➖1', callback_data: 'admin:pcoinsv:' + id + ':-1' }],
    [{ text: '➕1', callback_data: 'admin:pcoinsv:' + id + ':1' },
     { text: '➕10', callback_data: 'admin:pcoinsv:' + id + ':10' },
     { text: '➕100', callback_data: 'admin:pcoinsv:' + id + ':100' }],
    [{ text: T.back, callback_data: 'admin:products' }],
  ]) };
}

function applyProductCoins(id, delta) {
  const p = coin.getProduct(id);
  if (p) {
    const next = Math.max(0, (Number(p.coins) || 0) + Number(delta));
    coin.setProduct(Object.assign({}, p, { coins: next }));
  }
  return screenProductCoins(id);
}

// ───────────────────────── کاربران ─────────────────────────

function screenUsers() {
  const top = coin.topHolders(8);
  const recent = coin.recentUsers(5);
  let text = '<b>' + T.users + '</b>\n' + LINE + '\n\n';
  const rows = [];

  if (!top.length && !recent.length) {
    text += '📭 هنوز کاربری کوین ندارد.\n\n' +
            '<i>به محض اولین رویداد، کاربر اینجا ظاهر می‌شود.</i>';
  } else {
    if (top.length) {
      text += '<b>🏆 دارندگان برتر</b>\n';
      for (const h of top) {
        rows.push([{ text: '👤 ' + h.uid + '  —  ' + fa(h.balance) + ' کوین',
                     callback_data: 'admin:user:' + h.uid }]);
      }
      text += '\n';
    }
    if (recent.length) {
      text += '<b>🕒 کاربران اخیر</b>\n';
      for (const u of recent) {
        rows.push([{ text: '👤 ' + u,
                     callback_data: 'admin:user:' + u }]);
      }
    }
  }
  rows.push([{ text: T.back, callback_data: 'admin' }]);
  return { text: text, markup: kb(rows) };
}

function userTotals(uid) {
  const led = coin.readLedger().filter(r => String(r.uid) === String(uid));
  const earned = led.filter(r => r.amount > 0).reduce((a, r) => a + r.amount, 0);
  const spent = led.filter(r => r.amount < 0).reduce((a, r) => a - r.amount, 0);
  const day = new Date().toISOString().slice(0, 10);
  const today = led.filter(r => r.amount > 0 && r.type !== 'admin' &&
    new Date(r.ts).toISOString().slice(0, 10) === day)
    .reduce((a, r) => a + r.amount, 0);
  return { earned: earned, spent: spent, today: today, count: led.length };
}

function screenUser(uid) {
  uid = String(uid);
  const t = userTotals(uid);
  const c = coin.getSettings();
  const last = coin.history(uid, 5);
  let text =
    '<b>👤 کاربر</b>\n' + LINE + '\n\n' +
    '🆔 شناسه\n<code>' + uid + '</code>\n\n' +
    '💰 موجودی\n<code>' + fa(coin.getBalance(uid)) + '</code> کوین\n\n' +
    '📥 مجموع دریافتی <code>' + fa(t.earned) + '</code>\n' +
    '📤 مجموع خرج‌شده <code>' + fa(t.spent) + '</code>\n' +
    '📅 دریافتی امروز <code>' + fa(t.today) + '</code> از <code>' +
    fa(c.dailyCap) + '</code>\n\n';
  if (last.length) {
    text += '<b>آخرین رویدادها</b>\n' +
      last.map(r =>
        when(r.ts) + '  ' + (EVENT_FA[r.type] || r.type) + '  ' +
        (r.amount > 0 ? '+' : '') + fa(r.amount)
      ).join('\n');
  } else {
    text += '<i>هنوز رویدادی ندارد.</i>';
  }
  return { text: text, markup: kb([
    [{ text: '➕ افزودن کوین', callback_data: 'admin:grant:' + uid,
      style: 'success' },
     { text: '➖ کسر کوین', callback_data: 'admin:revoke:' + uid }],
    [{ text: '📜 تاریخچه کامل', callback_data: 'admin:uhist:' + uid }],
    [{ text: T.back, callback_data: 'admin:users' }],
  ]) };
}

function screenUserHistory(uid) {
  uid = String(uid);
  const rows = coin.history(uid, 15);
  let text = '<b>📜 تاریخچه کاربر</b>\n' + LINE + '\n\n' +
             '🆔 <code>' + uid + '</code>\n\n';
  if (!rows.length) {
    text += '<i>رویدادی ثبت نشده است.</i>';
  } else {
    text += rows.map(r => {
      const sign = r.amount > 0 ? '+' : '';
      return when(r.ts) + '  ' + (EVENT_FA[r.type] || r.type) +
             '\n<code>' + sign + fa(r.amount) + '</code>  →  ' +
             '<code>' + fa(r.balance) + '</code>';
    }).join('\n\n');
  }
  return { text: text, markup: kb([
    [{ text: T.back, callback_data: 'admin:user:' + uid }],
  ]) };
}

/** صفحه تنظیم مقدار افزودن/کسر. مقدار در خود دکمه‌ها حمل می‌شود. */
function screenAdjust(icon, title, uid, amount, maxHint) {
  uid = String(uid);
  const amt = Math.max(0, Number(amount) || 0);
  const prefix = title.indexOf('کسر') === -1 ? 'grant' : 'revoke';
  let text =
    '<b>' + icon + ' ' + title + '</b>\n' + LINE + '\n\n' +
    '👤 کاربر <code>' + uid + '</code>\n\n' +
    '💰 موجودی فعلی <code>' + fa(coin.getBalance(uid)) +
    '</code> کوین\n\n' +
    'مقدار\n<code>' + fa(amt) + '</code> کوین\n\n' +
    '<i>' + (maxHint || '') + '</i>';
  const go = [{ text: '✅ تأیید و ثبت (' + fa(amt) + ')',
                callback_data: 'admin:' + prefix + 'go:' + uid + ':' + amt,
                style: 'success' }];
  return { text: text, markup: kb([
    [{ text: '➕100', callback_data: 'admin:' + prefix + 'v:' + uid + ':' + (amt + 100) },
     { text: '➕50', callback_data: 'admin:' + prefix + 'v:' + uid + ':' + (amt + 50) },
     { text: '➕10', callback_data: 'admin:' + prefix + 'v:' + uid + ':' + (amt + 10) }],
    [{ text: '➖10', callback_data: 'admin:' + prefix + 'v:' + uid + ':' + Math.max(0, amt - 10) },
     { text: '➖50', callback_data: 'admin:' + prefix + 'v:' + uid + ':' + Math.max(0, amt - 50) },
     { text: '➖100', callback_data: 'admin:' + prefix + 'v:' + uid + ':' + Math.max(0, amt - 100) }],
    amt > 0 ? go : [],
    [{ text: '⬅️ انصراف', callback_data: 'admin:user:' + uid }],
  ]) };
}

function screenGrant(uid, amount) {
  return screenAdjust('➕', 'افزودن کوین', uid, amount,
    'رویداد با نوع «اصلاح ادمین» در گردش حساب کاربر ثبت می‌شود.');
}

function screenRevoke(uid, amount) {
  return screenAdjust('➖', 'کسر کوین', uid, amount,
    'بیش از موجودی قابل کسر نیست.');
}

function doAdjust(uid, amount, sign, doneLabel) {
  uid = String(uid);
  const amt = Math.round(Number(amount));
  if (!Number.isFinite(amt) || amt <= 0) {
    return { text: '❌ مقدار نامعتبر است.', markup: kb([
      [{ text: T.back, callback_data: 'admin:user:' + uid }]]) };
  }
  const key = (sign < 0 ? 'rev' : 'grant') + ':' + uid;
  if (busy.has(key)) {
    return { text: '⚠️ یک درخواست برای این کاربر در حال انجام است.',
             markup: kb([[{ text: T.back, callback_data: 'admin:user:' + uid }]]) };
  }
  busy.add(key);
  let r;
  try {
    r = coin.addEvent(uid, 'admin', sign * amt,
                      { note: doneLabel + ' از پنل مدیریت' });
  } finally {
    busy.delete(key);
  }
  if (!r.ok) {
    return { text: '❌ ' + r.reason, markup: kb([
      [{ text: T.back, callback_data: 'admin:user:' + uid }]]) };
  }
  return {
    text: '<b>' + (sign < 0 ? '➖' : '➕') + ' ثبت شد</b>\n' + LINE + '\n\n' +
          '<code>' + fa(amt) + '</code> کوین ' + doneLabel + '.\n' +
          '💰 موجودی جدید: <code>' + fa(r.balance) + '</code> کوین\n\n' +
          '<i>در گردش حساب کاربر ثبت شد.</i>',
    markup: kb([[{ text: '👤 بازگشت به کاربر',
                   callback_data: 'admin:user:' + uid }]]),
  };
}

function doGrant(uid, amount) {
  return doAdjust(uid, amount, 1, 'به کاربر اضافه شد');
}

function doRevoke(uid, amount) {
  return doAdjust(uid, amount, -1, 'از کاربر کسر شد');
}

// ───────────────────────── قیمت پلن‌ها ─────────────────────────

function screenPrices() {
  const prices = coin.getCoinPrices();
  let text = '<b>' + T.prices + '</b>\n' + LINE + '\n\n';
  const rows = [];
  const plans = Object.keys(prices);
  if (!plans.length) {
    text += '📭 هنوز قیمت کوینی برای پلنی ثبت نشده است.\n\n' +
            '<i>افزودن از خط فرمان:\n' +
            'node foxcoin.js price <شناسه پلن> <کوین>\n' +
            'یا از «قیمت پلن‌ها» در منو، قیمتی ثبت کنید.</i>';
  } else {
    text += '<i>' + fa(plans.length) + ' پلن دارای قیمت کوینی</i>\n';
    for (const pl of plans) {
      rows.push([
        { text: '🛰 <code>' + pl + '</code> — ' + fa(prices[pl]) + ' کوین',
          callback_data: 'admin:price:' + pl },
        { text: '🗑', callback_data: 'admin:pricedel:' + pl },
      ]);
    }
  }
  rows.push([{ text: T.back, callback_data: 'admin' }]);
  return { text: text, markup: kb(rows) };
}

function screenPrice(plan) {
  const cur = coin.getCoinPrice(plan);
  const text =
    '<b>💵 قیمت پلن</b>\n' + LINE + '\n\n' +
    '🛰 پلن <code>' + plan + '</code>\n\n' +
    'قیمت کوینی فعلی\n' +
    (cur === null ? '<i>تعریف نشده</i>' : '<code>' + fa(cur) + '</code> کوین') +
    '\n\n<i>هر دکمه همان لحظه اعمال می‌شود.\n' +
    'رسیدن به صفر یعنی حذف قیمت (فروش کوینی غیرفعال).</i>';
  return { text: text, markup: kb([
    [{ text: '➖100', callback_data: 'admin:pricev:' + plan + ':-100' },
     { text: '➖10', callback_data: 'admin:pricev:' + plan + ':-10' },
     { text: '➖1', callback_data: 'admin:pricev:' + plan + ':-1' }],
    [{ text: '➕1', callback_data: 'admin:pricev:' + plan + ':1' },
     { text: '➕10', callback_data: 'admin:pricev:' + plan + ':10' },
     { text: '➕100', callback_data: 'admin:pricev:' + plan + ':100' }],
    [{ text: '🗑 حذف قیمت', callback_data: 'admin:pricedel:' + plan }],
    [{ text: T.back, callback_data: 'admin:prices' }],
  ]) };
}

function applyPrice(plan, delta) {
  const cur = coin.getCoinPrice(plan);
  const base = cur === null ? 0 : cur;
  const next = base + Number(delta);
  if (next <= 0) coin.setCoinPrice(plan, null);
  else coin.setCoinPrice(plan, next);
  return screenPrice(plan);
}

function removePrice(plan) {
  coin.setCoinPrice(plan, null);
  return screenPrices();
}

// ───────────────────────── دفتر کل ─────────────────────────

function screenLedger() {
  const rows = coin.ledgerRecent(20);
  let text = '<b>' + T.ledger + '</b>\n' + LINE + '\n\n';
  if (!rows.length) {
    text += '<i>دفتر خالی است.</i>';
  } else {
    text += '<i>۲۰ رویداد آخر — جدیدترین اول</i>\n\n';
    text += rows.map(r => {
      const sign = r.amount > 0 ? '+' : '';
      return when(r.ts) + '  <code>' + r.uid + '</code>\n' +
             (EVENT_FA[r.type] || r.type) + '  <code>' + sign +
             fa(r.amount) + '</code>  →  <code>' + fa(r.balance) + '</code>';
    }).join('\n\n');
  }
  return { text: text, markup: kb([
    [{ text: T.back, callback_data: 'admin' }],
  ]) };
}

// ───────────────────────── راهنما ─────────────────────────

function screenHelp() {
  const text =
    '<b>' + T.help + '</b>\n' + LINE + '\n\n' +
    '<b>چه کسی ادمین است</b>\n' +
    '• متغیر محیطی <code>FOXCOIN_ADMINS</code> — شناسه‌های عددی\n' +
    '  جدا با ویرگول، مثل <code>123456,789012</code>\n' +
    '• یا <code>config.admins</code> / <code>config.ownerId</code> در کانفیگ ربات\n\n' +
    '<b>کارهایی که اینجا می‌شود</b>\n' +
    '• آمار: کل صادرشده، خرج‌شده، در گردش، دارندگان، امروز\n' +
    '• تنظیمات: سقف روزانه، جایزه‌ها، نرخ خرید، روشن/خاموش\n' +
    '• محصولات: غیرفعال/فعال‌سازی، قیمت کوینی، حذف\n' +
    '• کاربران: موجودی، تاریخچه، افزودن/کسر کوین با دلیل\n' +
    '• قیمت پلن‌ها: تعیین کوین به ازای هر پلن\n\n' +
    '<b>از خط فرمان (کارهای پیشرفته)</b>\n' +
    '• افزودن محصول:\n' +
    '  node foxcoin.js product-add \'{"id":"P1","label":"سی گیگ",' +
    '"planId":"...","cat":"volume","gb":30,"days":30,"coins":100}\'\n' +
    '• گروه گزارش:\n' +
    '  node foxcoin.js set reportChatId <شناسه گروه>\n\n' +
    '<i>همه تغییرات کوین در دفتر کل ثبت می‌شود و قابل ردیابی است.</i>';
  return { text: text, markup: kb([
    [{ text: T.back, callback_data: 'admin' }],
  ]) };
}

// ───────────────────────── مسیریاب ─────────────────────────

/** پیشوندهای مسیر. طول دقیق، برای برش امن. */
const P = {
  set: 'admin:set:', setv: 'admin:setv:', toggle: 'admin:toggle:',
  reset: 'admin:reset:',
  ptoggle: 'admin:ptoggle:', pdel: 'admin:pdel:', pdelgo: 'admin:pdelgo:',
  pcoins: 'admin:pcoins:', pcoinsv: 'admin:pcoinsv:',
  user: 'admin:user:', uhist: 'admin:uhist:',
  grant: 'admin:grant:', grantv: 'admin:grantv:', grantgo: 'admin:grantgo:',
  revoke: 'admin:revoke:', revokev: 'admin:revokev:',
  revokego: 'admin:revokego:',
  price: 'admin:price:', pricev: 'admin:pricev:', pricedel: 'admin:pricedel:',
};

function after(d, prefix) {
  return d.slice(prefix.length);
}

/**
 * تنها نقطه ورود پنل مدیریت. هر داده‌ای که با admin شروع شود
 * اینجا می‌آید؛ اگر کاربر ادمین نباشد، پیام دسترسی‌نداریم می‌گیرد
 * و هیچ‌وقت به صفحه‌ها نمی‌رسد.
 */
async function route(ctx) {
  const d = String(ctx.data || '');

  if (!isAdmin(ctx.config, ctx.uid)) {
    await ctx.editTelegram(ctx.config, ctx.chatId, ctx.messageId,
      '⛔ این بخش فقط برای مدیریت است.',
      kb([[{ text: T.coinMenu, callback_data: 'coin' }]]));
    return true;
  }

  let s = null;
  if (d === 'admin') s = screenMenu();
  else if (d === 'admin:stats') s = screenStats();
  else if (d === 'admin:settings') s = screenSettings();
  else if (d === 'admin:products') s = screenProducts();
  else if (d === 'admin:users') s = screenUsers();
  else if (d === 'admin:prices') s = screenPrices();
  else if (d === 'admin:ledger') s = screenLedger();
  else if (d === 'admin:help') s = screenHelp();
  else if (d.startsWith(P.set)) s = screenSetting(after(d, P.set));
  else if (d.startsWith(P.setv)) {
    const [k, v] = after(d, P.setv).split(':');
    s = applySetting(k, v);
  } else if (d.startsWith(P.toggle)) {
    s = toggleSetting(after(d, P.toggle));
  } else if (d.startsWith(P.reset)) {
    s = resetSetting(after(d, P.reset));
  } else if (d.startsWith(P.ptoggle)) {
    s = toggleProduct(after(d, P.ptoggle));
  } else if (d.startsWith(P.pdel)) {
    s = confirmDeleteProduct(after(d, P.pdel));
  } else if (d.startsWith(P.pdelgo)) {
    s = doDeleteProduct(after(d, P.pdelgo));
  } else if (d.startsWith(P.pcoins)) {
    s = screenProductCoins(after(d, P.pcoins));
  } else if (d.startsWith(P.pcoinsv)) {
    const [id, v] = after(d, P.pcoinsv).split(':');
    s = applyProductCoins(id, v);
  } else if (d.startsWith(P.user)) {
    s = screenUser(after(d, P.user));
  } else if (d.startsWith(P.uhist)) {
    s = screenUserHistory(after(d, P.uhist));
  } else if (d.startsWith(P.grant)) {
    s = screenGrant(after(d, P.grant), 0);
  } else if (d.startsWith(P.grantv)) {
    const [u, amt] = after(d, P.grantv).split(':');
    s = screenGrant(u, amt);
  } else if (d.startsWith(P.grantgo)) {
    const [u, amt] = after(d, P.grantgo).split(':');
    s = doGrant(u, amt);
  } else if (d.startsWith(P.revoke)) {
    s = screenRevoke(after(d, P.revoke), 0);
  } else if (d.startsWith(P.revokev)) {
    const [u, amt] = after(d, P.revokev).split(':');
    s = screenRevoke(u, amt);
  } else if (d.startsWith(P.revokego)) {
    const [u, amt] = after(d, P.revokego).split(':');
    s = doRevoke(u, amt);
  } else if (d.startsWith(P.price)) {
    s = screenPrice(after(d, P.price));
  } else if (d.startsWith(P.pricev)) {
    const [pl, v] = after(d, P.pricev).split(':');
    s = applyPrice(pl, v);
  } else if (d.startsWith(P.pricedel)) {
    s = removePrice(after(d, P.pricedel));
  } else {
    // مسیر ناشناخته در محدوده admin: منوی مدیریت
    s = screenMenu();
  }

  await ctx.editTelegram(ctx.config, ctx.chatId, ctx.messageId, s.text, s.markup);
  return true;
}

/**
 * ردیف دکمه مدیریت برای منوی اصلی ربات. ربات این را با spread
 * داخل آرایه دکمه‌ها می‌گذارد: [] یعنی هیچ دکمه‌ای اضافه نمی‌شود.
 * (درِ امنیت همچنان خودِ route است؛ این فقط راحتی است.)
 */
function adminMenuRows(opts) {
  if (!opts) return [];
  return isAdmin(opts.config, opts.uid)
    ? [{ text: T.title, callback_data: 'admin' }]
    : [];
}

module.exports = { route, isAdmin, adminMenuRows, T,
                   screenMenu, screenStats, screenSettings, screenProducts,
                   screenUsers, screenPrices, screenLedger, screenHelp,
                   doGrant, doRevoke };

// ───────────────────────── خودآزمون ─────────────────────────

if (require.main === module) {
  const os = require('os'), fsx = require('fs'), pathx = require('path');
  const child = require('child_process');
  if (process.env.FOXCOIN_ADMIN_CHILD) {
    const a = (c, m) => { if (!c) { console.log('❌ ' + m); process.exit(1); }
                          console.log('✅ ' + m); };

    // ── دسترسی
    a(isAdmin({ admins: ['u9'] }, 'u9'), 'config.admins کار می‌کند');
    a(!isAdmin({ admins: ['u9'] }, 'u7'), 'غیرادمین رد شد');
    a(isAdmin({ ownerId: 'u7' }, 'u7'), 'ownerId کار می‌کند');
    a(!isAdmin({}, 'u7'), 'بدون تنظیم، هیچ‌کس ادمین نیست');
    a(!isAdmin(null, 'u7'), 'کانفیگ خالی ادمین نمی‌دهد');
    a(adminMenuRows({ config: { admins: ['u9'] }, uid: 'u9' }).length === 1,
      'دکمه مدیریت برای ادمین ساخته شد');
    a(adminMenuRows({ config: { admins: ['u9'] }, uid: 'u7' }).length === 0,
      'دکمه مدیریت برای غیرادمین ساخته نشد');

    // ── داده اولیه
    coin.addEvent('u9', 'signup', 5);
    coin.addEvent('u7', 'signup', 5);
    coin.addEvent('u7', 'referral', 10);
    coin.setSetting('dailyCap', 300);
    coin.setProduct({ id: 'P30', label: 'سی گیگ', planId: 'PL1',
                      cat: 'volume', gb: 30, days: 30, coins: 100 });
    coin.setProduct({ id: 'P10', label: 'ده گیگ', planId: 'PL2',
                      cat: 'volume', gb: 10, days: 30, coins: 40 });

    let sent = null;
    const fakeEdit = async (c, ch, mid, text, markup) => { sent = { text, markup }; };
    const go = async (data, cfg) => route({
      data: data, uid: 'u9', config: cfg || { admins: ['u9'] },
      chatId: 1, messageId: 2, editTelegram: fakeEdit,
    });

    go('admin').then(async () => {
      a(sent && sent.text.includes('مدیریت فاکس کوین'), 'منوی مدیریت باز شد');
      a(JSON.stringify(sent.markup).includes('admin:stats'), 'دکمه آمار هست');

      // ── درِ غیرادمین
      await go('admin', { admins: ['zz'] });
      a(sent.text.includes('فقط برای مدیریت'), 'غیرادمین درِ بسته گرفت');

      // ── آمار
      await go('admin:stats');
      a(sent.text.includes('در گردش'), 'صفحه آمار باز شد');

      // ── تنظیمات: اعمال فوری + ریست + حالت خرید
      await go('admin:setv:dailyCap:100');
      a(coin.getSettings().dailyCap === 400, 'تنظیم عددی همان لحظه اعمال شد');
      await go('admin:reset:dailyCap');
      a(coin.getSettings().dailyCap === 200, 'ریست به پیش‌فرض کار کرد');
      await go('admin:toggle:purchaseMode');
      a(coin.getSettings().purchaseMode === 'relative', 'حالت خرید عوض شد');
      await go('admin:toggle:purchaseMode');
      a(coin.getSettings().purchaseMode === 'fixed', 'حالت خرید برگشت');
      await go('admin:toggle:enabled');
      a(coin.getSettings().enabled === false, 'سامانه خاموش شد');
      await go('admin:toggle:enabled');
      a(coin.getSettings().enabled === true, 'سامانه روشن شد');

      // ── محصولات
      await go('admin:products');
      a(JSON.stringify(sent.markup).includes('سی گیگ'),
        'فروشگاه محصولات در پنل فهرست شد');
      await go('admin:ptoggle:P10');
      a(coin.getProduct('P10').active === false, 'محصول غیرفعال شد');
      await go('admin:pcoinsv:P10:10');
      a(coin.getProduct('P10').coins === 50, 'قیمت کوینی محصول ویرایش شد');
      await go('admin:pdel:P30');
      a(sent.text.includes('حذف شود'), 'صفحه تأیید حذف باز شد');
      await go('admin:pdelgo:P30');
      a(coin.getProduct('P30') === null, 'محصول حذف شد');

      // ── قیمت پلن‌ها
      await go('admin:pricev:PL9:50');
      a(coin.getCoinPrice('PL9') === 50, 'قیمت پلن تنظیم شد');
      await go('admin:pricev:PL9:-50');
      a(coin.getCoinPrice('PL9') === null, 'رسیدن به صفر یعنی حذف قیمت');
      await go('admin:pricev:PL9:30');
      await go('admin:pricedel:PL9');
      a(coin.getCoinPrice('PL9') === null, 'حذف قیمت پلن کار کرد');

      // ── کاربران و افزودن/کسر کوین
      await go('admin:users');
      a(JSON.stringify(sent.markup).includes('u7'), 'کاربران فهرست شدند');
      await go('admin:user:u7');
      a(sent.text.includes('موجودی'), 'صفحه کاربر باز شد');
      await go('admin:grantv:u7:50');
      a(sent.text.includes('50'), 'مقدار افزودن نمایش داده شد');
      await go('admin:grantgo:u7:50');
      a(sent.text.includes('ثبت شد'), 'افزودن کوین ثبت شد');
      a(coin.getBalance('u7') === 65, 'موجودی کاربر درست شد');
      a(coin.history('u7', 1)[0].type === 'admin', 'رویداد ادمین در دفتر ثبت شد');
      await go('admin:revokev:u7:20');
      await go('admin:revokego:u7:20');
      a(coin.getBalance('u7') === 45, 'کسر کوین درست شد');
      await go('admin:revokev:u7:99999');
      await go('admin:revokego:u7:99999');
      a(coin.getBalance('u7') === 45, 'کسر بیش از موجودی رد شد');

      // ── دفتر کل و مسیر ناشناخته
      await go('admin:ledger');
      a(sent.text.includes('زیرمجموعه'), 'دفتر کل نام فارسی رویداد را نشان داد');
      await go('admin:xyz');
      a(sent.text.includes('مدیریت فاکس کوین'), 'مسیر ناشناخته به منوی مدیریت رفت');

      // ── تاریخچه کاربر
      await go('admin:uhist:u7');
      a(sent.text.includes('اصلاح ادمین'), 'تاریخچه کاربر رویداد ادمین را نشان داد');

      console.log('\nهمه تست‌ها گذشتند.');
    }).catch(e => { console.log('❌ ' + e.message); process.exit(1); });
  } else {
    const tmp = fsx.mkdtempSync(pathx.join(os.tmpdir(), 'foxcoinadmin-'));
    const r = child.spawnSync(process.execPath, [__filename], {
      env: Object.assign({}, process.env,
        { FOXCOIN_DATA_DIR: tmp, FOXCOIN_ADMIN_CHILD: '1' }),
      encoding: 'utf8' });
    process.stdout.write(r.stdout || '');
    process.stderr.write(r.stderr || '');
    console.log('\nپوشه آزمون: ' + tmp);
    process.exit(r.status || 0);
  }
}
