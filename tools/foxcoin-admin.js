'use strict';
/**
 * ════════════════════════════════════════════════════════════════
 *  FOX COIN ADMIN — پنل مدیریت فاکس کوین
 *  نسخه: 1.3.0 | 2026-08-22 | فاز ۳ + فاکس شاپ + دست بازتر + جوایز
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
  products: '🛍 فاکس شاپ',
  addProduct: '➕ محصول جدید',
  users: '👥 کاربران',
  allUsers: '👥 همه کاربران',
  setBal: '🎯 تنظیم دقیق موجودی',
  autoName: '🔁 نام خودکار',
  changePlan: '🛰 تغییر پلن',
  changeCat: '🔄 تغییر دسته',
  prices: '💵 قیمت پلن‌ها',
  ledger: '📜 دفتر کل',
  rewards: '🎁 جوایز فعالیت',
  help: '❓ راهنما',
  back: '⬅️ بازگشت',
  coinMenu: '🪙 منوی کوین',
};

/** دلیل‌های از پیش تعریف‌شده برای تغییر موجودی (بدون نیاز به تایپ). */
const REASONS = [
  ['gift', '🎁 هدیه'],
  ['prize', '🏆 جایزه'],
  ['fix', '🔧 جبران خطا'],
  ['balance', '⚖️ تصحیح موجودی'],
  ['other', '📝 سایر'],
];

const REASON_FA = {
  gift: 'هدیه', prize: 'جایزه', fix: 'جبران خطا',
  balance: 'تصحیح موجودی', other: 'سایر',
};

const LINE = '➖➖➖➖➖➖➖➖➖➖';

const EVENT_FA = {
  signup: 'جایزه ثبت‌نام',
  mission: 'ماموریت',
  purchase: 'خرید',
  referral: 'دعوت دوستان',
  spend: 'خرید با کوین',
  admin: 'اصلاح ادمین',
  reset: 'صفرسازی',
  join: 'جوین کانال',
};

/** برچسب فارسی هر فعالیت جایزه‌دار. */
const REWARD_LABELS = {
  signup: 'ثبت‌نام در ربات',
  join: 'جوین کانال/گروه',
  referral: 'دعوت دوستان (پس از خرید)',
  mission: 'انجام ماموریت',
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
  shopEnabled: 'فروشگاه کوینی (باز/بسته)',
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
    '<i>هر تغییر با دکمه انجام می‌شود و در دفتر کل ثبت می‌شود.</i>\n\n' +
    '<code>نسخه 1.3.0</code>';
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

/** کلیدهایی که به صفحه جوایز منتقل شده‌اند و اینجا نشان داده نمی‌شوند. */
const HIDDEN_SETTINGS = ['signupReward', 'referralReward'];

function screenSettings() {
  const c = coin.getSettings();
  const rows = [];
  rows.push([{ text: T.rewards, callback_data: 'admin:rewards',
               style: 'success' }]);
  for (const key of Object.keys(coin.DEFAULTS)) {
    if (HIDDEN_SETTINGS.includes(key)) continue;
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
    'گروه گزارش و رویدادهای گزارش فقط از خط فرمان تغییر می‌کنند.\n' +
    'جوایز فعالیت (ثبت‌نام، جوین، دعوت، ماموریت) از «' + T.rewards +
    '» تنظیم می‌شود.</i>';
  return { text: text, markup: kb(rows) };
}

// ───────────────────────── جوایز فعالیت ─────────────────────────

/**
 * جوایز هر فعالیت. برای هر کار می‌توان کوین دلخواه تعیین کرد:
 * ثبت‌نام، جوین کانال، دعوت دوستان، ماموریت — و هر فعالیت سفارشی.
 * مقدارها از هسته زنده خوانده می‌شوند.
 */
function screenRewards() {
  const rw = coin.getRewards();
  const defKeys = Object.keys(coin.REWARD_DEFAULTS || {});
  const customKeys = Object.keys(rw).filter(k => !defKeys.includes(k));
  let text = '<b>' + T.rewards + '</b>\n' + LINE + '\n\n' +
             '<i>برای هر فعالیت، کوین دلخواه تعیین کنید.\n' +
             'روی هر آیتم بزنید تا ویرایش شود.</i>\n';
  const rows = [];
  for (const key of [...defKeys, ...customKeys]) {
    const label = REWARD_LABELS[key] || key;
    const custom = customKeys.includes(key) ? ' ⭐' : '';
    rows.push([{ text: label + custom + '\n<code>' + fa(rw[key]) +
                '</code> کوین',
                 callback_data: 'admin:rcoins:' + key }]);
  }
  rows.push([{ text: T.back, callback_data: 'admin:settings' }]);
  return { text: text, markup: kb(rows) };
}

/** صفحه ویرایش مقدار یک فعالیت. */
function screenRewardEdit(key) {
  const rw = coin.getRewards();
  if (!(key in rw)) return screenRewards();
  const label = REWARD_LABELS[key] || key;
  const cur = rw[key];
  const def = (coin.REWARD_DEFAULTS || {})[key];
  const isCustom = def === undefined;
  let text =
    '<b>🎁 ' + label + '</b>\n' + LINE + '\n\n' +
    'جایزه فعلی\n<code>' + fa(cur) + '</code> کوین\n\n' +
    '<i>هر دکمه همان لحظه اعمال می‌شود.\n' +
    'صفر یعنی این فعالیت جایزه ندارد.</i>';
  const rows = [
    [{ text: '➖100', callback_data: 'admin:rcoinsv:' + key + ':-100' },
     { text: '➖10', callback_data: 'admin:rcoinsv:' + key + ':-10' },
     { text: '➖1', callback_data: 'admin:rcoinsv:' + key + ':-1' }],
    [{ text: '➕1', callback_data: 'admin:rcoinsv:' + key + ':1' },
     { text: '➕10', callback_data: 'admin:rcoinsv:' + key + ':10' },
     { text: '➕100', callback_data: 'admin:rcoinsv:' + key + ':100' }],
  ];
  if (!isCustom) {
    rows.push([{ text: '↩️ پیش‌فرض: ' + fa(def),
                 callback_data: 'admin:rreset:' + key }]);
  } else {
    rows.push([{ text: '🗑 حذف فعالیت', callback_data: 'admin:rdel:' + key,
                 style: 'danger' }]);
  }
  rows.push([{ text: T.back, callback_data: 'admin:rewards' }]);
  return { text: text, markup: kb(rows) };
}

function applyReward(key, delta) {
  try {
    const cur = Number(coin.getRewards()[key]) || 0;
    coin.setReward(key, Math.max(0, cur + Number(delta)));
  } catch (e) { /* کلید نامعتبر */ }
  return screenRewardEdit(key);
}

function resetReward(key) {
  try {
    coin.setReward(key, (coin.REWARD_DEFAULTS || {})[key] || 0);
  } catch (e) { /* ignore */ }
  return screenRewardEdit(key);
}

function deleteReward(key) {
  coin.removeRewardAction(key);
  return screenRewards();
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
  const c = coin.getSettings();
  const items = coin.listProducts();
  const rows = [];
  const status = c.shopEnabled
    ? '✅ فروشگاه <b>باز</b> است — خرید انجام می‌شود'
    : '⛔ فروشگاه <b>بسته</b> است — خرید متوقف است';
  let text = '<b>' + T.products + '</b>\n' + LINE + '\n\n' +
             status + '\n\n' +
             '<i>' + fa(items.length) + ' محصول — برای جزئیات روی محصول بزنید</i>\n';
  rows.push([
    { text: c.shopEnabled ? '⛔ بستن فروشگاه' : '✅ باز کردن فروشگاه',
      callback_data: 'admin:shopstatus' },
    { text: T.addProduct, callback_data: 'admin:padd', style: 'success' },
  ]);
  if (!items.length) {
    text += '\n📭 هنوز محصولی تعریف نشده است.\n\n' +
            '<i>از دکمه «➕ محصول جدید» محصول بسازید\n' +
            'یا از خط فرمان:\n' +
            'node foxcoin.js product-add \'{"id":"P1",...}\'</i>';
  } else {
    for (const p of items) {
      rows.push([
        { text: (p.active === false ? '⏸ ' : '') + p.label + ' — ' +
                fa(p.coins) + ' کوین',
          callback_data: 'admin:pedit:' + p.id },
      ]);
    }
  }
  rows.push([{ text: T.back, callback_data: 'admin' }]);
  return { text: text, markup: kb(rows) };
}

/** سوئیچ باز/بسته فروشگاه. خرید کاربر عادی بلافاصله متوقف/آزاد می‌شود. */
function toggleShop() {
  coin.setSetting('shopEnabled', !coin.getSettings().shopEnabled);
  return screenProducts();
}

/** صفحه جزئیات یک محصول: همه فیلدها اینجا ویرایش می‌شوند. */
function screenProductEdit(id) {
  const p = coin.getProduct(id);
  if (!p) return screenProducts();
  const text =
    '<b>🛍 ' + p.label + '</b>\n' + LINE + '\n\n' +
    'دسته: ' + (p.cat === 'days' ? '🗓 زمانی' : '📦 حجمی') + '\n' +
    '🛰 پلن <code>' + p.planId + '</code>\n' +
    '💾 حجم <code>' + fa(p.gb) + '</code> گیگ\n' +
    '⏱ مدت <code>' + fa(p.days) + '</code> روز\n' +
    '💎 قیمت <code>' + fa(p.coins) + '</code> کوین\n' +
    'وضعیت: ' + (p.active === false ? '⏸ غیرفعال' : '✅ فعال') + '\n\n' +
    '<i>ویرایش‌ها همان لحظه اعمال می‌شود.</i>';
  return { text: text, markup: kb([
    [{ text: '💾 حجم', callback_data: 'admin:pgb:' + p.id },
     { text: '⏱ مدت', callback_data: 'admin:pdays:' + p.id }],
    [{ text: '💎 قیمت کوینی', callback_data: 'admin:pcoins:' + p.id }],
    [{ text: T.autoName, callback_data: 'admin:plabel:' + p.id },
     { text: T.changePlan, callback_data: 'admin:pplan:' + p.id }],
    [{ text: T.changeCat + ' (' + (p.cat === 'days' ? '🗓 زمانی' : '📦 حجمی') + ')',
      callback_data: 'admin:pcat:' + p.id }],
    [{ text: p.active === false ? '▶️ فعال‌سازی' : '⏸ غیرفعال',
      callback_data: 'admin:ptoggle:' + p.id },
     { text: '🗑 حذف', callback_data: 'admin:pdel:' + p.id }],
    [{ text: T.back, callback_data: 'admin:products' }],
  ]) };
}

/** بازسازی نام محصول از نام پلن زنده + حجم + مدت. */
async function doAutoLabel(ctx, id) {
  const p = coin.getProduct(id);
  if (!p) return screenProducts();
  let label = p.planId;
  try {
    const plans = await ctx.getPlans(ctx.env, p.cat);
    const plan = (plans || []).find(x => String(x.id) === String(p.planId));
    if (plan && plan.name) label = plan.name;
  } catch (e) { /* برچسب همان شناسه پلن می‌ماند */ }
  if (p.gb > 0) label += ' — ' + fa(p.gb) + ' گیگ';
  if (p.days > 0) label += ' — ' + fa(p.days) + ' روز';
  coin.setProduct(Object.assign({}, p, { label: label }));
  return screenProductEdit(id);
}

/** انتخاب پلن جدید برای محصول، از لیست زنده پلن‌های همان دسته. */
async function screenPickProductPlan(ctx, id) {
  const p = coin.getProduct(id);
  if (!p) return screenProducts();
  const head = '<b>' + T.changePlan + '</b>\n' + LINE + '\n\n' +
               '📦 ' + p.label + '\n' +
               'دسته: ' + (p.cat === 'days' ? '🗓 زمانی' : '📦 حجمی') + '\n\n';
  if (!ctx.getPlans) {
    return { text: head + '❌ ربات لیست پلن‌ها را در اختیار پنل نمی‌گذارد.',
             markup: kb([[{ text: T.back, callback_data: 'admin:pedit:' + id }]]) };
  }
  let plans = null;
  try { plans = await ctx.getPlans(ctx.env, p.cat); } catch (e) { plans = null; }
  if (!plans || !plans.length) {
    return { text: head + '❌ در این دسته پلنی پیدا نشد.',
             markup: kb([[{ text: T.back, callback_data: 'admin:pedit:' + id }]]) };
  }
  const rows = plans.map(pl => ([
    { text: (pl.name || pl.id) + '  <code>' + pl.id + '</code>',
      callback_data: 'admin:pplanpick:' + id + ':' + pl.id },
  ]));
  rows.push([{ text: T.back, callback_data: 'admin:pedit:' + id }]);
  return { text: head + '<i>پلن جدید را انتخاب کنید.</i>',
           markup: kb(rows) };
}

function doChangePlan(id, planId) {
  const p = coin.getProduct(id);
  if (p) coin.setProduct(Object.assign({}, p, { planId: String(planId) }));
  return screenProductEdit(id);
}

/** تغییر دسته (حجمی ↔ زمانی)؛ بعد از تغییر، پلن جدید انتخاب می‌شود. */
async function doToggleCat(ctx, id) {
  const p = coin.getProduct(id);
  if (!p) return screenProducts();
  const cat = p.cat === 'days' ? 'volume' : 'days';
  coin.setProduct(Object.assign({}, p, { cat: cat }));
  return screenPickProductPlan(ctx, id);
}

/** صفحه تنظیم یک فیلد عددی محصول با دکمه‌های +/−. */
function screenNumAdjust(title, field, id, cur, unit) {
  const text =
    '<b>' + title + '</b>\n' + LINE + '\n\n' +
    'مقدار فعلی\n<code>' + fa(cur) + '</code> ' + unit + '\n\n' +
    '<i>هر دکمه همان لحظه اعمال می‌شود.</i>';
  return { text: text, markup: kb([
    [{ text: '➖100', callback_data: 'admin:' + field + 'v:' + id + ':-100' },
     { text: '➖10', callback_data: 'admin:' + field + 'v:' + id + ':-10' },
     { text: '➖1', callback_data: 'admin:' + field + 'v:' + id + ':-1' }],
    [{ text: '➕1', callback_data: 'admin:' + field + 'v:' + id + ':1' },
     { text: '➕10', callback_data: 'admin:' + field + 'v:' + id + ':10' },
     { text: '➕100', callback_data: 'admin:' + field + 'v:' + id + ':100' }],
    [{ text: T.back, callback_data: 'admin:pedit:' + id }],
  ]) };
}

function applyNumField(id, field, delta) {
  const p = coin.getProduct(id);
  if (p) {
    const cur = Number(p[field]) || 0;
    p[field] = Math.max(0, cur + Number(delta));
    coin.setProduct(p);
  }
  return screenProductEdit(id);
}

function screenProductGb(id) {
  const p = coin.getProduct(id);
  if (!p) return screenProducts();
  return screenNumAdjust('💾 حجم محصول', 'pgb', id, p.gb, 'گیگ');
}

function screenProductDays(id) {
  const p = coin.getProduct(id);
  if (!p) return screenProducts();
  return screenNumAdjust('⏱ مدت محصول', 'pdays', id, p.days, 'روز');
}

// ───────────────────────── ساخت محصول مرحله‌ای ─────────────────────────

/**
 * محصول جدید بدون تایپ متن ساخته می‌شود؛ همه حالت در خود callback_data
 * حمل می‌شود: <cat>:<planId>:<gb>:<days>:<coins>
 * پلن‌ها زنده از ربات (ctx.getPlans) خوانده می‌شوند.
 */
function addState(cat, planId, gb, days, coins) {
  return cat + ':' + planId + ':' + gb + ':' + days + ':' + coins;
}

function parseAddState(s) {
  const parts = String(s).split(':');
  return { cat: parts[0] || 'volume', planId: parts[1] || '',
           gb: Number(parts[2]) || 0, days: Number(parts[3]) || 0,
           coins: Number(parts[4]) || 0 };
}

function screenPickCat() {
  const text =
    '<b>' + T.addProduct + '</b>\n' + LINE + '\n\n' +
    '<i>اول دسته را انتخاب کنید.\n' +
    'محصول به یک پلن موجود در همان دسته وصل می‌شود.</i>';
  return { text: text, markup: kb([
    [{ text: '📦 حجمی (volume)', callback_data: 'admin:paddcat:volume' }],
    [{ text: '🗓 زمانی (days)', callback_data: 'admin:paddcat:days' }],
    [{ text: T.back, callback_data: 'admin:products' }],
  ]) };
}

async function screenPickPlan(ctx, cat) {
  const head = '<b>' + T.addProduct + '</b>\n' + LINE + '\n\n' +
               'دسته: ' + (cat === 'days' ? '🗓 زمانی' : '📦 حجمی') + '\n\n';
  if (!ctx.getPlans) {
    return { text: head +
             '❌ ربات لیست پلن‌ها را در اختیار پنل نمی‌گذارد.\n' +
             '<i>محصول را از خط فرمان اضافه کنید.</i>',
             markup: kb([[{ text: T.back, callback_data: 'admin:padd' }]]) };
  }
  let plans = null;
  try { plans = await ctx.getPlans(ctx.env, cat); } catch (e) { plans = null; }
  if (!plans || !plans.length) {
    return { text: head +
             '❌ در این دسته پلنی پیدا نشد.\n' +
             '<i>اول در ربات پلنی با این دسته بسازید.</i>',
             markup: kb([[{ text: T.back, callback_data: 'admin:padd' }]]) };
  }
  const rows = plans.map(pl => ([
    { text: (pl.name || pl.id) + '  <code>' + pl.id + '</code>',
      callback_data: 'admin:paddplan:' + cat + ':' + pl.id },
  ]));
  rows.push([{ text: T.back, callback_data: 'admin:padd' }]);
  return { text: head + '<i>پلن پایه را انتخاب کنید.</i>',
           markup: kb(rows) };
}

function screenAddGb(st) {
  const s = parseAddState(st);
  const cur = s.gb || (s.cat === 'days' ? 0 : 30);
  const text =
    '<b>' + T.addProduct + ' — حجم</b>\n' + LINE + '\n\n' +
    '🛰 پلن <code>' + s.planId + '</code>\n\n' +
    'حجم: <code>' + fa(cur) + '</code> گیگ\n\n' +
    '<i>اعمال فوری.</i>';
  return { text: text, markup: kb([
    [{ text: '➖10', callback_data: 'admin:paddgb:' + addState(s.cat, s.planId, Math.max(0, cur - 10), s.days, s.coins) },
     { text: '➖1', callback_data: 'admin:paddgb:' + addState(s.cat, s.planId, Math.max(0, cur - 1), s.days, s.coins) },
     { text: '➕1', callback_data: 'admin:paddgb:' + addState(s.cat, s.planId, cur + 1, s.days, s.coins) },
     { text: '➕10', callback_data: 'admin:paddgb:' + addState(s.cat, s.planId, cur + 10, s.days, s.coins) }],
    [{ text: '⏭ بعدی: مدت', callback_data: 'admin:padddays:' + addState(s.cat, s.planId, cur, s.days, s.coins),
       style: 'success' }],
    [{ text: T.back, callback_data: 'admin:padd' }],
  ]) };
}

function screenAddDays(st) {
  const s = parseAddState(st);
  const cur = s.days || 30;
  const text =
    '<b>' + T.addProduct + ' — مدت</b>\n' + LINE + '\n\n' +
    '🛰 پلن <code>' + s.planId + '</code>\n\n' +
    'مدت: <code>' + fa(cur) + '</code> روز\n\n' +
    '<i>اعمال فوری.</i>';
  return { text: text, markup: kb([
    [{ text: '➖10', callback_data: 'admin:padddays:' + addState(s.cat, s.planId, s.gb, Math.max(0, cur - 10), s.coins) },
     { text: '➖1', callback_data: 'admin:padddays:' + addState(s.cat, s.planId, s.gb, Math.max(0, cur - 1), s.coins) },
     { text: '➕1', callback_data: 'admin:padddays:' + addState(s.cat, s.planId, s.gb, cur + 1, s.coins) },
     { text: '➕10', callback_data: 'admin:padddays:' + addState(s.cat, s.planId, s.gb, cur + 10, s.coins) }],
    [{ text: '⏭ بعدی: قیمت', callback_data: 'admin:paddcoins:' + addState(s.cat, s.planId, s.gb, cur, s.coins),
       style: 'success' }],
    [{ text: T.back, callback_data: 'admin:padd' }],
  ]) };
}

function screenAddCoins(st) {
  const s = parseAddState(st);
  const cur = s.coins || 100;
  const text =
    '<b>' + T.addProduct + ' — قیمت و ثبت</b>\n' + LINE + '\n\n' +
    'دسته: ' + (s.cat === 'days' ? '🗓 زمانی' : '📦 حجمی') + '\n' +
    '🛰 پلن <code>' + s.planId + '</code>\n' +
    '💾 حجم <code>' + fa(s.gb || 0) + '</code> گیگ\n' +
    '⏱ مدت <code>' + fa(s.days || 0) + '</code> روز\n\n' +
    '💎 قیمت: <code>' + fa(cur) + '</code> کوین\n\n' +
    '<i>اعمال فوری.</i>';
  return { text: text, markup: kb([
    [{ text: '➖100', callback_data: 'admin:paddcoins:' + addState(s.cat, s.planId, s.gb, s.days, Math.max(0, cur - 100)) },
     { text: '➖10', callback_data: 'admin:paddcoins:' + addState(s.cat, s.planId, s.gb, s.days, Math.max(0, cur - 10)) },
     { text: '➖1', callback_data: 'admin:paddcoins:' + addState(s.cat, s.planId, s.gb, s.days, Math.max(0, cur - 1)) }],
    [{ text: '➕1', callback_data: 'admin:paddcoins:' + addState(s.cat, s.planId, s.gb, s.days, cur + 1) },
     { text: '➕10', callback_data: 'admin:paddcoins:' + addState(s.cat, s.planId, s.gb, s.days, cur + 10) },
     { text: '➕100', callback_data: 'admin:paddcoins:' + addState(s.cat, s.planId, s.gb, s.days, cur + 100) }],
    [{ text: '✅ ثبت محصول', callback_data: 'admin:paddgo:' + addState(s.cat, s.planId, s.gb, s.days, cur),
       style: 'success' }],
    [{ text: T.back, callback_data: 'admin:padd' }],
  ]) };
}

/** ساخت واقعی محصول. نام از پلن زنده خوانده می‌شود؛ شناسه خودکار است. */
async function doAddProduct(ctx, st) {
  const s = parseAddState(st);
  const key = 'add';
  if (busy.has(key)) return screenProducts();
  busy.add(key);
  try {
    let label = s.planId;
    try {
      const plans = await ctx.getPlans(ctx.env, s.cat);
      const plan = (plans || []).find(x => String(x.id) === String(s.planId));
      if (plan && plan.name) label = plan.name;
    } catch (e) { /* برچسب همان شناسه پلن می‌ماند */ }
    if (s.gb > 0) label += ' — ' + fa(s.gb) + ' گیگ';
    if (s.days > 0) label += ' — ' + fa(s.days) + ' روز';
    let id = 'P' + Date.now().toString(36).toUpperCase();
    for (let i = 0; i < 5 && coin.getProduct(id); i++) id += Math.floor(Math.random() * 10);
    const p = coin.setProduct({ id: id, label: label, planId: s.planId,
                                cat: s.cat, gb: s.gb, days: s.days, coins: s.coins });
    return {
      text: '<b>✅ محصول ساخته شد</b>\n' + LINE + '\n\n' +
            '📦 ' + p.label + '\n' +
            '🛰 پلن <code>' + p.planId + '</code>\n' +
            '💎 <code>' + fa(p.coins) + '</code> کوین\n\n' +
            '<i>در فروشگاه فعال است.</i>',
      markup: kb([[{ text: '🛍 بازگشت به فروشگاه', callback_data: 'admin:products' }]]),
    };
  } finally {
    busy.delete(key);
  }
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
    [{ text: T.back, callback_data: 'admin:pedit:' + id }],
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
  rows.push([{ text: T.allUsers, callback_data: 'admin:allusers:0' }]);
  rows.push([{ text: T.back, callback_data: 'admin' }]);
  return { text: text, markup: kb(rows) };
}

/** همه کاربران با صفحه‌بندی — برای دسترسی به هر کاربری، حتی بدون فعالیت اخیر. */
function screenAllUsers(page) {
  const all = coin.userList();
  const PER = 10;
  const pages = Math.max(1, Math.ceil(all.length / PER));
  const p = Math.min(Math.max(0, Number(page) || 0), pages - 1);
  const slice = all.slice(p * PER, p * PER + PER);
  let text = '<b>' + T.allUsers + '</b>\n' + LINE + '\n\n' +
             '<i>' + fa(all.length) + ' کاربر — صفحه ' + (p + 1) + ' از ' +
             pages + '</i>\n';
  const rows = slice.map(u => ([
    { text: '👤 ' + u.uid + '  —  ' + fa(coin.getBalance(u.uid)) + ' کوین',
      callback_data: 'admin:user:' + u.uid },
  ]));
  const nav = [];
  if (p > 0) nav.push({ text: '⬅️ قبلی', callback_data: 'admin:allusers:' + (p - 1) });
  nav.push({ text: (p + 1) + ' / ' + pages, callback_data: 'admin:allusers:' + p });
  if (p < pages - 1) nav.push({ text: '➡️ بعدی', callback_data: 'admin:allusers:' + (p + 1) });
  rows.push(nav);
  rows.push([{ text: T.back, callback_data: 'admin:users' }]);
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
    [{ text: T.setBal, callback_data: 'admin:setbal:' + uid + ':' +
      coin.getBalance(uid) + ':other' }],
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

/** صفحه تنظیم مقدار افزودن/کسر. مقدار و دلیل در خود دکمه‌ها حمل می‌شود. */
function screenAdjust(icon, title, uid, amount, maxHint, reason) {
  uid = String(uid);
  const amt = Math.max(0, Number(amount) || 0);
  reason = REASON_FA[reason] ? reason : 'other';
  const prefix = title.indexOf('کسر') === -1 ? 'grant' : 'revoke';
  let text =
    '<b>' + icon + ' ' + title + '</b>\n' + LINE + '\n\n' +
    '👤 کاربر <code>' + uid + '</code>\n\n' +
    '💰 موجودی فعلی <code>' + fa(coin.getBalance(uid)) +
    '</code> کوین\n\n' +
    'مقدار\n<code>' + fa(amt) + '</code> کوین\n\n' +
    '📌 دلیل: <b>' + REASON_FA[reason] + '</b>\n\n' +
    '<i>' + (maxHint || '') + '</i>';
  const go = [{ text: '✅ تأیید و ثبت (' + fa(amt) + ')',
                callback_data: 'admin:' + prefix + 'go:' + uid + ':' +
                amt + ':' + reason,
                style: 'success' }];
  const reasonRow = REASONS.map(([k, label]) => ({
    text: (k === reason ? '✅ ' : '') + label,
    callback_data: 'admin:' + prefix + 'v:' + uid + ':' + amt + ':' + k,
  }));
  return { text: text, markup: kb([
    [{ text: '➕100', callback_data: 'admin:' + prefix + 'v:' + uid + ':' + (amt + 100) + ':' + reason },
     { text: '➕50', callback_data: 'admin:' + prefix + 'v:' + uid + ':' + (amt + 50) + ':' + reason },
     { text: '➕10', callback_data: 'admin:' + prefix + 'v:' + uid + ':' + (amt + 10) + ':' + reason }],
    [{ text: '➖10', callback_data: 'admin:' + prefix + 'v:' + uid + ':' + Math.max(0, amt - 10) + ':' + reason },
     { text: '➖50', callback_data: 'admin:' + prefix + 'v:' + uid + ':' + Math.max(0, amt - 50) + ':' + reason },
     { text: '➖100', callback_data: 'admin:' + prefix + 'v:' + uid + ':' + Math.max(0, amt - 100) + ':' + reason }],
    reasonRow,
    amt > 0 ? go : [],
    [{ text: '⬅️ انصراف', callback_data: 'admin:user:' + uid }],
  ]) };
}

function screenGrant(uid, amount, reason) {
  return screenAdjust('➕', 'افزودن کوین', uid, amount,
    'رویداد با نوع «اصلاح ادمین» در گردش حساب کاربر ثبت می‌شود.', reason);
}

function screenRevoke(uid, amount, reason) {
  return screenAdjust('➖', 'کسر کوین', uid, amount,
    'بیش از موجودی قابل کسر نیست.', reason);
}

// ───────────────────────── تنظیم دقیق موجودی ─────────────────────────

/**
 * موجودی کاربر را دقیقاً روی عدد دلخواه می‌گذارد (نه +/−).
 * اختلاف به‌صورت یک رویداد ادمین با دلیل در دفتر ثبت می‌شود.
 */
function screenSetBal(uid, target, reason) {
  uid = String(uid);
  const cur = coin.getBalance(uid);
  const t = Math.max(0, Math.round(Number(target) || 0));
  reason = REASON_FA[reason] ? reason : 'other';
  const diff = t - cur;
  let text =
    '<b>' + T.setBal + '</b>\n' + LINE + '\n\n' +
    '👤 کاربر <code>' + uid + '</code>\n\n' +
    '💰 موجودی فعلی <code>' + fa(cur) + '</code> کوین\n' +
    '🎯 موجودی جدید <code>' + fa(t) + '</code> کوین\n';
  if (diff !== 0) {
    text += '📊 تغییر: <code>' + (diff > 0 ? '+' : '') + fa(diff) +
            '</code> کوین\n';
  }
  text += '\n📌 دلیل: <b>' + REASON_FA[reason] + '</b>\n\n' +
          '<i>با تأیید، موجودی دقیقاً همان عدد می‌شود.</i>';
  const reasonRow = REASONS.map(([k, label]) => ({
    text: (k === reason ? '✅ ' : '') + label,
    callback_data: 'admin:setbal:' + uid + ':' + t + ':' + k,
  }));
  return { text: text, markup: kb([
    [{ text: '➖1000', callback_data: 'admin:setbal:' + uid + ':' + Math.max(0, t - 1000) + ':' + reason },
     { text: '➖100', callback_data: 'admin:setbal:' + uid + ':' + Math.max(0, t - 100) + ':' + reason },
     { text: '➖10', callback_data: 'admin:setbal:' + uid + ':' + Math.max(0, t - 10) + ':' + reason },
     { text: '➖1', callback_data: 'admin:setbal:' + uid + ':' + Math.max(0, t - 1) + ':' + reason }],
    [{ text: '➕1', callback_data: 'admin:setbal:' + uid + ':' + (t + 1) + ':' + reason },
     { text: '➕10', callback_data: 'admin:setbal:' + uid + ':' + (t + 10) + ':' + reason },
     { text: '➕100', callback_data: 'admin:setbal:' + uid + ':' + (t + 100) + ':' + reason },
     { text: '➕1000', callback_data: 'admin:setbal:' + uid + ':' + (t + 1000) + ':' + reason }],
    reasonRow,
    [{ text: '✅ ثبت موجودی (' + fa(t) + ')',
       callback_data: 'admin:setbalgo:' + uid + ':' + t + ':' + reason,
       style: 'success' }],
    [{ text: '⬅️ انصراف', callback_data: 'admin:user:' + uid }],
  ]) };
}

function doSetBal(uid, target, reason) {
  uid = String(uid);
  const cur = coin.getBalance(uid);
  const t = Math.max(0, Math.round(Number(target) || 0));
  reason = REASON_FA[reason] ? reason : 'other';
  if (t === cur) {
    return { text: '⚠️ موجودی همین مقدار است؛ تغییری لازم نبود.',
             markup: kb([[{ text: '👤 بازگشت به کاربر',
                            callback_data: 'admin:user:' + uid }]]) };
  }
  const r = coin.addEvent(uid, 'admin', t - cur,
                          { note: REASON_FA[reason] + ' — تنظیم دقیق' });
  if (!r.ok) {
    return { text: '❌ ' + r.reason, markup: kb([
      [{ text: '👤 بازگشت به کاربر', callback_data: 'admin:user:' + uid }]]) };
  }
  return {
    text: '<b>✅ موجودی تنظیم شد</b>\n' + LINE + '\n\n' +
          '👤 <code>' + uid + '</code>\n' +
          '💰 قبلی <code>' + fa(cur) + '</code> → جدید <code>' +
          fa(r.balance) + '</code> کوین\n\n' +
          '<i>دلیل: ' + REASON_FA[reason] + ' — در گردش حساب ثبت شد.</i>',
    markup: kb([[{ text: '👤 بازگشت به کاربر',
                   callback_data: 'admin:user:' + uid }]]),
  };
}

function doAdjust(uid, amount, sign, reason, doneLabel) {
  uid = String(uid);
  const amt = Math.round(Number(amount));
  reason = REASON_FA[reason] ? reason : 'other';
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
                      { note: REASON_FA[reason] + ' — ' + doneLabel +
                        ' از پنل مدیریت' });
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
          '📌 دلیل: ' + REASON_FA[reason] + '\n' +
          '💰 موجودی جدید: <code>' + fa(r.balance) + '</code> کوین\n\n' +
          '<i>در گردش حساب کاربر ثبت شد.</i>',
    markup: kb([[{ text: '👤 بازگشت به کاربر',
                   callback_data: 'admin:user:' + uid }]]),
  };
}

function doGrant(uid, amount, reason) {
  return doAdjust(uid, amount, 1, reason || 'gift', 'به کاربر اضافه شد');
}

function doRevoke(uid, amount, reason) {
  return doAdjust(uid, amount, -1, reason || 'balance', 'از کاربر کسر شد');
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
  pedit: 'admin:pedit:', pgb: 'admin:pgb:', pgbv: 'admin:pgbv:',
  pdays: 'admin:pdays:', pdaysv: 'admin:pdaysv:',
  paddcat: 'admin:paddcat:', paddplan: 'admin:paddplan:',
  paddgb: 'admin:paddgb:', padddays: 'admin:padddays:',
  paddcoins: 'admin:paddcoins:', paddgo: 'admin:paddgo:',
  plabel: 'admin:plabel:', pplan: 'admin:pplan:',
  pplanpick: 'admin:pplanpick:', pcat: 'admin:pcat:',
  setbal: 'admin:setbal:', setbalgo: 'admin:setbalgo:',
  allusers: 'admin:allusers:',
  rcoins: 'admin:rcoins:', rcoinsv: 'admin:rcoinsv:',
  rreset: 'admin:rreset:', rdel: 'admin:rdel:',
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
  else if (d === 'admin:shopstatus') s = toggleShop();
  else if (d === 'admin:padd') s = screenPickCat();
  else if (d.startsWith(P.paddcat)) s = await screenPickPlan(ctx, after(d, P.paddcat));
  else if (d.startsWith(P.paddplan)) s = screenAddGb(after(d, P.paddplan));
  else if (d.startsWith(P.paddgb)) s = screenAddDays(after(d, P.paddgb));
  else if (d.startsWith(P.padddays)) s = screenAddCoins(after(d, P.padddays));
  else if (d.startsWith(P.paddcoins)) s = screenAddCoins(after(d, P.paddcoins));
  else if (d.startsWith(P.paddgo)) s = await doAddProduct(ctx, after(d, P.paddgo));
  else if (d.startsWith(P.pedit)) s = screenProductEdit(after(d, P.pedit));
  else if (d.startsWith(P.pgb)) s = screenProductGb(after(d, P.pgb));
  else if (d.startsWith(P.pgbv)) {
    const [id, v] = after(d, P.pgbv).split(':');
    s = applyNumField(id, 'gb', v);
  } else if (d.startsWith(P.pdays)) s = screenProductDays(after(d, P.pdays));
  else if (d.startsWith(P.pdaysv)) {
    const [id, v] = after(d, P.pdaysv).split(':');
    s = applyNumField(id, 'days', v);
  } else if (d.startsWith(P.plabel)) s = await doAutoLabel(ctx, after(d, P.plabel));
  else if (d.startsWith(P.pplan)) s = await screenPickProductPlan(ctx, after(d, P.pplan));
  else if (d.startsWith(P.pplanpick)) {
    const [id, pl] = after(d, P.pplanpick).split(':');
    s = doChangePlan(id, pl);
  } else if (d.startsWith(P.pcat)) s = await doToggleCat(ctx, after(d, P.pcat));
  else if (d === 'admin:users') s = screenUsers();
  else if (d === 'admin:allusers') s = screenAllUsers(0);
  else if (d.startsWith(P.allusers)) s = screenAllUsers(Number(after(d, P.allusers)) || 0);
  else if (d.startsWith(P.setbal)) {
    const parts = after(d, P.setbal).split(':');
    s = screenSetBal(parts[0], Number(parts[1]) || 0, parts[2] || 'other');
  } else if (d.startsWith(P.setbalgo)) {
    const parts = after(d, P.setbalgo).split(':');
    s = doSetBal(parts[0], Number(parts[1]) || 0, parts[2] || 'other');
  } else if (d === 'admin:rewards') s = screenRewards();
  else if (d.startsWith(P.rcoins)) s = screenRewardEdit(after(d, P.rcoins));
  else if (d.startsWith(P.rcoinsv)) {
    const [k, v] = after(d, P.rcoinsv).split(':');
    s = applyReward(k, v);
  } else if (d.startsWith(P.rreset)) s = resetReward(after(d, P.rreset));
  else if (d.startsWith(P.rdel)) s = deleteReward(after(d, P.rdel));
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
    s = screenGrant(after(d, P.grant), 0, 'gift');
  } else if (d.startsWith(P.grantv)) {
    const [u, amt, r] = after(d, P.grantv).split(':');
    s = screenGrant(u, amt, r);
  } else if (d.startsWith(P.grantgo)) {
    const [u, amt, r] = after(d, P.grantgo).split(':');
    s = doGrant(u, amt, r);
  } else if (d.startsWith(P.revoke)) {
    s = screenRevoke(after(d, P.revoke), 0, 'balance');
  } else if (d.startsWith(P.revokev)) {
    const [u, amt, r] = after(d, P.revokev).split(':');
    s = screenRevoke(u, amt, r);
  } else if (d.startsWith(P.revokego)) {
    const [u, amt, r] = after(d, P.revokego).split(':');
    s = doRevoke(u, amt, r);
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
                   screenUsers, screenAllUsers, screenPrices, screenLedger,
                   screenRewards, screenHelp, doGrant, doRevoke, doSetBal };

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
    const go = async (data, cfg, extra) => route({
      data: data, uid: 'u9', config: cfg || { admins: ['u9'] },
      chatId: 1, messageId: 2, editTelegram: fakeEdit,
      ...(extra || {}),
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

      // ── فاکس شاپ: باز/بسته
      await go('admin:shopstatus');
      a(coin.getSettings().shopEnabled === false, 'فروشگاه بسته شد');
      await go('admin:shopstatus');
      a(coin.getSettings().shopEnabled === true, 'فروشگاه باز شد');

      // ── ساخت محصول مرحله‌ای با پلن زنده از ربات
      const plans = [{ id: 'PL1', name: 'نقره‌ای', days: 30, inbounds: [{ id: 7 }] }];
      const getPlans = async () => plans;
      await go('admin:padd');
      a(JSON.stringify(sent.markup).includes('حجمی'), 'انتخاب دسته باز شد');
      await go('admin:paddcat:volume', null, { getPlans: getPlans });
      a(JSON.stringify(sent.markup).includes('نقره‌ای'), 'پلن‌ها از ربات فهرست شدند');
      await go('admin:paddplan:volume:PL1');
      a(sent.text.includes('گیگ'), 'مرحله حجم باز شد');
      await go('admin:paddgb:volume:PL1:40:30:100');
      a(sent.text.includes('روز'), 'مرحله مدت باز شد');
      await go('admin:padddays:volume:PL1:40:45:100');
      a(sent.text.includes('کوین'), 'مرحله قیمت باز شد');
      await go('admin:paddcoins:volume:PL1:40:45:150');
      a(sent.text.includes('PL1') && sent.text.includes('150'),
        'خلاصه پیش از ثبت نمایش داده شد');
      await go('admin:paddgo:volume:PL1:40:45:150', null, { getPlans: getPlans });
      const np = coin.listProducts().find(x => x.planId === 'PL1' && x.gb === 40);
      a(!!np, 'محصول جدید ساخته شد');
      a(np.label.includes('نقره‌ای') && np.label.includes('40'), 'برچسب محصول درست شد');
      a(np.coins === 150 && np.days === 45, 'قیمت و مدت محصول درست شد');

      // ── ویرایش محصول: حجم و مدت
      await go('admin:pedit:' + np.id);
      a(sent.text.includes('حجم'), 'صفحه ویرایش محصول باز شد');
      await go('admin:pgb:' + np.id);
      a(sent.text.includes('40'), 'مقدار فعلی حجم نمایش داده شد');
      await go('admin:pgbv:' + np.id + ':10');
      a(coin.getProduct(np.id).gb === 50, 'حجم محصول ویرایش شد');
      await go('admin:pdaysv:' + np.id + ':-5');
      a(coin.getProduct(np.id).days === 40, 'مدت محصول ویرایش شد');
      await go('admin:ptoggle:' + np.id);
      a(coin.getProduct(np.id).active === false, 'محصول جدید غیرفعال شد');

      // ── ویرایش کامل محصول: نام خودکار، تغییر پلن، تغییر دسته
      const plans2 = [{ id: 'PL1', name: 'نقره‌ای' }, { id: 'PL2', name: 'طلایی' }];
      const getPlans2 = async () => plans2;
      await go('admin:plabel:' + np.id, null, { getPlans: getPlans2 });
      a(coin.getProduct(np.id).label.includes('نقره‌ای'),
        'نام خودکار از نام پلن ساخته شد');
      await go('admin:pplan:' + np.id, null, { getPlans: getPlans2 });
      a(JSON.stringify(sent.markup).includes('طلایی'),
        'لیست پلن‌ها برای تغییر باز شد');
      await go('admin:pplanpick:' + np.id + ':PL2');
      a(coin.getProduct(np.id).planId === 'PL2', 'پلن محصول عوض شد');
      await go('admin:pcat:' + np.id, null, { getPlans: getPlans2 });
      a(coin.getProduct(np.id).cat === 'days', 'دسته محصول عوض شد');
      await go('admin:pcat:' + np.id, null, { getPlans: getPlans2 });
      a(coin.getProduct(np.id).cat === 'volume', 'دسته محصول برگشت');

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

      // ── دلیل در افزودن/کسر
      await go('admin:grantv:u7:10:prize');
      a(sent.text.includes('جایزه'), 'دلیل انتخاب‌شده نمایش داده شد');
      await go('admin:grantgo:u7:10:prize');
      a(coin.history('u7', 1)[0].meta.note.includes('جایزه'),
        'دلیل جایزه در دفتر ثبت شد');

      // ── تنظیم دقیق موجودی
      await go('admin:setbal:u7:100:gift');
      a(sent.text.includes('موجودی جدید') && sent.text.includes('100'),
        'صفحه تنظیم دقیق باز شد');
      await go('admin:setbalgo:u7:100:gift');
      a(coin.getBalance('u7') === 100, 'موجودی دقیقاً ۱۰۰ شد');
      a(coin.history('u7', 1)[0].meta.note.includes('هدیه'),
        'دلیل هدیه در تنظیم دقیق ثبت شد');
      await go('admin:setbalgo:u7:100:gift');
      a(coin.getBalance('u7') === 100, 'بدون تغییر، دست نمی‌زند');
      await go('admin:setbal:u7:0:balance');
      await go('admin:setbalgo:u7:0:balance');
      a(coin.getBalance('u7') === 0, 'صفر کردن موجودی کار کرد');
      await go('admin:setbal:u7:300:fix');
      await go('admin:setbalgo:u7:300:fix');
      a(coin.getBalance('u7') === 300, 'بازگرداندن موجودی کار کرد');

      // ── همه کاربران
      await go('admin:allusers:0');
      a(JSON.stringify(sent.markup).includes('u7') &&
        JSON.stringify(sent.markup).includes('u9'),
        'همه کاربران فهرست شدند');
      a(sent.text.includes('صفحه 1'), 'صفحه‌بندی نمایش داده شد');

      // ── جوایز فعالیت
      await go('admin:rewards');
      a(sent.text.includes('جوایز') &&
        JSON.stringify(sent.markup).includes('جوین'),
        'صفحه جوایز باز شد');
      await go('admin:rcoins:join');
      a(sent.text.includes('10'), 'جایزه فعلی جوین نمایش داده شد');
      await go('admin:rcoinsv:join:5');
      a(coin.getRewards().join === 15, 'جایزه جوین با دکمه تغییر کرد');
      await go('admin:rreset:join');
      a(coin.getRewards().join === 10, 'ریست جایزه به پیش‌فرض کار کرد');
      coin.addRewardAction('daily', 7);
      await go('admin:rcoins:daily');
      a(sent.text.includes('7'), 'فعالیت سفارشی در پنل دیده شد');
      await go('admin:rcoinsv:daily:3');
      a(coin.getRewards().daily === 10, 'جایزه فعالیت سفارشی ویرایش شد');
      await go('admin:rdel:daily');
      a(!('daily' in coin.getRewards()), 'فعالیت سفارشی حذف شد');
      await go('admin:rdel:join');
      a(coin.getRewards().join === 10, 'پیش‌فرض با حذف حذف نمی‌شود');

      // ── دفتر کل و مسیر ناشناخته
      await go('admin:ledger');
      a(sent.text.includes('دعوت دوستان'), 'دفتر کل نام فارسی رویداد را نشان داد');
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
