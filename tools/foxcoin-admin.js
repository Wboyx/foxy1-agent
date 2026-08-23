'use strict';
/**
 * ════════════════════════════════════════════════════════════════
 *  FOX COIN ADMIN — پنل مدیریت فاکس کوین
 *  نسخه: 1.9.1 | 2026-08-23 | مرکز جوایز + ماموریت‌ها + ناوبری مسیرمحور
 *  ۱.۶.۰: تشخیص نبود هوک getPlans + راه «افزودن دستی» محصول
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
  manualAdd: '✍️ افزودن دستی (بدون لیست پلن)',
  changePlan: '🛰 تغییر پلن',
  changeCat: '🔄 تغییر دسته',
  prices: '🧮 فرمول قیمت',
  ledger: '📜 دفتر کل',
  rewards: '🎁 جوایز فعالیت',
  hub: '🎁 مرکز جوایز',
  missions: '🎯 ماموریت‌ها',
  cap: '🚦 سقف روزانه',
  texts: '📝 متن‌ها',
  help: '❓ راهنما',
  back: '⬅️ بازگشت',
  coinMenu: '🦊 منوی کوین',
};

/** برچسب فارسی هر متن سفارشی، برای پنل. */
const TEXTS_FA = {
  menu_note: 'متن تشویقی منوی کوین',
  guide_what: 'متن «فاکس کوین چیست»',
  guide_rules: 'متن قوانین (با {dailyCap})',
  guide_footer: 'سطر پایانی راهنما',
  earn_signup: 'عنوان بخش ثبت‌نام',
  earn_join: 'عنوان بخش جوین',
  earn_purchase: 'عنوان بخش خرید',
  earn_mission: 'عنوان بخش ماموریت',
  earn_referral: 'عنوان بخش دعوت دوستان',
  earn_daily: 'عنوان بخش حضور روزانه',
  earn_first_purchase: 'عنوان بخش اولین خرید',
  earn_signup_welcome: 'عنوان هدیه خوش‌آمد',
  earn_ref_purchase: 'عنوان بخش خرید زیرمجموعه',
};

/**
 * متن‌ها در دو دسته. قبلاً هر سیزده‌تا در یک لیست بلند می‌آمدند و
 * پیش‌نمایششان داخل خودِ دکمه بود — دکمه دو خطی و درهم می‌شد.
 * حالا پیش‌نمایش‌ها در متن پیام‌اند و دکمه‌ها فقط نام کوتاه.
 */
const TEXT_CATS = [
  { id: 'guide', icon: '📖', label: 'راهنما و منو',
    keys: ['menu_note', 'guide_what', 'guide_rules', 'guide_footer'] },
  { id: 'earn', icon: '💰', label: 'عنوان راه‌های کسب کوین',
    keys: ['earn_signup', 'earn_signup_welcome', 'earn_daily', 'earn_purchase',
           'earn_first_purchase', 'earn_mission', 'earn_join',
           'earn_referral', 'earn_ref_purchase'] },
];

/** نام کوتاه برای دکمه — بدون تکرار «عنوان بخش» در هر ردیف. */
const TEXT_SHORT = {
  menu_note: 'تشویقی منو', guide_what: 'کوین چیست',
  guide_rules: 'قوانین', guide_footer: 'پایان راهنما',
  earn_signup: 'ثبت‌نام', earn_signup_welcome: 'هدیه خوش‌آمد',
  earn_daily: 'حضور روزانه', earn_purchase: 'خرید',
  earn_first_purchase: 'اولین خرید', earn_mission: 'ماموریت',
  earn_join: 'جوین', earn_referral: 'دعوت دوستان',
  earn_ref_purchase: 'خرید زیرمجموعه',
};

/**
 * ویرایش‌های متن در انتظار: شناسه ادمین → کلید متن.
 * این حالت فقط در حافظه است و پس از دریافت متن یا ۵ دقیقه پاک می‌شود.
 * بستن درِ واقعی همچنان isAdmin است.
 */
const pendingEdits = new Map();

/**
 * ── پشته ناوبری ────────────────────────────────────────────
 * باگ: دکمه «بازگشت» هر صفحه مقصدش ثابت کدنویسی شده بود، پس هر
 * صفحه فرض می‌کرد فقط از یک راه باز می‌شود. وقتی «مرکز جوایز»
 * راه دومی به پلکان باز کرد، بازگشتِ پلکان همچنان به والد قدیمی
 * می‌رفت و ادمین سر از صفحه‌ای درمی‌آورد که اصلاً نرفته بود.
 *
 * حالا مسیر واقعی هر ادمین نگه داشته می‌شود و «بازگشت» یعنی یک
 * پله عقب در همان مسیری که خودش آمده.
 */
const navStacks = new Map();

/** آیا این callback یک «صفحه» است یا یک «عمل»؟ فقط صفحه‌ها در مسیر ثبت می‌شوند. */
const SCREEN_EXACT = new Set([
  'admin', 'admin:hub', 'admin:tier', 'admin:miss', 'admin:missnew',
  'admin:cap', 'admin:rewards', 'admin:settings', 'admin:texts',
  'admin:products', 'admin:padd', 'admin:users', 'admin:allusers',
  'admin:pricing', 'admin:stats', 'admin:ledger', 'admin:help',
]);

const SCREEN_PREFIX = [
  'admin:missed:', 'admin:missc:', 'admin:missn:', 'admin:missdel:',
  'admin:tedit:', 'admin:tcat:', 'admin:pedit:', 'admin:pgb:', 'admin:pdays:',
  'admin:pcoins:', 'admin:pplan:', 'admin:pdel:',
  'admin:paddcat:', 'admin:paddplan:', 'admin:paddgb:', 'admin:padddays:',
  'admin:paddcoins:', 'admin:user:', 'admin:uhist:', 'admin:grant:',
  'admin:revoke:', 'admin:setbal:', 'admin:pcf:', 'admin:set:',
  'admin:rcoins:', 'admin:allusers:',
];

function isScreen(d) {
  return SCREEN_EXACT.has(d) || SCREEN_PREFIX.some(x => d.startsWith(x));
}

/**
 * والد پیش‌فرض — فقط وقتی به کار می‌آید که پشته خالی باشد
 * (مثلاً ربات بعد از ری‌استارت، اولین کلیک ادمین «بازگشت» باشد).
 */
const PARENT_EXACT = {
  'admin:hub': 'admin', 'admin:tier': 'admin:hub', 'admin:miss': 'admin:hub',
  'admin:missnew': 'admin:miss', 'admin:cap': 'admin:hub',
  'admin:rewards': 'admin:hub', 'admin:settings': 'admin',
  'admin:texts': 'admin', 'admin:products': 'admin', 'admin:padd': 'admin:products',
  'admin:users': 'admin', 'admin:allusers': 'admin:users',
  'admin:pricing': 'admin', 'admin:stats': 'admin', 'admin:ledger': 'admin',
  'admin:help': 'admin',
};

const PARENT_PREFIX = [
  ['admin:missed:', 'admin:miss'], ['admin:missc:', 'admin:miss'],
  ['admin:missn:', 'admin:miss'], ['admin:missdel:', 'admin:miss'],
  ['admin:tcat:', 'admin:texts'], ['admin:tedit:', 'admin:texts'],
  ['admin:pedit:', 'admin:products'], ['admin:pgb:', 'admin:products'],
  ['admin:pdays:', 'admin:products'], ['admin:pcoins:', 'admin:products'],
  ['admin:pplan:', 'admin:products'], ['admin:pdel:', 'admin:products'],
  ['admin:paddcat:', 'admin:padd'], ['admin:paddplan:', 'admin:padd'],
  ['admin:paddgb:', 'admin:padd'], ['admin:padddays:', 'admin:padd'],
  ['admin:paddcoins:', 'admin:padd'],
  ['admin:user:', 'admin:users'], ['admin:uhist:', 'admin:users'],
  ['admin:grant:', 'admin:users'], ['admin:revoke:', 'admin:users'],
  ['admin:setbal:', 'admin:users'], ['admin:allusers:', 'admin:users'],
  ['admin:pcf:', 'admin:pricing'], ['admin:set:', 'admin:settings'],
  ['admin:rcoins:', 'admin:rewards'],
];

function parentOf(d) {
  if (PARENT_EXACT[d]) return PARENT_EXACT[d];
  for (const [pre, par] of PARENT_PREFIX) if (d.startsWith(pre)) return par;
  return 'admin';
}

/**
 * ثبت صفحه در مسیر. اگر ادمین به صفحه‌ای برگردد که قبلاً در مسیر
 * بوده، دُم مسیر بریده می‌شود تا حلقه نسازد (رفت و برگشت پیاپی
 * بین دو صفحه نباید پشته را بی‌نهایت بزرگ کند).
 */
function navPush(uid, d) {
  uid = String(uid);
  let st = navStacks.get(uid) || [];

  // منوی اصلی همیشه ریشه است: رفتن به آن یعنی مسیر تازه.
  if (d === 'admin') { navStacks.set(uid, ['admin']); return; }

  // ریشه را تضمین کن تا «بازگشت» هیچ‌وقت به بن‌بست نرسد.
  if (st[0] !== 'admin') st = ['admin'].concat(st);

  if (st[st.length - 1] === d) { navStacks.set(uid, st); return; }

  // اگر همین صفحه جای دیگری در مسیر هست، فقط وقتی مسیر را آنجا
  // می‌بُریم که والدش همان صفحه فعلی باشد — یعنی ادمین واقعاً حلقه
  // زده و دارد برمی‌گردد. وگرنه از راه دیگری به این صفحه رسیده و
  // مسیر تازه باید حفظ شود: «جوایز» هم از مرکز جوایز باز می‌شود،
  // هم از تنظیمات، و این دو یکی نیستند.
  const at = st.indexOf(d);
  if (at > 0 && st[at - 1] === st[st.length - 1]) st.length = at + 1;
  else st.push(d);

  // پشته را کوتاه نگه دار، ولی ریشه را قربانی نکن.
  while (st.length > 12) st.splice(1, 1);
  navStacks.set(uid, st);
}

/** یک پله عقب در مسیر واقعی همین ادمین. */
function navBack(uid) {
  uid = String(uid);
  const st = navStacks.get(uid) || [];
  const cur = st.pop();
  navStacks.set(uid, st);
  return st[st.length - 1] || parentOf(cur || 'admin');
}

function pendingText(uid) {
  const p = pendingEdits.get(String(uid));
  if (!p) return null;
  if (Date.now() - p.at > 5 * 60 * 1000) {
    pendingEdits.delete(String(uid));
    return null;
  }
  return p;
}

function clearPending(uid) {
  pendingEdits.delete(String(uid));
}

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

/** برچسب فارسی دسته. ربات فقط volume و unlimited دارد. */
function catLabel(c) {
  return coin.normCat(c) === 'unlimited' ? '♾ نامحدود' : '🧬 حجمی';
}

/**
 * چرا این پیام مهم است:
 *   پنل پلن‌ها را خودش نمی‌سازد؛ ربات باید تابع getPlans را به آن
 *   بدهد. وصله patch-foxcoin-admin.py این تابع را در ctx نمی‌گذاشت،
 *   برای همین «محصول جدید» همیشه به بن‌بست می‌خورد. اگر باز هم
 *   تزریق نشده باشد، به‌جای بن‌بست، راه دستی باز می‌ماند.
 */
const NO_PLANS_HINT =
  '❌ لیست پلن‌های ربات در دسترس پنل نیست.\n\n' +
  '<i>یعنی هوک <code>getPlans</code> به پنل تزریق نشده.\n' +
  'روی سرور این را بزن:\n' +
  '<code>python3 patch-foxcoin-plans.py --apply</code>\n' +
  'و بعد <code>systemctl restart foxteam-bot</code></i>\n\n' +
  'تا آن موقع با دکمه پایین، محصول را دستی بساز.';

const EVENT_FA = {
  signup: 'جایزه ثبت‌نام',
  mission: 'ماموریت',
  purchase: 'خرید',
  referral: 'دعوت دوستان',
  spend: 'خرید با کوین',
  admin: 'اصلاح ادمین',
  reset: 'صفرسازی',
  join: 'جوین کانال',
  daily: 'جایزه روزانه',
  first_purchase: 'جایزه اولین خرید',
};

/** برچسب فارسی هر فعالیت جایزه‌دار. */
const REWARD_LABELS = {
  signup: 'ثبت‌نام در ربات',
  join: 'جوین کانال/گروه',
  referral: 'دعوت دوستان (اولین خرید دعوت‌شده)',
  mission: 'انجام ماموریت',
  purchase: 'خرید سرویس (خود کاربر)',
  first_purchase: 'اولین خرید کاربر',
  ref_purchase: 'خرید زیرمجموعه‌ها (هر بار)',
  daily: 'حضور روزانه',
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
  // ردیف خالی را تلگرام رد می‌کند (Bad Request). صفحه‌هایی که
  // دکمه‌شان شرطی است ردیف خالی می‌سازند؛ همین‌جا پاک می‌شود.
  return { inline_keyboard: (rows || []).filter(r => r && r.length) };
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
    '🦊 کوین در گردش\n<code>' + fa(s.circulating) + '</code>\n\n' +
    '📊 مجموع رویدادها\n<code>' + fa(s.events) + '</code>\n\n' +
    '<i>هر تغییر با دکمه انجام می‌شود و در دفتر کل ثبت می‌شود.</i>\n\n' +
    '<code>نسخه 1.9.1</code>';
  return {
    text: text,
    markup: kb([
      [{ text: T.stats, callback_data: 'admin:stats' },
       { text: T.settings, callback_data: 'admin:settings' }],
      [{ text: T.products, callback_data: 'admin:products' },
       { text: T.users, callback_data: 'admin:users' }],
      [{ text: T.prices, callback_data: 'admin:pricing' },
       { text: T.ledger, callback_data: 'admin:ledger' }],
      [{ text: T.hub, callback_data: 'admin:hub', style: 'success' }],
      [{ text: T.texts, callback_data: 'admin:texts' },
       { text: T.help, callback_data: 'admin:help', style: 'primary' }],
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
    '🦊 در گردش\n<code>' + fa(s.circulating) + '</code> کوین\n\n' +
    '👥 دارندگان\n<code>' + fa(s.holders) + '</code> کاربر\n\n' +
    '📊 کل رویدادها\n<code>' + fa(s.events) + '</code>\n\n' + LINE + '\n\n' +
    '<b>امروز</b>\n' +
    '📥 <code>' + fa(todayIssued) + '</code> صادر\n' +
    '📤 <code>' + fa(todaySpent) + '</code> خرج\n' +
    '📊 <code>' + fa(todayEvents.length) + '</code> رویداد';
  return { text: text, markup: kb([
    [{ text: T.back, callback_data: 'admin:back' }],
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
  rows.push([{ text: T.back, callback_data: 'admin:back' }]);
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
/** خلاصه یک‌خطی پیکربندی برای فهرست جوایز. */
function rewardSummary(cfg) {
  if (!cfg) return '';
  if (cfg.mode === 'percent') {
    let t = fa(cfg.percent) + '٪ از مبلغ';
    if (cfg.cap > 0) t += ' (سقف ' + fa(cfg.cap) + ')';
    return t;
  }
  if (cfg.mode === 'per') return 'هر ' + fa(cfg.perAmount) + ' تومان → ۱';
  return fa(cfg.coins) + ' کوین';
}


/**
 * ── پلکان خرید ─────────────────────────────────────────────
 * «خرید اول ۵۰، دوم ۳۰، بقیه ۱۰» بدون تایپ متن: هر پله یک ردیف
 * با +/− و امکان افزودن/حذف پله.
 */
function screenTier() {
  const t = coin.getTiers();
  let text = '<b>🪜 پلکان خرید</b>\n' + LINE + '\n\n';
  if (!t.enabled || !t.tiers.length) {
    text += '⛔️ خاموش است.\n\n' +
            '<i>وقتی روشن باشد، جایزه هر خرید بر اساس شماره آن\n' +
            'خرید داده می‌شود — نه یک عدد ثابت.\n\n' +
            'مثال: خرید اول ۵۰، دوم ۳۰، سوم به بعد ۱۰.</i>';
  } else {
    text += '<i>جایزه بر اساس چندمین خرید کاربر:</i>\n\n';
    t.tiers.forEach((v, i) => {
      text += '• خرید ' + fa(i + 1) + 'اُم — <code>' + fa(v) + '</code> کوین\n';
    });
    text += '• بقیه خریدها — <code>' +
            fa(t.rest === null ? t.tiers[t.tiers.length - 1] : t.rest) +
            '</code> کوین\n\n' +
            '<i>تا وقتی روشن است، «خرید سرویس» و «اولین خرید»\n' +
            'از فهرست جوایز کنار گذاشته می‌شوند.</i>';
  }
  const rows = [];
  t.tiers.forEach((v, i) => {
    rows.push([{ text: 'خرید ' + fa(i + 1) + 'اُم: ' + fa(v),
                 callback_data: 'admin:ignore' }]);
    rows.push([
      { text: '➖10', callback_data: 'admin:tierv:' + i + ':-10' },
      { text: '➖1', callback_data: 'admin:tierv:' + i + ':-1' },
      { text: '➕1', callback_data: 'admin:tierv:' + i + ':1' },
      { text: '➕10', callback_data: 'admin:tierv:' + i + ':10' },
    ]);
  });
  if (t.tiers.length) {
    rows.push([{ text: 'بقیه خریدها: ' +
                       fa(t.rest === null ? t.tiers[t.tiers.length - 1] : t.rest),
                 callback_data: 'admin:ignore' }]);
    rows.push([
      { text: '➖10', callback_data: 'admin:tierr:-10' },
      { text: '➖1', callback_data: 'admin:tierr:-1' },
      { text: '➕1', callback_data: 'admin:tierr:1' },
      { text: '➕10', callback_data: 'admin:tierr:10' },
    ]);
  }
  const addRow = [{ text: '➕ افزودن پله', callback_data: 'admin:tieradd' }];
  if (t.tiers.length) {
    addRow.push({ text: '🗑 حذف آخری', callback_data: 'admin:tierdel' });
  }
  rows.push(addRow);
  rows.push([{ text: t.enabled ? '⛔️ خاموش کردن' : '✅ روشن کردن',
               callback_data: 'admin:tiertog' }]);
  rows.push([{ text: T.back, callback_data: 'admin:back' }]);
  return { text: text, markup: kb(rows) };
}

function tierAdd() {
  const t = coin.getTiers();
  const last = t.tiers.length ? t.tiers[t.tiers.length - 1] : 50;
  coin.setTiers({ tiers: t.tiers.concat([Math.max(0, last)]),
                  enabled: true });
  return screenTier();
}

function tierDel() {
  const t = coin.getTiers();
  coin.setTiers({ tiers: t.tiers.slice(0, -1) });
  return screenTier();
}

function tierAdjust(idx, delta) {
  const t = coin.getTiers();
  const i = Number(idx);
  if (!(i >= 0 && i < t.tiers.length)) return screenTier();
  const next = t.tiers.slice();
  next[i] = Math.max(0, next[i] + Number(delta));
  coin.setTiers({ tiers: next });
  return screenTier();
}

function tierRest(delta) {
  const t = coin.getTiers();
  const base = t.rest === null
    ? (t.tiers.length ? t.tiers[t.tiers.length - 1] : 0)
    : t.rest;
  coin.setTiers({ rest: Math.max(0, base + Number(delta)) });
  return screenTier();
}

function tierToggle() {
  const t = coin.getTiers();
  if (!t.tiers.length && !t.enabled) {
    // روشن‌کردن بدون پله بی‌معنی است: یک پله پیش‌فرض بساز
    coin.setTiers({ tiers: [50, 30], rest: 10, enabled: true });
  } else {
    coin.setTiers({ enabled: !t.enabled });
  }
  return screenTier();
}


/**
 * ── مرکز جوایز ─────────────────────────────────────────────
 * قبلاً «جوایز فعالیت» دو کلیک عمق داشت (تنظیمات ← جوایز) و
 * پلکان سه کلیک. عملاً پیدا نمی‌شد. حالا همه‌چیزِ مربوط به
 * جایزه یکجاست و از منوی اصلی یک کلیک فاصله دارد.
 */
function screenHub() {
  const rw = coin.getRewards();
  const t = coin.getTiers();
  const c = coin.getSettings();
  const ms = coin.listMissions(true);
  const msOn = ms.filter(m => m.active !== false).length;

  const signup = rw.signup ? rw.signup.coins : 0;
  const text =
    '<b>' + T.hub + '</b>\n' + LINE + '\n\n' +
    '🎁 هدیه خوش‌آمد <code>' + fa(signup) + '</code> کوین\n' +
    '🪜 پلکان خرید ' +
      (t.enabled && t.tiers.length
        ? '<code>' + t.tiers.map(fa).join(' / ') +
          (t.rest !== null ? ' / ' + fa(t.rest) : '') + '</code>'
        : '<i>خاموش</i>') + '\n' +
    '🎯 ماموریت‌ها <code>' + fa(msOn) + '</code> فعال' +
      (ms.length > msOn ? ' <i>(' + fa(ms.length - msOn) + ' خاموش)</i>' : '') + '\n' +
    '🚦 سقف روزانه <code>' + fa(c.dailyCap) + '</code> کوین' +
      (c.dailyCap > 0 ? '' : ' <i>(بی‌نهایت)</i>') + '\n\n' +
    '<i>هرچه به جایزه مربوط است، همین‌جاست.</i>';

  return { text: text, markup: kb([
    [{ text: '🎁 هدیه خوش‌آمد', callback_data: 'admin:rcoins:signup' }],
    [{ text: '🪜 پلکان خرید', callback_data: 'admin:tier' }],
    [{ text: '🎯 ماموریت‌ها', callback_data: 'admin:miss' }],
    [{ text: '🚦 سقف روزانه', callback_data: 'admin:cap' }],
    [{ text: '📋 همه جوایز فعالیت', callback_data: 'admin:rewards' }],
    [{ text: T.back, callback_data: 'admin:back' }],
  ]) };
}

/** سقف روزانه: صفحه اختصاصی با پله‌های بزرگ. */
function screenCap() {
  const c = coin.getSettings();
  const cap = Number(c.dailyCap) || 0;
  const text =
    '<b>' + T.cap + '</b>\n' + LINE + '\n\n' +
    'هر کاربر در یک روز حداکثر\n' +
    '<code>' + fa(cap) + '</code> کوین می‌تواند بگیرد.\n\n' +
    (cap === 0
      ? '<i>صفر یعنی بدون سقف — هر مقدار.</i>\n\n'
      : '<i>بعد از این مقدار، جایزه‌ها تا فردا رد می‌شوند.</i>\n\n') +
    '<i>خرید کاربر و اصلاح ادمین از سقف معاف‌اند.</i>';
  return { text: text, markup: kb([
    [{ text: '➖100', callback_data: 'admin:capv:-100' },
     { text: '➖50', callback_data: 'admin:capv:-50' },
     { text: '➕50', callback_data: 'admin:capv:50' },
     { text: '➕100', callback_data: 'admin:capv:100' }],
    [{ text: '➖1000', callback_data: 'admin:capv:-1000' },
     { text: '➕1000', callback_data: 'admin:capv:1000' }],
    [{ text: '♾ بدون سقف', callback_data: 'admin:capset:0' },
     { text: '↩️ پیش‌فرض (۲۰۰)', callback_data: 'admin:capset:200' }],
    [{ text: T.back, callback_data: 'admin:back' }],
  ]) };
}

function applyCap(delta) {
  const cur = Number(coin.getSettings().dailyCap) || 0;
  coin.setSetting('dailyCap', Math.max(0, cur + Number(delta)));
  return screenCap();
}

function setCap(v) {
  coin.setSetting('dailyCap', Math.max(0, Number(v) || 0));
  return screenCap();
}

// ── ماموریت‌ها ─────────────────────────────────────────────

const MISSION_KIND_FA = {
  manual:   '✋ دستی (کاربر خودش می‌زند)',
  purchase: '🛒 بعد از N خرید',
  balance:  '💰 با رسیدن موجودی به N',
  daily:    '📅 با N روز پیاپی',
};

function missionSummary(m) {
  if (m.kind === 'manual') return 'دستی';
  if (m.kind === 'purchase') return fa(m.need) + ' خرید';
  if (m.kind === 'balance') return 'موجودی ' + fa(m.need);
  if (m.kind === 'daily') return fa(m.need) + ' روز پیاپی';
  return m.kind;
}

function screenMissions() {
  const list = coin.listMissions(true);
  let text = '<b>' + T.missions + '</b>\n' + LINE + '\n\n';
  const rows = [];
  if (!list.length) {
    text += '📭 هنوز ماموریتی نساخته‌ای.\n\n' +
            '<i>ماموریت یعنی کاری که کاربر انجام می‌دهد و کوین\n' +
            'می‌گیرد — مثل «اولین خریدت را بکن» یا «سه روز\n' +
            'پیاپی بیا».</i>';
  } else {
    text += '<i>' + fa(list.length) + ' ماموریت — روی هرکدام بزن</i>\n';
    for (const m of list) {
      rows.push([{ text: (m.active === false ? '⏸ ' : '🎯 ') + m.title +
                         ' — ' + fa(m.coins) + ' کوین (' + missionSummary(m) + ')',
                   callback_data: 'admin:missed:' + m.id }]);
    }
  }
  rows.push([{ text: '➕ ماموریت جدید', callback_data: 'admin:missnew',
               style: 'success' }]);
  rows.push([{ text: T.back, callback_data: 'admin:back' }]);
  return { text: text, markup: kb(rows) };
}

/** ساخت ماموریت: از الگوهای آماده، بدون تایپ. */
function screenMissionNew() {
  return {
    text: '<b>➕ ماموریت جدید</b>\n' + LINE + '\n\n' +
          '<i>یک الگو انتخاب کن؛ بعد عنوان و جایزه‌اش را\n' +
          'همین‌جا تنظیم می‌کنی.</i>',
    markup: kb([
      [{ text: '🛒 اولین خرید', callback_data: 'admin:misstpl:p1' }],
      [{ text: '🛒 سه خرید', callback_data: 'admin:misstpl:p3' }],
      [{ text: '📅 سه روز پیاپی', callback_data: 'admin:misstpl:d3' }],
      [{ text: '📅 هفت روز پیاپی', callback_data: 'admin:misstpl:d7' }],
      [{ text: '💰 رسیدن به ۱۰۰ کوین', callback_data: 'admin:misstpl:b100' }],
      [{ text: '✋ ماموریت دستی', callback_data: 'admin:misstpl:man' }],
      [{ text: T.back, callback_data: 'admin:back' }],
    ]),
  };
}

const MISSION_TEMPLATES = {
  p1:   { title: 'اولین خریدت را انجام بده', kind: 'purchase', need: 1, coins: 25 },
  p3:   { title: 'سه خرید انجام بده', kind: 'purchase', need: 3, coins: 50 },
  d3:   { title: 'سه روز پیاپی سر بزن', kind: 'daily', need: 3, coins: 15 },
  d7:   { title: 'هفت روز پیاپی سر بزن', kind: 'daily', need: 7, coins: 40 },
  b100: { title: 'موجودی‌ات را به ۱۰۰ کوین برسان', kind: 'balance', need: 100, coins: 20 },
  man:  { title: 'ماموریت دستی', kind: 'manual', need: 0, coins: 10 },
};

function createMissionFromTemplate(key, uid) {
  const tpl = MISSION_TEMPLATES[String(key)];
  if (!tpl) return screenMissionNew();
  // انتخابگر الگو گذراست: از مسیر برش دار تا «بازگشت» به فهرست
  // ماموریت‌ها برود، نه به صفحه‌ای که کارش تمام شده.
  if (uid !== undefined) {
    const st = navStacks.get(String(uid)) || [];
    if (st[st.length - 1] === 'admin:missnew') st.pop();
    navStacks.set(String(uid), st);
  }
  let id = 'M' + Date.now().toString(36).toUpperCase();
  for (let i = 0; i < 5 && coin.getMission(id); i++) id += Math.floor(Math.random() * 10);
  coin.setMission(Object.assign({ id: id, repeat: 'once', active: true }, tpl));
  return screenMissionEdit(id);
}

function screenMissionEdit(id) {
  const m = coin.getMission(id);
  if (!m) return screenMissions();
  const text =
    '<b>🎯 ' + m.title + '</b>\n' + LINE + '\n\n' +
    (m.desc ? '<i>' + m.desc + '</i>\n\n' : '') +
    '💎 جایزه <code>' + fa(m.coins) + '</code> کوین\n' +
    'نوع: ' + (MISSION_KIND_FA[m.kind] || m.kind) + '\n' +
    (m.kind === 'manual' ? '' : '🎯 شرط <code>' + fa(m.need) + '</code>\n') +
    'تکرار: ' + (m.repeat === 'always' ? '🔁 همیشگی' : '🔂 یک‌بار') + '\n' +
    'وضعیت: ' + (m.active === false ? '⏸ غیرفعال' : '✅ فعال') + '\n\n' +
    '<i>برای تغییر عنوان، دکمه «✏️ عنوان» را بزن.</i>';
  const rows = [
    [{ text: '💎 جایزه', callback_data: 'admin:missc:' + m.id }],
  ];
  if (m.kind !== 'manual') {
    rows.push([{ text: '🎯 شرط', callback_data: 'admin:missn:' + m.id }]);
  }
  rows.push([{ text: '✏️ عنوان', callback_data: 'admin:misst:' + m.id }]);
  rows.push([
    { text: m.repeat === 'always' ? '🔂 یک‌بار کن' : '🔁 همیشگی کن',
      callback_data: 'admin:missr:' + m.id },
    { text: m.active === false ? '▶️ فعال' : '⏸ غیرفعال',
      callback_data: 'admin:missa:' + m.id },
  ]);
  rows.push([{ text: '🗑 حذف', callback_data: 'admin:missdel:' + m.id }]);
  rows.push([{ text: T.back, callback_data: 'admin:back' }]);
  return { text: text, markup: kb(rows) };
}

function screenMissionNum(id, field) {
  const m = coin.getMission(id);
  if (!m) return screenMissions();
  const isCoins = field === 'coins';
  const cur = isCoins ? m.coins : m.need;
  const title = isCoins ? '💎 جایزه ماموریت' : '🎯 شرط ماموریت';
  const unit = isCoins ? 'کوین' : (m.kind === 'daily' ? 'روز' :
                m.kind === 'purchase' ? 'خرید' : 'کوین موجودی');
  const f = isCoins ? 'missc' : 'missn';
  return { text:
    '<b>' + title + '</b>\n' + LINE + '\n\n' +
    m.title + '\n\n' +
    'مقدار فعلی\n<code>' + fa(cur) + '</code> ' + unit + '\n\n' +
    '<i>هر دکمه همان لحظه اعمال می‌شود.</i>',
    markup: kb([
      [{ text: '➖10', callback_data: 'admin:' + f + 'v:' + id + ':-10' },
       { text: '➖1', callback_data: 'admin:' + f + 'v:' + id + ':-1' },
       { text: '➕1', callback_data: 'admin:' + f + 'v:' + id + ':1' },
       { text: '➕10', callback_data: 'admin:' + f + 'v:' + id + ':10' }],
      [{ text: T.back, callback_data: 'admin:back' }],
    ]) };
}

function applyMissionNum(id, field, delta) {
  const m = coin.getMission(id);
  if (!m) return screenMissions();
  const next = Object.assign({}, m);
  next[field] = Math.max(0, Number(m[field] || 0) + Number(delta));
  coin.setMission(next);
  return screenMissionEdit(id);
}

function toggleMissionRepeat(id) {
  const m = coin.getMission(id);
  if (m) coin.setMission(Object.assign({}, m,
    { repeat: m.repeat === 'always' ? 'once' : 'always' }));
  return screenMissionEdit(id);
}

function toggleMissionActive(id) {
  const m = coin.getMission(id);
  if (m) coin.setMission(Object.assign({}, m, { active: m.active === false }));
  return screenMissionEdit(id);
}

function confirmDeleteMission(id) {
  const m = coin.getMission(id);
  if (!m) return screenMissions();
  return { text: '<b>🗑 حذف ماموریت</b>\n' + LINE + '\n\n' +
                 '«' + m.title + '» حذف شود؟\n\n' +
                 '<i>این عمل برگشت‌پذیر نیست.</i>',
    markup: kb([
      [{ text: '✅ حذف', callback_data: 'admin:missdelgo:' + id, style: 'danger' }],
      [{ text: '⬅️ انصراف', callback_data: 'admin:missed:' + id }],
    ]) };
}

function doDeleteMission(id) {
  coin.removeMission(id);
  return screenMissions();
}

/** عنوان ماموریت را متنی می‌گیریم (همان سازوکار متن‌ها). */
function screenMissionTitle(uid, id) {
  const m = coin.getMission(id);
  if (!m) return screenMissions();
  pendingEdits.set(String(uid), {
    kind: 'mission_title', missionId: String(id), at: Date.now(),
    prompt: '✏️ عنوان تازه ماموریت را بفرست.\n' +
            '<i>فعلی: ' + m.title + '</i>',
  });
  return { text: '<b>✏️ عنوان ماموریت</b>\n' + LINE + '\n\n' +
                 'فعلی\n<i>' + m.title + '</i>\n\n' +
                 '<b>عنوان تازه را همین‌جا بفرست.</b>\n\n' +
                 '<i>بدون < یا >. اگر پیام «بفرست» نیامد، هوک\n' +
                 'متن‌ها نصب نیست.</i>',
    markup: kb([[{ text: '🔙 انصراف', callback_data: 'admin:tcancel' }]]) };
}

function screenRewards() {
  const rw = coin.getRewards();
  const defKeys = Object.keys(coin.REWARD_DEFAULTS || {});
  const customKeys = Object.keys(rw).filter(k => !defKeys.includes(k));
  let text = '<b>' + T.rewards + '</b>\n' + LINE + '\n\n' +
             '<i>برای هر فعالیت، نوع و مقدار جایزه را تعیین کنید.\n' +
             'روی هر آیتم بزنید تا ویرایش شود.</i>\n';
  const rows = [];
  const t = coin.getTiers();
  rows.push([{ text: '🪜 پلکان خرید' +
                     (t.enabled && t.tiers.length
                       ? ' (' + t.tiers.map(fa).join('/') +
                         (t.rest !== null ? '/' + fa(t.rest) : '') + ')'
                       : ' — خاموش'),
               callback_data: 'admin:tier' }]);
  for (const key of [...defKeys, ...customKeys]) {
    const cfg = rw[key];
    // وقتی پلکان روشن است، این دو کلید دیگر اثری ندارند
    if (t.enabled && t.tiers.length &&
        (key === 'purchase' || key === 'first_purchase')) continue;
    const label = REWARD_LABELS[key] || key;
    const custom = customKeys.includes(key) ? ' ⭐' : '';
    const rep = cfg.repeat === 'always' ? '— هر بار' : '— یک‌بار';
    const off = cfg.enabled ? '' : ' ⛔';
    rows.push([{ text: label + custom + '\n<code>' + rewardSummary(cfg) +
                '</code> ' + rep + off,
                 callback_data: 'admin:rcoins:' + key }]);
  }
  rows.push([{ text: T.back, callback_data: 'admin:back' }]);
  return { text: text, markup: kb(rows) };
}

/** صفحه ویرایش کامل یک فعالیت: حالت، مقدار، سقف، حداقل خرید، تکرار، فعال/غیرفعال. */
function screenRewardEdit(key) {
  const cfg = coin.getReward(key);
  const def = (coin.REWARD_DEFAULTS || {})[key];
  const isCustom = def === undefined;
  if (!cfg) return screenRewards();
  const label = REWARD_LABELS[key] || key;
  const modeFA = cfg.mode === 'percent' ? '📈 درصدی' :
                 (cfg.mode === 'per' ? '🔢 نسبی (هر X تومان)' : '💰 ثابت');
  let text =
    '<b>🎁 ' + label + '</b>\n' + LINE + '\n\n' +
    'حالت: <b>' + modeFA + '</b>\n' +
    'مقدار: <code>' + rewardSummary(cfg) + '</code>\n';
  if (cfg.mode === 'percent' && cfg.cap > 0) {
    text += 'سقف هر جایزه: <code>' + fa(cfg.cap) + '</code> کوین\n';
  }
  if (cfg.minPurchase > 0) {
    text += 'حداقل مبلغ خرید: <code>' + fa(cfg.minPurchase) + '</code> تومان\n';
  }
  text += 'تکرار: <b>' + (cfg.repeat === 'always' ? 'همیشگی (هر بار)' : 'فقط یک‌بار') +
          '</b>\n' +
          'وضعیت: <b>' + (cfg.enabled ? '✅ فعال' : '⛔ غیرفعال') + '</b>\n\n' +
          '<i>هر دکمه همان لحظه اعمال می‌شود.</i>';
  const rows = [];
  const sel = (cond) => cond ? '✅ ' : '';
  rows.push([
    { text: sel(cfg.mode === 'fixed') + '💰 ثابت',
      callback_data: 'admin:rmode:' + key },
    { text: sel(cfg.mode === 'percent') + '📈 درصدی',
      callback_data: 'admin:rmode:' + key },
    { text: sel(cfg.mode === 'per') + '🔢 نسبی',
      callback_data: 'admin:rmode:' + key },
  ]);
  if (cfg.mode === 'percent') {
    rows.push([
      { text: '➖10', callback_data: 'admin:rv:' + key + ':-10' },
      { text: '➖1', callback_data: 'admin:rv:' + key + ':-1' },
      { text: '➖0.1', callback_data: 'admin:rv:' + key + ':-0.1' },
      { text: '➕0.1', callback_data: 'admin:rv:' + key + ':0.1' },
      { text: '➕1', callback_data: 'admin:rv:' + key + ':1' },
      { text: '➕10', callback_data: 'admin:rv:' + key + ':10' },
    ]);
    rows.push([
      { text: 'سقف: ' + fa(cfg.cap || 0), callback_data: 'admin:rcap:' + key + ':0' },
      { text: '➖100', callback_data: 'admin:rcap:' + key + ':-100' },
      { text: '➖10', callback_data: 'admin:rcap:' + key + ':-10' },
      { text: '➕10', callback_data: 'admin:rcap:' + key + ':10' },
      { text: '➕100', callback_data: 'admin:rcap:' + key + ':100' },
    ]);
  } else if (cfg.mode === 'per') {
    rows.push([
      { text: '➖10000', callback_data: 'admin:rv:' + key + ':-10000' },
      { text: '➖1000', callback_data: 'admin:rv:' + key + ':-1000' },
      { text: '➖100', callback_data: 'admin:rv:' + key + ':-100' },
      { text: '➕100', callback_data: 'admin:rv:' + key + ':100' },
      { text: '➕1000', callback_data: 'admin:rv:' + key + ':1000' },
      { text: '➕10000', callback_data: 'admin:rv:' + key + ':10000' },
    ]);
  } else {
    rows.push([
      { text: '➖100', callback_data: 'admin:rv:' + key + ':-100' },
      { text: '➖10', callback_data: 'admin:rv:' + key + ':-10' },
      { text: '➖1', callback_data: 'admin:rv:' + key + ':-1' },
      { text: '➕1', callback_data: 'admin:rv:' + key + ':1' },
      { text: '➕10', callback_data: 'admin:rv:' + key + ':10' },
      { text: '➕100', callback_data: 'admin:rv:' + key + ':100' },
    ]);
  }
  if (['purchase', 'ref_purchase', 'first_purchase', 'referral'].includes(key)) {
    rows.push([
      { text: 'حداقل خرید: ' + fa(cfg.minPurchase || 0) + 'ت',
        callback_data: 'admin:rmin:' + key + ':0' },
      { text: '➖100000', callback_data: 'admin:rmin:' + key + ':-100000' },
      { text: '➖10000', callback_data: 'admin:rmin:' + key + ':-10000' },
      { text: '➕10000', callback_data: 'admin:rmin:' + key + ':10000' },
      { text: '➕100000', callback_data: 'admin:rmin:' + key + ':100000' },
    ]);
  }
  rows.push([
    { text: sel(cfg.repeat === 'always') + '🔁 همیشگی',
      callback_data: 'admin:rrep:' + key },
    { text: sel(cfg.repeat === 'once') + '🔂 فقط یک‌بار',
      callback_data: 'admin:rrep:' + key },
  ]);
  rows.push([
    { text: cfg.enabled ? '⛔ غیرفعال کن' : '✅ فعال کن',
      callback_data: 'admin:ren:' + key },
  ]);
  if (!isCustom) {
    rows.push([{ text: '↩️ پیش‌فرض: ' + rewardSummary(def),
                 callback_data: 'admin:rreset:' + key }]);
  } else {
    rows.push([{ text: '🗑 حذف فعالیت', callback_data: 'admin:rdel:' + key,
                 style: 'danger' }]);
  }
  rows.push([{ text: T.back, callback_data: 'admin:back' }]);
  return { text: text, markup: kb(rows) };
}

/** تعدیل مقدار: درصد در حالت درصدی، تومان در حالت نسبی، کوین در حالت ثابت. */
function applyReward(key, delta) {
  try {
    const cfg = coin.getReward(key);
    if (!cfg) return screenRewards();
    const v = Number(delta) || 0;
    if (cfg.mode === 'percent') {
      const next = Math.max(0, Math.round(((Number(cfg.percent) || 0) + v) * 100) / 100);
      coin.setRewardConfig(key, { percent: next });
    } else if (cfg.mode === 'per') {
      const next = Math.max(1, (Number(cfg.perAmount) || 10000) + v);
      coin.setRewardConfig(key, { perAmount: next });
    } else {
      const next = Math.max(0, (Number(cfg.coins) || 0) + v);
      coin.setRewardConfig(key, { coins: next });
    }
  } catch (e) { /* کلید نامعتبر */ }
  return screenRewardEdit(key);
}

/** چرخش حالت: ثابت → درصدی → نسبی → ثابت. */
function toggleRewardMode(key) {
  try {
    const cfg = coin.getReward(key);
    if (!cfg) return screenRewards();
    const order = ['fixed', 'percent', 'per'];
    const next = order[(order.indexOf(cfg.mode) + 1) % order.length];
    coin.setRewardConfig(key, { mode: next });
  } catch (e) { /* ignore */ }
  return screenRewardEdit(key);
}

function applyRewardCap(key, delta) {
  try {
    const cfg = coin.getReward(key);
    const next = Math.max(0, (Number(cfg.cap) || 0) + Number(delta));
    coin.setRewardConfig(key, { cap: next });
  } catch (e) { /* ignore */ }
  return screenRewardEdit(key);
}

function applyRewardMin(key, delta) {
  try {
    const cfg = coin.getReward(key);
    const next = Math.max(0, (Number(cfg.minPurchase) || 0) + Number(delta));
    coin.setRewardConfig(key, { minPurchase: next });
  } catch (e) { /* ignore */ }
  return screenRewardEdit(key);
}

function toggleRewardRepeat(key) {
  try {
    const cfg = coin.getReward(key);
    coin.setRewardConfig(key, { repeat: cfg.repeat === 'once' ? 'always' : 'once' });
  } catch (e) { /* ignore */ }
  return screenRewardEdit(key);
}

function toggleRewardEnabled(key) {
  try {
    const cfg = coin.getReward(key);
    coin.setRewardConfig(key, { enabled: !cfg.enabled });
  } catch (e) { /* ignore */ }
  return screenRewardEdit(key);
}

function resetReward(key) {
  try {
    coin.resetRewardConfig(key);
  } catch (e) { /* ignore */ }
  return screenRewardEdit(key);
}

function deleteReward(key) {
  coin.removeRewardAction(key);
  return screenRewards();
}

// ───────────────────────── متن‌ها ─────────────────────────

function previewText(s, n) {
  s = String(s == null ? '' : s);
  return s.length > n ? s.slice(0, n) + '…' : s;
}

/**
 * فهرست همه متن‌های قابل ویرایش. متن سفارشی با 🟢 نشان داده می‌شود
 * و دکمه «↩️ پیش‌فرض» می‌گیرد. «✏️» حالت دریافت متن را فعال می‌کند.
 */
function screenTexts() {
  const txt = coin.getTexts();
  let custom = 0;
  for (const k of Object.keys(coin.TEXTS)) if (txt[k] !== coin.TEXTS[k]) custom++;

  const rows = [];
  let text = '<b>' + T.texts + '</b>\n' + LINE + '\n\n' +
             '<i>متن‌هایی که کاربر در فاکس کوین می‌بیند.</i>\n\n';

  for (const c of TEXT_CATS) {
    const n = c.keys.filter(k => txt[k] !== coin.TEXTS[k]).length;
    text += c.icon + ' <b>' + c.label + '</b> — ' + fa(c.keys.length) + ' متن' +
            (n ? ' <code>' + fa(n) + ' سفارشی</code>' : '') + '\n';
    rows.push([{ text: c.icon + ' ' + c.label + (n ? ' (' + fa(n) + '🟢)' : ''),
                 callback_data: 'admin:tcat:' + c.id }]);
  }

  text += '\n' + (custom
    ? '🟢 <code>' + fa(custom) + '</code> متن سفارشی شده'
    : '⚪️ همه متن‌ها پیش‌فرض‌اند');

  if (custom) {
    rows.push([{ text: '↩️ برگرداندن همه به پیش‌فرض',
                 callback_data: 'admin:tresetall' }]);
  }
  rows.push([{ text: T.back, callback_data: 'admin:back' }]);
  return { text: text, markup: kb(rows) };
}

/** یک دسته متن: پیش‌نمایش‌ها در پیام، دکمه‌ها کوتاه و یک‌خطی. */
function screenTextCat(id) {
  const c = TEXT_CATS.find(x => x.id === String(id));
  if (!c) return screenTexts();
  const txt = coin.getTexts();

  let text = '<b>' + c.icon + ' ' + c.label + '</b>\n' + LINE + '\n\n';
  const rows = [];

  for (const key of c.keys) {
    const val = txt[key];
    const isCustom = val !== coin.TEXTS[key];
    text += (isCustom ? '🟢' : '⚪️') + ' <b>' + (TEXT_SHORT[key] || key) + '</b>\n' +
            '<i>' + previewText(val, 60) + '</i>\n\n';
    const row = [{ text: (isCustom ? '🟢 ' : '✏️ ') + (TEXT_SHORT[key] || key),
                   callback_data: 'admin:tedit:' + key }];
    if (isCustom) {
      row.push({ text: '↩️', callback_data: 'admin:treset:' + key });
    }
    rows.push(row);
  }

  text += '<i>روی هر کدام بزن تا عوضش کنی. ↩️ یعنی برگشت به پیش‌فرض.</i>';
  rows.push([{ text: T.back, callback_data: 'admin:back' }]);
  return { text: text, markup: kb(rows) };
}

/** دسته‌ای که این کلید در آن است — برای بازگشت درست بعد از ویرایش. */
function catOfKey(key) {
  const c = TEXT_CATS.find(x => x.keys.includes(String(key)));
  return c ? c.id : null;
}

function resetAllTexts() {
  for (const k of Object.keys(coin.TEXTS)) coin.resetText(k);
  return screenTexts();
}

/** فعال‌کردن حالت دریافت متن برای همین ادمین + نمایش راهنما. */
function screenTextEdit(uid, key) {
  key = String(key);
  if (!(key in coin.TEXTS)) return screenTexts();
  const txt = coin.getTexts();
  const cur = txt[key];
  const isCustom = cur !== coin.TEXTS[key];
  const label = TEXT_SHORT[key] || TEXTS_FA[key] || key;

  pendingEdits.set(String(uid), {
    key: key, at: Date.now(),
    prompt: '📝 ' + label + ' — متن جدید را بفرست.\n' +
            '<i>فعلی: ' + previewText(cur, 80) + '</i>',
  });

  const hasVar = coin.TEXTS[key].includes('{dailyCap}');
  const rows = [];
  if (isCustom) {
    rows.push([{ text: '↩️ برگشت به پیش‌فرض',
                 callback_data: 'admin:treset:' + key }]);
  }
  rows.push([{ text: '🔙 انصراف', callback_data: 'admin:tcancel' }]);

  return {
    text: '<b>📝 ' + label + '</b>\n' + LINE + '\n\n' +
          (isCustom ? '🟢 سفارشی' : '⚪️ پیش‌فرض') +
          ' · <code>' + fa(cur.length) + '</code> نویسه\n\n' +
          '<b>متن فعلی</b>\n<i>' + previewText(cur, 220) + '</i>\n\n' +
          (isCustom
            ? '<b>پیش‌فرض</b>\n<i>' + previewText(coin.TEXTS[key], 120) + '</i>\n\n'
            : '') +
          '📨 <b>متن جدید را همین‌جا بفرست.</b>\n\n' +
          (hasVar
            ? '<i>💡 <code>{dailyCap}</code> را نگه دار — جای سقف روزانه\n' +
              'پر می‌شود.</i>\n'
            : '') +
          '<i>بدون کاراکتر < یا > · حداکثر ۱۴۰۰ نویسه</i>',
    markup: kb(rows),
  };
}

function resetTextScreen(key) {
  coin.resetText(key);
  const cat = catOfKey(key);
  return cat ? screenTextCat(cat) : screenTexts();
}

/**
 * دریافت متن ارسال‌شده توسط ادمین (هوک bot.js این را صدا می‌زند).
 * فقط اگر ادمین باشد و حالت ویرایش فعال باشد، ذخیره می‌شود.
 */
async function routeText(ctx) {
  const uid = String(ctx && ctx.uid);
  if (!isAdmin(ctx && ctx.config, uid)) return false;
  const pending = pendingText(uid);
  if (!pending) return false;
  const text = String(ctx && ctx.text || '').trim();
  if (!text || text === '/cancel') return false;

  // عنوان ماموریت
  if (pending.kind === 'mission_title') {
    const title = text.replace(/[<>]/g, '').slice(0, 120);
    if (!title) return false;
    const m = coin.getMission(pending.missionId);
    if (!m) { clearPending(uid); return false; }
    coin.setMission(Object.assign({}, m, { title: title }));
    clearPending(uid);
    return true;
  }

  // حالت افزودن دستی محصول: متن، شناسه پلن است نه متن نمایشی.
  if (pending.kind === 'plan') {
    const planId = text.replace(/[<>\s]/g, '').slice(0, 64);
    if (!planId) return false;
    clearPending(uid);
    return { kind: 'plan', cat: pending.cat, planId: planId,
             next: 'admin:paddplan:' + pending.cat + ':' + planId };
  }

  try {
    coin.setText(pending.key, text);
  } catch (e) {
    return false;
  }
  clearPending(uid);
  return true;
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

  rows.push([{ text: T.back, callback_data: 'admin:back' }]);
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
  rows.push([{ text: T.back, callback_data: 'admin:back' }]);
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
    'دسته: ' + catLabel(p.cat) + '\n' +
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
    [{ text: T.changeCat + ' (' + catLabel(p.cat) + ')',
      callback_data: 'admin:pcat:' + p.id }],
    [{ text: p.active === false ? '▶️ فعال‌سازی' : '⏸ غیرفعال',
      callback_data: 'admin:ptoggle:' + p.id },
     { text: '🗑 حذف', callback_data: 'admin:pdel:' + p.id }],
    [{ text: T.back, callback_data: 'admin:back' }],
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
               'دسته: ' + catLabel(p.cat) + '\n\n';
  if (typeof ctx.getPlans !== 'function') {
    return { text: head + NO_PLANS_HINT,
             markup: kb([[{ text: T.back, callback_data: 'admin:back' }]]) };
  }
  let plans = null;
  try { plans = await ctx.getPlans(ctx.env, p.cat); } catch (e) { plans = null; }
  if (!plans || !plans.length) {
    return { text: head + '❌ در این دسته پلنی پیدا نشد.',
             markup: kb([[{ text: T.back, callback_data: 'admin:back' }]]) };
  }
  const rows = plans.map(pl => ([
    { text: (pl.name || pl.id) + '  <code>' + pl.id + '</code>',
      callback_data: 'admin:pplanpick:' + id + ':' + pl.id },
  ]));
  rows.push([{ text: T.back, callback_data: 'admin:back' }]);
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
  const cat = coin.normCat(p.cat) === 'unlimited' ? 'volume' : 'unlimited';
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
    [{ text: T.back, callback_data: 'admin:back' }],
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
  return { cat: coin.normCat(parts[0]), planId: parts[1] || '',
           gb: Number(parts[2]) || 0, days: Number(parts[3]) || 0,
           coins: Number(parts[4]) || 0 };
}

/**
 * افزودن دستی: وقتی لیست زنده پلن‌ها در دسترس نیست، ادمین شناسه
 * پلن را متنی می‌فرستد. از همان سازوکار pendingEdits متن‌ها استفاده
 * می‌کنیم تا هوک bot.js موجود (patch-foxcoin-texts.py) کافی باشد.
 */
function screenManualPlan(uid, cat) {
  cat = coin.normCat(cat);
  pendingEdits.set(String(uid), {
    kind: 'plan', cat: cat, at: Date.now(),
    prompt: '🛰 شناسه پلن را بفرست (مثلاً <code>44trir5v</code>).\n' +
            '<i>در ربات، بخش مدیریت پلن‌ها، شناسه هر پلن دیده می‌شود.</i>',
  });
  return {
    text: '<b>' + T.manualAdd + '</b>\n' + LINE + '\n\n' +
          'دسته: ' + catLabel(cat) + '\n\n' +
          '<b>شناسه پلن را همین‌جا بفرست.</b>\n\n' +
          '<i>بعد از آن، حجم و مدت و قیمت را با دکمه تنظیم می‌کنی.\n' +
          'اگر پیام «شناسه را بفرست» نیامد، از خط فرمان:\n' +
          '<code>node foxcoin.js product-add \'{"id":"P1","planId":"...", ' +
          '"cat":"' + cat + '","gb":30,"days":30,"coins":100}\'</code></i>',
    markup: kb([[{ text: '🔙 انصراف', callback_data: 'admin:tcancel' }]]),
  };
}

function screenPickCat() {
  const text =
    '<b>' + T.addProduct + '</b>\n' + LINE + '\n\n' +
    '<i>اول دسته را انتخاب کنید.\n' +
    'محصول به یک پلن موجود در همان دسته وصل می‌شود.</i>';
  return { text: text, markup: kb([
    [{ text: '♾ نامحدود', callback_data: 'admin:paddcat:unlimited' }],
    [{ text: '🧬 حجمی', callback_data: 'admin:paddcat:volume' }],
    [{ text: T.back, callback_data: 'admin:back' }],
  ]) };
}

async function screenPickPlan(ctx, cat) {
  const head = '<b>' + T.addProduct + '</b>\n' + LINE + '\n\n' +
               'دسته: ' + catLabel(cat) + '\n\n';
  if (typeof ctx.getPlans !== 'function') {
    return { text: head + NO_PLANS_HINT,
             markup: kb([
               [{ text: T.manualAdd, callback_data: 'admin:paddman:' + cat }],
               [{ text: T.back, callback_data: 'admin:back' }]]) };
  }
  let plans = null;
  try { plans = await ctx.getPlans(ctx.env, cat); } catch (e) { plans = null; }
  if (!plans || !plans.length) {
    return { text: head +
             '❌ در این دسته پلنی پیدا نشد.\n' +
             '<i>اول در ربات پلنی با این دسته بسازید.</i>',
             markup: kb([[{ text: T.back, callback_data: 'admin:back' }]]) };
  }
  const rows = plans.map(pl => ([
    { text: (pl.name || pl.id) + '  <code>' + pl.id + '</code>',
      callback_data: 'admin:paddplan:' + cat + ':' + pl.id },
  ]));
  rows.push([{ text: T.back, callback_data: 'admin:back' }]);
  return { text: head + '<i>پلن پایه را انتخاب کنید.</i>',
           markup: kb(rows) };
}

function screenAddGb(st) {
  const s = parseAddState(st);
  const cur = s.gb || 30;
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
    [{ text: T.back, callback_data: 'admin:back' }],
  ]) };
}

function screenAddDays(st) {
  const s = parseAddState(st);
  const cur = s.days || 30;
  const unlim = coin.normCat(s.cat) === 'unlimited';
  const text =
    '<b>' + T.addProduct + ' — مدت</b>\n' + LINE + '\n\n' +
    'دسته: ' + catLabel(s.cat) + '\n' +
    '🛰 پلن <code>' + s.planId + '</code>\n' +
    (unlim ? '♾ بدون محدودیت حجم\n' : '💾 ' + fa(s.gb) + ' گیگ\n') +
    '\nمدت: <code>' + fa(cur) + '</code> روز\n\n' +
    '<i>اعمال فوری.</i>';
  return { text: text, markup: kb([
    [{ text: '➖10', callback_data: 'admin:padddays:' + addState(s.cat, s.planId, s.gb, Math.max(0, cur - 10), s.coins) },
     { text: '➖1', callback_data: 'admin:padddays:' + addState(s.cat, s.planId, s.gb, Math.max(0, cur - 1), s.coins) },
     { text: '➕1', callback_data: 'admin:padddays:' + addState(s.cat, s.planId, s.gb, cur + 1, s.coins) },
     { text: '➕10', callback_data: 'admin:padddays:' + addState(s.cat, s.planId, s.gb, cur + 10, s.coins) }],
    [{ text: '⏭ بعدی: قیمت', callback_data: 'admin:paddcoins:' + addState(s.cat, s.planId, s.gb, cur, s.coins),
       style: 'success' }],
    [{ text: T.back, callback_data: 'admin:back' }],
  ]) };
}

function screenAddCoins(st) {
  const s = parseAddState(st);
  const sug = coin.priceFor({ cat: s.cat, gb: s.gb, days: s.days });
  const cur = s.coins || sug || 100;
  const text =
    '<b>' + T.addProduct + ' — قیمت و ثبت</b>\n' + LINE + '\n\n' +
    'دسته: ' + catLabel(s.cat) + '\n' +
    '🛰 پلن <code>' + s.planId + '</code>\n' +
    (coin.normCat(s.cat) === 'unlimited'
      ? '♾ حجم: بدون محدودیت\n'
      : '💾 حجم <code>' + fa(s.gb || 0) + '</code> گیگ\n') +
    '⏱ مدت <code>' + fa(s.days || 0) + '</code> روز\n\n' +
    '💎 قیمت: <code>' + fa(cur) + '</code> کوین\n' +
    (sug !== null && sug !== cur
      ? '<i>پیشنهاد فرمول: ' + fa(sug) + ' کوین</i>\n' : '') +
    '\n<i>اعمال فوری.</i>';
  return { text: text, markup: kb([
    [{ text: '➖100', callback_data: 'admin:paddcoins:' + addState(s.cat, s.planId, s.gb, s.days, Math.max(0, cur - 100)) },
     { text: '➖10', callback_data: 'admin:paddcoins:' + addState(s.cat, s.planId, s.gb, s.days, Math.max(0, cur - 10)) },
     { text: '➖1', callback_data: 'admin:paddcoins:' + addState(s.cat, s.planId, s.gb, s.days, Math.max(0, cur - 1)) }],
    [{ text: '➕1', callback_data: 'admin:paddcoins:' + addState(s.cat, s.planId, s.gb, s.days, cur + 1) },
     { text: '➕10', callback_data: 'admin:paddcoins:' + addState(s.cat, s.planId, s.gb, s.days, cur + 10) },
     { text: '➕100', callback_data: 'admin:paddcoins:' + addState(s.cat, s.planId, s.gb, s.days, cur + 100) }],
    (sug !== null && sug !== cur
      ? [{ text: '🧮 استفاده از فرمول (' + fa(sug) + ')',
           callback_data: 'admin:paddcoins:' + addState(s.cat, s.planId, s.gb, s.days, sug) }]
      : []),
    [{ text: '✅ ثبت محصول', callback_data: 'admin:paddgo:' + addState(s.cat, s.planId, s.gb, s.days, cur),
       style: 'success' }],
    [{ text: T.back, callback_data: 'admin:back' }],
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
    [{ text: T.back, callback_data: 'admin:back' }],
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
  rows.push([{ text: T.back, callback_data: 'admin:back' }]);
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
  rows.push([{ text: T.back, callback_data: 'admin:back' }]);
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
    [{ text: T.back, callback_data: 'admin:back' }],
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
    [{ text: T.back, callback_data: 'admin:back' }],
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
      [{ text: T.back, callback_data: 'admin:back' }]]) };
  }
  const key = (sign < 0 ? 'rev' : 'grant') + ':' + uid;
  if (busy.has(key)) {
    return { text: '⚠️ یک درخواست برای این کاربر در حال انجام است.',
             markup: kb([[{ text: T.back, callback_data: 'admin:back' }]]) };
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
      [{ text: T.back, callback_data: 'admin:back' }]]) };
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

/**
 * ── فرمول قیمت ─────────────────────────────────────────────
 * منوی قدیمی «قیمت پلن‌ها» (coinPrices) روی خرید هیچ اثری نداشت —
 * خرید همیشه از product.coins می‌خواند. آن منو حذف شد و جایش این
 * صفحه آمد که واقعاً قیمت محصولات را می‌سازد.
 */
function screenPricing() {
  const all = coin.getAllPricing();
  const pend = coin.applyPricing({ apply: false });
  let text = '<b>' + T.prices + '</b>\n' + LINE + '\n\n' +
             '<i>قیمت هر محصول از روی دسته‌اش حساب می‌شود.</i>\n\n';
  for (const c of coin.CATS) {
    const f = all[c];
    text += '<b>' + catLabel(c) + '</b>\n' +
            (f.enabled ? '' : '⛔️ خاموش\n') +
            (c === 'volume'
              ? '• هر گیگ <code>' + fa(f.perGb) + '</code> کوین\n' : '') +
            '• هر روز <code>' + fa(f.perDay) + '</code> کوین\n' +
            '• پایه <code>' + fa(f.base) + '</code> کوین\n\n';
  }
  if (pend.length) {
    text += '⚠️ <b>' + fa(pend.length) + '</b> محصول با فرمول فعلی ' +
            'قیمت متفاوتی می‌گیرد.';
  } else {
    text += '✅ قیمت همه محصولات با فرمول هماهنگ است.';
  }
  const rows = [];
  for (const c of coin.CATS) {
    rows.push([{ text: '⚙️ ' + catLabel(c), callback_data: 'admin:pcf:' + c }]);
  }
  if (pend.length) {
    rows.push([{ text: '👁 پیش‌نمایش', callback_data: 'admin:pcprev' }]);
    rows.push([{ text: '✅ اعمال روی ' + fa(pend.length) + ' محصول',
                 callback_data: 'admin:pcapply', style: 'success' }]);
  }
  rows.push([{ text: T.back, callback_data: 'admin:back' }]);
  return { text: text, markup: kb(rows) };
}

function deltaRow(cat, field, big) {
  const b = big || 5;
  return [
    { text: '➖' + fa(b), callback_data: 'admin:pcv:' + cat + ':' + field + ':-' + b },
    { text: '➖1', callback_data: 'admin:pcv:' + cat + ':' + field + ':-1' },
    { text: '➕1', callback_data: 'admin:pcv:' + cat + ':' + field + ':1' },
    { text: '➕' + fa(b), callback_data: 'admin:pcv:' + cat + ':' + field + ':' + b },
  ];
}

function exampleFor(c) {
  if (coin.normCat(c) === 'unlimited') {
    return 'نامحدود ۳۰ روزه = ' +
           fa(coin.priceFor({ cat: 'unlimited', gb: 0, days: 30 })) + ' کوین';
  }
  return '۳۰ گیگ ۳۰ روزه = ' +
         fa(coin.priceFor({ cat: 'volume', gb: 30, days: 30 })) + ' کوین';
}

/** تنظیم فرمول یک دسته با دکمه‌های +/−. */
function screenPricingCat(cat) {
  const c = coin.normCat(cat);
  const f = coin.getPricing(c);
  const isVol = c === 'volume';
  const text =
    '<b>⚙️ فرمول ' + catLabel(c) + '</b>\n' + LINE + '\n\n' +
    'قیمت = ' + (isVol ? 'هر گیگ × گیگ + ' : '') + 'هر روز × روز + پایه\n\n' +
    (isVol ? '📦 هر گیگ <code>' + fa(f.perGb) + '</code> کوین\n' : '') +
    '📅 هر روز <code>' + fa(f.perDay) + '</code> کوین\n' +
    '➕ پایه <code>' + fa(f.base) + '</code> کوین\n' +
    '🔄 گِرد به <code>' + fa(f.round) + '</code>\n\n' +
    'وضعیت: ' + (f.enabled ? '✅ روشن' : '⛔️ خاموش') + '\n\n' +
    '<i>مثال: ' + exampleFor(c) + '</i>';
  const rows = [];
  if (isVol) {
    rows.push([{ text: '📦 هر گیگ', callback_data: 'admin:ignore' }]);
    rows.push(deltaRow(c, 'perGb'));
  }
  rows.push([{ text: '📅 هر روز', callback_data: 'admin:ignore' }]);
  rows.push(deltaRow(c, 'perDay'));
  rows.push([{ text: '➕ پایه', callback_data: 'admin:ignore' }]);
  rows.push(deltaRow(c, 'base', 10));
  rows.push([
    { text: f.enabled ? '⛔️ خاموش' : '✅ روشن', callback_data: 'admin:pctog:' + c },
    { text: '↩️ پیش‌فرض', callback_data: 'admin:pcreset:' + c },
  ]);
  rows.push([{ text: T.back, callback_data: 'admin:back' }]);
  return { text: text, markup: kb(rows) };
}

function applyPricingField(cat, field, delta) {
  const c = coin.normCat(cat);
  const f = coin.getPricing(c);
  const patch = {};
  patch[field] = Math.max(0, Number(f[field] || 0) + Number(delta));
  coin.setPricing(c, patch);
  return screenPricingCat(c);
}

function togglePricing(cat) {
  const c = coin.normCat(cat);
  coin.setPricing(c, { enabled: !coin.getPricing(c).enabled });
  return screenPricingCat(c);
}

function resetPricingCat(cat) {
  coin.resetPricing(cat);
  return screenPricingCat(cat);
}

function screenPricingPreview() {
  const ch = coin.applyPricing({ apply: false });
  let text = '<b>👁 پیش‌نمایش تغییر قیمت</b>\n' + LINE + '\n\n';
  if (!ch.length) {
    text += '✅ چیزی برای تغییر نیست.';
  } else {
    for (const c of ch.slice(0, 25)) {
      text += '• ' + c.label + '\n   <code>' + fa(c.from) + '</code> → <code>' +
              fa(c.to) + '</code> کوین\n';
    }
    if (ch.length > 25) text += '\n<i>و ' + fa(ch.length - 25) + ' مورد دیگر…</i>';
    text += '\n<i>محصولات با قیمت دستی دست‌نخورده می‌مانند.</i>';
  }
  const rows = [];
  if (ch.length) rows.push([{ text: '✅ اعمال', callback_data: 'admin:pcapply', style: 'success' }]);
  rows.push([{ text: T.back, callback_data: 'admin:back' }]);
  return { text: text, markup: kb(rows) };
}

function doApplyPricing() {
  const ch = coin.applyPricing({ apply: true });
  return {
    text: '<b>✅ اعمال شد</b>\n' + LINE + '\n\n' +
          'قیمت <code>' + fa(ch.length) + '</code> محصول به‌روز شد.\n\n' +
          '<i>محصولات با قیمت دستی تغییر نکردند.</i>',
    markup: kb([[{ text: '🧮 فرمول قیمت', callback_data: 'admin:pricing' }],
                [{ text: '🛍 فاکس شاپ', callback_data: 'admin:products' }]]),
  };
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
    [{ text: T.back, callback_data: 'admin:back' }],
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
    [{ text: T.back, callback_data: 'admin:back' }],
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
  rmode: 'admin:rmode:', rv: 'admin:rv:',
  rcap: 'admin:rcap:', rmin: 'admin:rmin:',
  rrep: 'admin:rrep:', ren: 'admin:ren:',
  tedit: 'admin:tedit:', treset: 'admin:treset:',
  user: 'admin:user:', uhist: 'admin:uhist:',
  grant: 'admin:grant:', grantv: 'admin:grantv:', grantgo: 'admin:grantgo:',
  revoke: 'admin:revoke:', revokev: 'admin:revokev:',
  revokego: 'admin:revokego:',
  pcf: 'admin:pcf:', pcv: 'admin:pcv:',
  pctog: 'admin:pctog:', pcreset: 'admin:pcreset:',
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

  // ── بازگشت: یک پله عقب در مسیر واقعی همین ادمین
  let d2 = d;
  if (d === 'admin:back') {
    d2 = navBack(ctx.uid);
  } else if (isScreen(d)) {
    navPush(ctx.uid, d);
  }

  let s = null;
  if (d2 === 'admin') s = screenMenu();
  else if (d2 === 'admin:stats') s = screenStats();
  else if (d2 === 'admin:settings') s = screenSettings();
  else if (d2 === 'admin:products') s = screenProducts();
  else if (d2 === 'admin:shopstatus') s = toggleShop();
  else if (d2 === 'admin:padd') s = screenPickCat();
  else if (d2.startsWith('admin:paddman:')) s = screenManualPlan(ctx.uid, after(d2, 'admin:paddman:'));
  else if (d2.startsWith(P.paddcat)) s = await screenPickPlan(ctx, after(d2, P.paddcat));
  else if (d2.startsWith(P.paddplan)) {
    // نامحدود حجم ندارد: مرحله حجم رد می‌شود
    const st = after(d2, P.paddplan);
    s = coin.normCat(parseAddState(st).cat) === 'unlimited'
      ? screenAddDays(st) : screenAddGb(st);
  }
  else if (d2.startsWith(P.paddgb)) s = screenAddDays(after(d2, P.paddgb));
  else if (d2.startsWith(P.padddays)) s = screenAddCoins(after(d2, P.padddays));
  else if (d2.startsWith(P.paddcoins)) s = screenAddCoins(after(d2, P.paddcoins));
  else if (d2.startsWith(P.paddgo)) s = await doAddProduct(ctx, after(d2, P.paddgo));
  else if (d2.startsWith(P.pedit)) s = screenProductEdit(after(d2, P.pedit));
  else if (d2.startsWith(P.pgb)) s = screenProductGb(after(d2, P.pgb));
  else if (d2.startsWith(P.pgbv)) {
    const [id, v] = after(d2, P.pgbv).split(':');
    s = applyNumField(id, 'gb', v);
  } else if (d2.startsWith(P.pdays)) s = screenProductDays(after(d2, P.pdays));
  else if (d2.startsWith(P.pdaysv)) {
    const [id, v] = after(d2, P.pdaysv).split(':');
    s = applyNumField(id, 'days', v);
  } else if (d2.startsWith(P.plabel)) s = await doAutoLabel(ctx, after(d2, P.plabel));
  else if (d2.startsWith(P.pplan)) s = await screenPickProductPlan(ctx, after(d2, P.pplan));
  else if (d2.startsWith(P.pplanpick)) {
    const [id, pl] = after(d2, P.pplanpick).split(':');
    s = doChangePlan(id, pl);
  } else if (d2.startsWith(P.pcat)) s = await doToggleCat(ctx, after(d2, P.pcat));
  else if (d2 === 'admin:users') s = screenUsers();
  else if (d2 === 'admin:allusers') s = screenAllUsers(0);
  else if (d2.startsWith(P.allusers)) s = screenAllUsers(Number(after(d2, P.allusers)) || 0);
  else if (d2.startsWith(P.setbal)) {
    const parts = after(d2, P.setbal).split(':');
    s = screenSetBal(parts[0], Number(parts[1]) || 0, parts[2] || 'other');
  } else if (d2.startsWith(P.setbalgo)) {
    const parts = after(d2, P.setbalgo).split(':');
    s = doSetBal(parts[0], Number(parts[1]) || 0, parts[2] || 'other');
  } else if (d2 === 'admin:hub') s = screenHub();
  else if (d2 === 'admin:cap') s = screenCap();
  else if (d2.startsWith('admin:capv:')) s = applyCap(after(d2, 'admin:capv:'));
  else if (d2.startsWith('admin:capset:')) s = setCap(after(d2, 'admin:capset:'));
  else if (d2 === 'admin:miss') s = screenMissions();
  else if (d2 === 'admin:missnew') s = screenMissionNew();
  else if (d2.startsWith('admin:misstpl:')) s = createMissionFromTemplate(after(d2, 'admin:misstpl:'), ctx.uid);
  else if (d2.startsWith('admin:missed:')) s = screenMissionEdit(after(d2, 'admin:missed:'));
  else if (d2.startsWith('admin:misscv:')) {
    const [mi, mv] = after(d2, 'admin:misscv:').split(':');
    s = applyMissionNum(mi, 'coins', mv);
  } else if (d2.startsWith('admin:missnv:')) {
    const [mi, mv] = after(d2, 'admin:missnv:').split(':');
    s = applyMissionNum(mi, 'need', mv);
  } else if (d2.startsWith('admin:missc:')) s = screenMissionNum(after(d2, 'admin:missc:'), 'coins');
  else if (d2.startsWith('admin:missn:')) s = screenMissionNum(after(d2, 'admin:missn:'), 'need');
  else if (d2.startsWith('admin:misst:')) s = screenMissionTitle(ctx.uid, after(d2, 'admin:misst:'));
  else if (d2.startsWith('admin:missr:')) s = toggleMissionRepeat(after(d2, 'admin:missr:'));
  else if (d2.startsWith('admin:missa:')) s = toggleMissionActive(after(d2, 'admin:missa:'));
  else if (d2.startsWith('admin:missdelgo:')) s = doDeleteMission(after(d2, 'admin:missdelgo:'));
  else if (d2.startsWith('admin:missdel:')) s = confirmDeleteMission(after(d2, 'admin:missdel:'));
  else if (d2 === 'admin:rewards') s = screenRewards();
  else if (d2 === 'admin:tier') s = screenTier();
  else if (d2 === 'admin:tieradd') s = tierAdd();
  else if (d2 === 'admin:tierdel') s = tierDel();
  else if (d2 === 'admin:tiertog') s = tierToggle();
  else if (d2.startsWith('admin:tierv:')) {
    const [ti, tv] = after(d2, 'admin:tierv:').split(':');
    s = tierAdjust(ti, tv);
  } else if (d2.startsWith('admin:tierr:')) {
    s = tierRest(after(d2, 'admin:tierr:'));
  }
  else if (d2.startsWith(P.rcoins)) s = screenRewardEdit(after(d2, P.rcoins));
  else if (d2.startsWith(P.rcoinsv)) {
    const [k, v] = after(d2, P.rcoinsv).split(':');
    s = applyReward(k, v);
  } else if (d2.startsWith(P.rmode)) s = toggleRewardMode(after(d2, P.rmode));
  else if (d2.startsWith(P.rv)) {
    const [k, v] = after(d2, P.rv).split(':');
    s = applyReward(k, v);
  } else if (d2.startsWith(P.rcap)) {
    const [k, v] = after(d2, P.rcap).split(':');
    s = applyRewardCap(k, v);
  } else if (d2.startsWith(P.rmin)) {
    const [k, v] = after(d2, P.rmin).split(':');
    s = applyRewardMin(k, v);
  } else if (d2.startsWith(P.rrep)) s = toggleRewardRepeat(after(d2, P.rrep));
  else if (d2.startsWith(P.ren)) s = toggleRewardEnabled(after(d2, P.ren));
  else if (d2.startsWith(P.rreset)) s = resetReward(after(d2, P.rreset));
  else if (d2.startsWith(P.rdel)) s = deleteReward(after(d2, P.rdel));
  else if (d2 === 'admin:texts') s = screenTexts();
  else if (d2.startsWith('admin:tcat:')) s = screenTextCat(after(d2, 'admin:tcat:'));
  else if (d2 === 'admin:tresetall') s = resetAllTexts();
  else if (d2.startsWith(P.tedit)) s = screenTextEdit(ctx.uid, after(d2, P.tedit));
  else if (d2.startsWith(P.treset)) s = resetTextScreen(after(d2, P.treset));
  else if (d2 === 'admin:tcancel') {
    const p0 = pendingText(ctx.uid);
    const cat = p0 && p0.key ? catOfKey(p0.key) : null;
    clearPending(ctx.uid);
    s = cat ? screenTextCat(cat) : screenTexts();
  } else if (d2 === 'admin:pricing') s = screenPricing();
  else if (d2 === 'admin:pcprev') s = screenPricingPreview();
  else if (d2 === 'admin:pcapply') s = doApplyPricing();
  else if (d2 === 'admin:ignore') s = null;
  else if (d2.startsWith(P.pcf)) s = screenPricingCat(after(d2, P.pcf));
  else if (d2.startsWith(P.pctog)) s = togglePricing(after(d2, P.pctog));
  else if (d2.startsWith(P.pcreset)) s = resetPricingCat(after(d2, P.pcreset));
  else if (d2.startsWith(P.pcv)) {
    const [pc, pf, pv] = after(d2, P.pcv).split(':');
    s = applyPricingField(pc, pf, pv);
  }
  else if (d2 === 'admin:ledger') s = screenLedger();
  else if (d2 === 'admin:help') s = screenHelp();
  else if (d2.startsWith(P.set)) s = screenSetting(after(d2, P.set));
  else if (d2.startsWith(P.setv)) {
    const [k, v] = after(d2, P.setv).split(':');
    s = applySetting(k, v);
  } else if (d2.startsWith(P.toggle)) {
    s = toggleSetting(after(d2, P.toggle));
  } else if (d2.startsWith(P.reset)) {
    s = resetSetting(after(d2, P.reset));
  } else if (d2.startsWith(P.ptoggle)) {
    s = toggleProduct(after(d2, P.ptoggle));
  } else if (d2.startsWith(P.pdel)) {
    s = confirmDeleteProduct(after(d2, P.pdel));
  } else if (d2.startsWith(P.pdelgo)) {
    s = doDeleteProduct(after(d2, P.pdelgo));
  } else if (d2.startsWith(P.pcoins)) {
    s = screenProductCoins(after(d2, P.pcoins));
  } else if (d2.startsWith(P.pcoinsv)) {
    const [id, v] = after(d2, P.pcoinsv).split(':');
    s = applyProductCoins(id, v);
  } else if (d2.startsWith(P.user)) {
    s = screenUser(after(d2, P.user));
  } else if (d2.startsWith(P.uhist)) {
    s = screenUserHistory(after(d2, P.uhist));
  } else if (d2.startsWith(P.grant)) {
    s = screenGrant(after(d2, P.grant), 0, 'gift');
  } else if (d2.startsWith(P.grantv)) {
    const [u, amt, r] = after(d2, P.grantv).split(':');
    s = screenGrant(u, amt, r);
  } else if (d2.startsWith(P.grantgo)) {
    const [u, amt, r] = after(d2, P.grantgo).split(':');
    s = doGrant(u, amt, r);
  } else if (d2.startsWith(P.revoke)) {
    s = screenRevoke(after(d2, P.revoke), 0, 'balance');
  } else if (d2.startsWith(P.revokev)) {
    const [u, amt, r] = after(d2, P.revokev).split(':');
    s = screenRevoke(u, amt, r);
  } else if (d2.startsWith(P.revokego)) {
    const [u, amt, r] = after(d2, P.revokego).split(':');
    s = doRevoke(u, amt, r);
  } else {
    // مسیر ناشناخته در محدوده admin: منوی مدیریت
    navStacks.set(String(ctx.uid), ['admin']);
    s = screenMenu();
  }

  // برچسب تزئینی (admin:ignore) صفحه ندارد: پیام دست‌نخورده بماند
  if (!s) return true;

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

module.exports = { route, routeText, pendingText, clearPending,
                   isAdmin, adminMenuRows, T,
                   screenMenu, screenStats, screenSettings, screenProducts,
                   screenUsers, screenAllUsers, screenPricing, screenLedger,
                   screenRewards, screenTexts, screenHelp, doGrant, doRevoke,
                   doSetBal };

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
      a(coin.getProduct(np.id).cat === 'unlimited', 'دسته به نامحدود عوض شد');
      a(coin.getProduct(np.id).gb === 0, 'نامحدود حجم ندارد');
      await go('admin:pcat:' + np.id, null, { getPlans: getPlans2 });
      a(coin.getProduct(np.id).cat === 'volume', 'دسته محصول برگشت');

      // ── فرمول قیمت (جایگزین منوی مرده «قیمت پلن‌ها»)
      await go('admin:pricing');
      a(sent.text.includes('فرمول'), 'صفحه فرمول قیمت باز شد');
      a(JSON.stringify(sent.markup).includes('نامحدود'),
        'هر دو دسته در فرمول هستند');

      await go('admin:pcf:volume');
      a(sent.text.includes('هر گیگ'), 'فرمول حجمی: هر گیگ دارد');
      const gb0 = coin.getPricing('volume').perGb;
      await go('admin:pcv:volume:perGb:1');
      a(coin.getPricing('volume').perGb === gb0 + 1, 'هر گیگ زیاد شد');
      await go('admin:pcv:volume:perGb:-1');
      a(coin.getPricing('volume').perGb === gb0, 'هر گیگ کم شد');

      await go('admin:pcf:unlimited');
      a(!sent.text.includes('هر گیگ'), 'فرمول نامحدود «هر گیگ» ندارد');
      a(sent.text.includes('هر روز'), 'فرمول نامحدود «هر روز» دارد');

      await go('admin:pctog:volume');
      a(coin.getPricing('volume').enabled === false, 'فرمول خاموش شد');
      await go('admin:pctog:volume');
      a(coin.getPricing('volume').enabled === true, 'فرمول روشن شد');
      await go('admin:pcreset:volume');
      a(coin.getPricing('volume').perGb === coin.PRICING_DEFAULTS.volume.perGb,
        'بازگشت به پیش‌فرض');

      // اعمال دسته‌جمعی + احترام به قیمت دستی
      coin.setProduct({ id: 'PF1', label: 'ف', planId: 'PL1',
                        cat: 'volume', gb: 10, days: 30, coins: 1 });
      coin.setManualPrice('PF1', 999);
      coin.setProduct({ id: 'PF2', label: 'ف۲', planId: 'PL1',
                        cat: 'unlimited', gb: 0, days: 30, coins: 1 });
      await go('admin:pcprev');
      a(sent.text.includes('پیش‌نمایش'), 'پیش‌نمایش باز شد');
      await go('admin:pcapply');
      a(coin.getProduct('PF1').coins === 999, 'قیمت دستی محفوظ ماند');
      a(coin.getProduct('PF2').coins === coin.priceFor(coin.getProduct('PF2')),
        'قیمت فرمولی اعمال شد');

      // برچسب تزئینی نباید صفحه عوض کند
      const beforeIgnore = sent.text;
      await go('admin:ignore');
      a(sent.text === beforeIgnore, 'دکمه تزئینی صفحه را عوض نکرد');

      // ── پلکان خرید
      await go('admin:rewards');
      a(JSON.stringify(sent.markup).includes('admin:tier'), 'دکمه پلکان در جوایز هست');
      await go('admin:tier');
      a(sent.text.includes('پلکان'), 'صفحه پلکان باز شد');
      a(sent.text.includes('خاموش'), 'در ابتدا خاموش است');
      await go('admin:tiertog');
      a(coin.getTiers().enabled === true, 'پلکان روشن شد');
      a(coin.getTiers().tiers.length === 2, 'پله‌های پیش‌فرض ساخته شد');
      const t0 = coin.getTiers().tiers[0];
      await go('admin:tierv:0:10');
      a(coin.getTiers().tiers[0] === t0 + 10, 'پله اول زیاد شد');
      await go('admin:tierv:0:-10');
      a(coin.getTiers().tiers[0] === t0, 'پله اول کم شد');
      await go('admin:tieradd');
      a(coin.getTiers().tiers.length === 3, 'پله جدید اضافه شد');
      await go('admin:tierdel');
      a(coin.getTiers().tiers.length === 2, 'پله آخر حذف شد');
      const r0 = coin.getTiers().rest;
      await go('admin:tierr:5');
      a(coin.getTiers().rest === r0 + 5, 'جایزه بقیه خریدها زیاد شد');
      await go('admin:rewards');
      a(!JSON.stringify(sent.markup).includes('admin:rcoins:purchase'),
        'با پلکان روشن، «خرید سرویس» از فهرست کنار رفت');
      await go('admin:tiertog');
      a(coin.getTiers().enabled === false, 'پلکان خاموش شد');
      await go('admin:rewards');
      a(JSON.stringify(sent.markup).includes('admin:rcoins:purchase'),
        'با پلکان خاموش، «خرید سرویس» برگشت');

      // ── مرکز جوایز
      await go('admin:hub');
      a(sent.text.includes('مرکز جوایز'), 'مرکز جوایز باز شد');
      const hubK = JSON.stringify(sent.markup);
      a(hubK.includes('admin:tier'), 'پلکان از مرکز یک کلیک است');
      a(hubK.includes('admin:miss'), 'ماموریت‌ها در مرکز هست');
      a(hubK.includes('admin:cap'), 'سقف روزانه در مرکز هست');
      a(hubK.includes('admin:rcoins:signup'), 'هدیه خوش‌آمد در مرکز هست');
      await go('admin');
      a(JSON.stringify(sent.markup).includes('admin:hub'),
        'مرکز جوایز از منوی اصلی پنل یک کلیک است');

      // ── سقف روزانه
      await go('admin:cap');
      a(sent.text.includes('سقف'), 'صفحه سقف باز شد');
      const cap0 = coin.getSettings().dailyCap;
      await go('admin:capv:100');
      a(coin.getSettings().dailyCap === cap0 + 100, 'سقف زیاد شد');
      await go('admin:capv:-100');
      a(coin.getSettings().dailyCap === cap0, 'سقف کم شد');
      await go('admin:capset:0');
      a(coin.getSettings().dailyCap === 0, 'بدون سقف شد');
      await go('admin:capset:200');
      a(coin.getSettings().dailyCap === 200, 'پیش‌فرض برگشت');

      // ── ماموریت‌ها
      await go('admin:miss');
      a(sent.text.includes('ماموریت'), 'صفحه ماموریت‌ها باز شد');
      await go('admin:missnew');
      a(JSON.stringify(sent.markup).includes('misstpl'), 'الگوها نمایش داده شد');
      await go('admin:misstpl:p1');
      const mm = coin.listMissions(true)[0];
      a(!!mm && mm.kind === 'purchase', 'ماموریت از الگو ساخته شد');
      a(mm.need === 1 && mm.coins === 25, 'مقادیر الگو درست است');
      await go('admin:misscv:' + mm.id + ':10');
      a(coin.getMission(mm.id).coins === 35, 'جایزه ماموریت زیاد شد');
      await go('admin:missnv:' + mm.id + ':1');
      a(coin.getMission(mm.id).need === 2, 'شرط ماموریت زیاد شد');
      await go('admin:missr:' + mm.id);
      a(coin.getMission(mm.id).repeat === 'always', 'تکرار همیشگی شد');
      await go('admin:missa:' + mm.id);
      a(coin.getMission(mm.id).active === false, 'ماموریت غیرفعال شد');
      await go('admin:missa:' + mm.id);
      a(coin.getMission(mm.id).active === true, 'دوباره فعال شد');

      // عنوان ماموریت از متن
      await go('admin:misst:' + mm.id);
      a(!!pendingText('u9'), 'حالت دریافت عنوان فعال شد');
      a(await routeText({ uid: 'u9', config: { admins: ['u9'] },
                          text: 'ماموریت تازه' }) === true, 'عنوان ذخیره شد');
      a(coin.getMission(mm.id).title === 'ماموریت تازه', 'عنوان عوض شد');

      await go('admin:missdel:' + mm.id);
      a(sent.text.includes('حذف'), 'تأیید حذف آمد');
      await go('admin:missdelgo:' + mm.id);
      a(coin.getMission(mm.id) === null, 'ماموریت حذف شد');

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

      // ── جوایز فعالیت (موتور پیشرفته)
      await go('admin:rewards');
      a(sent.text.includes('جوایز') &&
        JSON.stringify(sent.markup).includes('جوین'),
        'صفحه جوایز باز شد');
      a(JSON.stringify(sent.markup).includes('خرید زیرمجموعه‌ها'),
        'خرید زیرمجموعه در فهرست جوایز هست');
      a(JSON.stringify(sent.markup).includes('حضور روزانه'),
        'حضور روزانه در فهرست جوایز هست');
      await go('admin:rcoins:join');
      a(sent.text.includes('10') && sent.text.includes('یک‌بار'),
        'جایزه فعلی جوین با جزئیات نمایش داده شد');
      await go('admin:rv:join:5');
      a(coin.getRewards().join.coins === 15, 'جایزه جوین با دکمه +۵ شد');
      await go('admin:rreset:join');
      a(coin.getRewards().join.coins === 10, 'ریست جایزه به پیش‌فرض کار کرد');
      // حالت‌ها: ثابت → درصدی → نسبی
      await go('admin:rmode:join');
      a(coin.getRewards().join.mode === 'percent', 'حالت جوین درصدی شد');
      await go('admin:rv:join:1');
      a(coin.getRewards().join.percent === 1, 'درصد با دکمه تغییر کرد');
      await go('admin:rv:join:-0.5');
      a(coin.getRewards().join.percent === 0.5, 'درصد اعشار هم می‌پذیرد');
      await go('admin:rmode:join');
      a(coin.getRewards().join.mode === 'per', 'حالت جوین نسبی شد');
      await go('admin:rv:join:1000');
      a(coin.getRewards().join.perAmount === 11000, 'تومان نسبی تغییر کرد');
      await go('admin:rmode:join');
      await go('admin:rreset:join');
      a(coin.getRewards().join.mode === 'fixed' &&
        coin.getRewards().join.coins === 10, 'برگشت کامل به پیش‌فرض');
      // سقف و حداقل خرید برای خرید زیرمجموعه
      await go('admin:rcoins:ref_purchase');
      a(sent.text.includes('5٪') && sent.text.includes('سقف'),
        'صفحه خرید زیرمجموعه جزئیات درصدی دارد');
      await go('admin:rcap:ref_purchase:50');
      a(coin.getRewards().ref_purchase.cap === 150, 'سقف جایزه +۵۰ شد');
      await go('admin:rmin:ref_purchase:100000');
      a(coin.getRewards().ref_purchase.minPurchase === 100000,
        'حداقل مبلغ خرید ثبت شد');
      await go('admin:rmin:ref_purchase:-100000');
      a(coin.getRewards().ref_purchase.minPurchase === 0,
        'حداقل مبلغ خرید صفر شد');
      await go('admin:rreset:ref_purchase');
      a(coin.getRewards().ref_purchase.cap === 100, 'ریست خرید زیرمجموعه');
      // تکرار و فعال/غیرفعال
      await go('admin:rcoins:mission');
      await go('admin:rrep:mission');
      a(coin.getRewards().mission.repeat === 'always', 'ماموریت همیشگی شد');
      await go('admin:rrep:mission');
      a(coin.getRewards().mission.repeat === 'once', 'ماموریت یک‌بار شد');
      await go('admin:ren:mission');
      a(coin.getRewards().mission.enabled === false, 'ماموریت غیرفعال شد');
      await go('admin:ren:mission');
      a(coin.getRewards().mission.enabled === true, 'ماموریت فعال شد');
      // فعالیت سفارشی
      coin.addRewardAction('visit', 7);
      await go('admin:rcoins:visit');
      a(sent.text.includes('7'), 'فعالیت سفارشی در پنل دیده شد');
      await go('admin:rv:visit:3');
      a(coin.getRewards().visit.coins === 10, 'جایزه فعالیت سفارشی ویرایش شد');
      await go('admin:rdel:visit');
      a(!('visit' in coin.getRewards()), 'فعالیت سفارشی حذف شد');
      await go('admin:rdel:join');
      a(coin.getRewards().join.coins === 10, 'پیش‌فرض با حذف حذف نمی‌شود');

      // ── متن‌ها
      await go('admin:texts');
      a(sent.text.includes('متن‌هایی که کاربر'), 'صفحه متن‌ها باز شد');
      a(JSON.stringify(sent.markup).includes('admin:tcat:guide') &&
        JSON.stringify(sent.markup).includes('admin:tcat:earn'),
        'متن‌ها به دو دسته تقسیم شد');
      a(!JSON.stringify(sent.markup).includes('admin:tedit:'),
        'فهرست بلند سیزده‌تایی از صفحه اول برداشته شد');
      await go('admin:tcat:guide');
      a(JSON.stringify(sent.markup).includes('admin:tedit:menu_note'),
        'دکمه ویرایش داخل دسته هست');
      a(sent.text.includes('تشویقی منو'), 'نام کوتاه در دسته آمد');
      a(sent.text.includes('راهنما و منو'), 'عنوان دسته درست است');
      await go('admin:tedit:menu_note');
      a(sent.text.includes('متن جدید را همین‌جا بفرست'), 'حالت ویرایش متن باز شد');
      const pend = pendingText('u9');
      a(pend && pend.key === 'menu_note', 'حالت ویرایش برای ادمین ثبت شد');
      a(await routeText({ uid: 'u9', config: { admins: ['u9'] },
                          text: 'متن جدید من' }) === true, 'متن دریافتی ذخیره شد');
      a(coin.getTexts().menu_note === 'متن جدید من', 'متن سفارشی در هسته ثبت شد');
      a(pendingText('u9') === null, 'پس از ذخیره، حالت پاک شد');
      a(await routeText({ uid: 'u9', config: { admins: ['u9'] },
                          text: 'بدون حالت' }) === false,
        'بدون حالت فعال، متن پذیرفته نمی‌شود');
      a(await routeText({ uid: 'u7', config: { admins: ['u9'] },
                          text: 'x' }) === false, 'غیرادمین نمی‌تواند متن بفرستد');
      await go('admin:tedit:guide_what');
      await go('admin:tcancel');
      a(pendingText('u9') === null, 'انصراف حالت را پاک کرد');
      await go('admin:treset:menu_note');
      a(coin.getTexts().menu_note === coin.TEXTS.menu_note,
        'برگشت به پیش‌فرض کار کرد');
      await go('admin:tedit:guide_what');
      a(await routeText({ uid: 'u9', config: { admins: ['u9'] },
                          text: '<b>x</b>' }) === false, 'متن با < پذیرفته نشد');
      a(coin.getTexts().guide_what === coin.TEXTS.guide_what,
        'متن نامعتبر ذخیره نشد');
      await go('admin:tcancel');

      // متن سفارشی: نشانه، بازگشت به دسته، ریست همگانی
      await go('admin:tedit:menu_note');
      await routeText({ uid: 'u9', config: { admins: ['u9'] }, text: 'سفارشی' });
      await go('admin:texts');
      a(sent.text.includes('🟢'), 'شمارش متن سفارشی در صفحه اول آمد');
      a(JSON.stringify(sent.markup).includes('admin:tresetall'),
        'دکمه ریست همگانی وقتی سفارشی هست ظاهر شد');
      await go('admin:tcat:guide');
      a(JSON.stringify(sent.markup).includes('admin:treset:menu_note'),
        'دکمه ↩️ کنار متن سفارشی هست');
      await go('admin:treset:menu_note');
      a(sent.text.includes('راهنما و منو'), 'بعد از ریست به همان دسته برگشت');
      await go('admin:tedit:guide_rules');
      a(sent.text.includes('dailyCap'), 'راهنمای متغیر برای متن قوانین آمد');
      await go('admin:tcancel');
      a(sent.text.includes('راهنما و منو'), 'انصراف به همان دسته برگشت');
      await go('admin:tedit:menu_note');
      await routeText({ uid: 'u9', config: { admins: ['u9'] }, text: 'ب' });
      await go('admin:tresetall');
      a(coin.getTexts().menu_note === coin.TEXTS.menu_note,
        'ریست همگانی همه را به پیش‌فرض برگرداند');
      a(!JSON.stringify(sent.markup).includes('admin:tresetall'),
        'وقتی همه پیش‌فرض‌اند دکمه ریست همگانی نیست');

      // ── ناوبری: بازگشت باید به همان جایی برود که آمده‌ای
      await go('admin'); await go('admin:hub'); await go('admin:tier');
      await go('admin:back');
      a(sent.text.includes('مرکز جوایز'),
        'مرکز→پلکان→بازگشت به مرکز برمی‌گردد (باگ گزارش‌شده)');
      await go('admin:back');
      a(sent.text.includes('مدیریت فاکس کوین'), 'یک پله دیگر عقب: منوی اصلی');

      await go('admin'); await go('admin:settings'); await go('admin:rewards');
      await go('admin:tier');
      await go('admin:back');
      a(sent.text.includes('جوایز فعالیت'),
        'همان صفحه از راه قدیمی به جوایز برمی‌گردد');
      await go('admin:back');
      a(sent.text.split('\n')[0].includes('تنظیمات'), 'و بعد به تنظیمات');

      await go('admin'); await go('admin:hub'); await go('admin:miss');
      await go('admin:missnew'); await go('admin:misstpl:d3');
      await go('admin:back');
      a(sent.text.includes('ماموریت‌ها') && !sent.text.includes('جدید'),
        'بعد از ساخت ماموریت، بازگشت به فهرست می‌رود نه انتخابگر الگو');

      for (let i = 0; i < 8; i++) { await go('admin:hub'); await go('admin:tier'); }
      await go('admin:back'); await go('admin:back');
      a(sent.text.includes('مدیریت فاکس کوین'),
        'رفت‌وبرگشت پیاپی پشته را باد نمی‌کند');

      await go('admin:xyz'); await go('admin:back');
      a(sent.text.includes('مدیریت فاکس کوین'),
        'بازگشت بعد از مسیر ناشناخته امن است');

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
