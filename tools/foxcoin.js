'use strict';
/**
 * ════════════════════════════════════════════════════════════════
 *  FOX COIN — هسته اقتصاد کوین
 *  نسخه: 1.5.0 | 2026-08-22 | فاز ۱ + محصول + مدیریت + فروشگاه + جوایز + متن‌ها
 * ════════════════════════════════════════════════════════════════
 *
 *  چرا فایل جدا:
 *    ربات کل store.json را در حافظه دارد و با هر تغییر بازنویسی
 *    می‌کند. اگر این ماژول در همان فایل بنویسد، نوشته‌اش بی‌صدا
 *    پاک می‌شود. پس داده کوین در فایل خودش می‌ماند.
 *
 *  چرا دفتر رویداد جدا:
 *    موجودی هیچ‌وقت مستقیم نوشته نمی‌شود. هر تغییر یک رویداد است و
 *    موجودی از جمع رویدادها می‌آید. با این کار هر اختلافی قابل
 *    ردیابی است و هیچ کوینی بی‌دلیل ظاهر یا ناپدید نمی‌شود.
 *
 *  چرا نوشتن اتمی:
 *    نوشتن مستقیم اگر وسط کار قطع شود، فایل نیمه‌نوشته و خراب
 *    می‌ماند. اول در فایل موقت می‌نویسیم بعد جابه‌جا می‌کنیم.
 *    جابه‌جایی در سیستم‌فایل اتمی است.
 *
 *  این فایل در مخزن کامل است. روی سرورهای قدیمی، upgrade-foxcoin.py
 *  دقیقاً همین نسخه را از روی نسخه فاز ۱ می‌سازد.
 */

const fs = require('fs');
const path = require('path');

const DATA_DIR = process.env.FOXCOIN_DATA_DIR ||
  path.join(__dirname, 'data');
const STORE = path.join(DATA_DIR, 'coin-store.json');
const LEDGER = path.join(DATA_DIR, 'coin-ledger.jsonl');

const EVENTS = ['signup', 'mission', 'purchase', 'referral',
                'spend', 'admin', 'reset', 'join'];

const DEFAULTS = {
  enabled: true,
  purchaseMode: 'fixed',      // fixed یا relative
  purchaseFixed: 10,          // در حالت ثابت، کوین هر خرید
  purchasePerAmount: 10000,   // در حالت نسبی، هر چند تومان یک کوین
  referralReward: 10,         // کوین بابت خرید زیرمجموعه
  signupReward: 5,            // جایزه ثبت‌نام
  dailyCap: 200,              // سقف کوین دریافتی هر کاربر در روز
  shopEnabled: true,          // فروشگاه کوینی باز/بسته
  reportChatId: '',           // گروه گزارش
  reportEvents: 'all',        // all یا money
};

// ───────────────────────── لایه فایل ─────────────────────────

function ensureDir() {
  if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR, { recursive: true });
}

function writeAtomic(file, text) {
  ensureDir();
  const tmp = file + '.tmp';
  fs.writeFileSync(tmp, text, 'utf8');
  fs.renameSync(tmp, file);
}

function loadStore() {
  try {
    return JSON.parse(fs.readFileSync(STORE, 'utf8'));
  } catch (e) {
    return { settings: {}, balances: {}, claimed: {}, coinPrices: {} };
  }
}

function saveStore(s) {
  writeAtomic(STORE, JSON.stringify(s, null, 2));
}

// ───────────────────────── تنظیمات ─────────────────────────

function getSettings() {
  const s = loadStore();
  return Object.assign({}, DEFAULTS, s.settings || {});
}

function setSetting(key, value) {
  if (!(key in DEFAULTS)) throw new Error('کلید ناشناخته: ' + key);
  const s = loadStore();
  s.settings = s.settings || {};
  s.settings[key] = value;
  saveStore(s);
  return getSettings();
}

// ───────────────────────── دفتر رویداد ─────────────────────────

function appendLedger(rec) {
  ensureDir();
  fs.appendFileSync(LEDGER, JSON.stringify(rec) + '\n', 'utf8');
}

function readLedger() {
  try {
    return fs.readFileSync(LEDGER, 'utf8')
      .split('\n').filter(Boolean).map(l => JSON.parse(l));
  } catch (e) {
    return [];
  }
}

function todayKey(ts) {
  return new Date(ts || Date.now()).toISOString().slice(0, 10);
}

/**
 * کوین دریافتی امروز، برای سقف روزانه.
 *
 * باگی که خودآزمون گرفت: رویداد ادمین از سقف معاف بود ولی در جمع
 * روزانه شمرده می‌شد. نتیجه: یک اصلاح دستی ادمین، سهمیه روزانه
 * کاربر را می‌سوزاند و ماموریت‌هایش رد می‌شد.
 * درست: اصلاح ادمین اصلاً جزو دریافت روزانه نیست.
 */
function earnedToday(uid) {
  const day = todayKey();
  return readLedger()
    .filter(r => String(r.uid) === String(uid) && r.type !== 'admin' &&
                 r.amount > 0 && todayKey(r.ts) === day)
    .reduce((a, r) => a + r.amount, 0);
}

// ───────────────────────── موجودی ─────────────────────────

function getBalance(uid) {
  const s = loadStore();
  return Number((s.balances || {})[String(uid)] || 0);
}

/**
 * تنها راه تغییر موجودی. مستقیم چیزی نوشته نمی‌شود.
 * amount مثبت یعنی دادن، منفی یعنی گرفتن.
 */
function addEvent(uid, type, amount, meta) {
  uid = String(uid);
  amount = Math.round(Number(amount));
  if (!EVENTS.includes(type)) throw new Error('نوع رویداد نامعتبر: ' + type);
  if (!Number.isFinite(amount) || amount === 0) {
    throw new Error('مقدار نامعتبر: ' + amount);
  }

  const cfg = getSettings();
  if (!cfg.enabled) return { ok: false, reason: 'سامانه کوین خاموش است' };

  // سقف روزانه فقط برای دریافت، و ادمین از آن معاف است
  if (amount > 0 && type !== 'admin' && cfg.dailyCap > 0) {
    const already = earnedToday(uid);
    if (already + amount > cfg.dailyCap) {
      return { ok: false, reason: 'سقف روزانه پر شده',
               already: already, cap: cfg.dailyCap };
    }
  }

  const before = getBalance(uid);
  if (amount < 0 && before + amount < 0) {
    return { ok: false, reason: 'موجودی کافی نیست',
             balance: before, need: -amount };
  }

  const s = loadStore();
  s.balances = s.balances || {};
  s.balances[uid] = before + amount;
  saveStore(s);

  const rec = { ts: Date.now(), uid: uid, type: type, amount: amount,
                balance: s.balances[uid], meta: meta || {} };
  appendLedger(rec);
  return { ok: true, balance: rec.balance, event: rec };
}

// ───────────────────────── قواعد اقتصاد ─────────────────────────

function coinsForPurchase(tomanAmount) {
  const c = getSettings();
  if (c.purchaseMode === 'relative') {
    const per = Math.max(1, Number(c.purchasePerAmount) || 10000);
    return Math.floor(Number(tomanAmount || 0) / per);
  }
  return Math.max(0, Number(c.purchaseFixed) || 0);
}

/** جایزه ماموریت. هر ماموریت برای هر کاربر فقط یک بار. */
function claimMission(uid, missionId, reward) {
  const key = String(uid) + ':' + String(missionId);
  const s = loadStore();
  s.claimed = s.claimed || {};
  if (s.claimed[key]) return { ok: false, reason: 'قبلاً دریافت شده' };

  const r = addEvent(uid, 'mission', reward, { mission: missionId });
  if (!r.ok) return r;

  const s2 = loadStore();
  s2.claimed = s2.claimed || {};
  s2.claimed[key] = Date.now();
  saveStore(s2);
  return r;
}

// ───────────────────────── جوایز فعالیت ─────────────────────────

/** جوایز پیش‌فرض هر فعالیت. مقدار هر کدام از پنل مدیریت قابل تغییر است. */
const REWARD_DEFAULTS = { signup: 5, join: 10, referral: 10, mission: 3 };

/** هر فعالیت چه نوع رویدادی در دفتر می‌سازد. */
const REWARD_EVENT = { signup: 'signup', join: 'join',
                       referral: 'referral', mission: 'mission' };

/**
 * جوایز همه فعالیت‌ها.
 * اولویت: تنظیمات ذخیره‌شده > کلیدهای قدیمی (signupReward/referralReward)
 * > پیش‌فرض. پس از مهاجرت، مقدار از همین‌جا خوانده می‌شود.
 */
function getRewards() {
  const s = loadStore();
  const out = {};
  const cfg = s.settings || {};
  for (const [k, legacy] of [['signup', 'signupReward'],
                             ['referral', 'referralReward']]) {
    if (cfg[legacy] !== undefined) out[k] = Number(cfg[legacy]) || 0;
  }
  return Object.assign({}, REWARD_DEFAULTS, out, s.rewards || {});
}

function setReward(key, coins) {
  key = String(key);
  const cur = getRewards();
  if (!(key in cur)) throw new Error('کلید جایزه ناشناخته: ' + key);
  const s = loadStore();
  s.rewards = s.rewards || {};
  s.rewards[key] = Math.max(0, Math.round(Number(coins)));
  saveStore(s);
  return getRewards()[key];
}

/** افزودن فعالیت جایزه‌دار سفارشی (مثلاً بازدید روزانه). */
function addRewardAction(key, coins) {
  key = String(key);
  if (!/^[a-z0-9_]{2,20}$/.test(key)) throw new Error('کلید جایزه نامعتبر');
  const s = loadStore();
  s.rewards = s.rewards || {};
  s.rewards[key] = Math.max(0, Math.round(Number(coins)) || 0);
  saveStore(s);
  return getRewards()[key];
}

/** حذف فعالیت سفارشی. پیش‌فرض‌ها حذف نمی‌شوند. */
function removeRewardAction(key) {
  const s = loadStore();
  if (!s.rewards || !(key in s.rewards)) return false;
  if (key in REWARD_DEFAULTS) return false;
  delete s.rewards[key];
  saveStore(s);
  return true;
}

/**
 * دادن جایزه یک فعالیت به کاربر. هر فعالیت برای هر کاربر فقط یک بار.
 * نوع رویداد بر اساس فعالیت: signup/join/referral/mission.
 */
function grantReward(uid, key) {
  key = String(key);
  const coins = Number(getRewards()[key]);
  if (!coins || coins <= 0) {
    return { ok: false, reason: 'جایزه این فعالیت صفر یا تعریف‌نشده است' };
  }
  const claimKey = 'r:' + String(uid) + ':' + key;
  const s = loadStore();
  s.claimed = s.claimed || {};
  if (s.claimed[claimKey]) return { ok: false, reason: 'قبلاً دریافت شده' };

  const type = REWARD_EVENT[key] || 'mission';
  const res = addEvent(uid, type, coins, { action: key });
  if (!res.ok) return res;

  const s2 = loadStore();
  s2.claimed = s2.claimed || {};
  s2.claimed[claimKey] = Date.now();
  saveStore(s2);
  return res;
}

/** قیمت کوینی یک محصول. اگر تعریف نشده باشد، یعنی با کوین فروخته نمی‌شود. */
function getCoinPrice(planId) {
  const s = loadStore();
  const v = (s.coinPrices || {})[String(planId)];
  return (v === undefined || v === null) ? null : Number(v);
}

// ───────────────────────── متن‌های سفارشی ─────────────────────────

/**
 * متن‌های قابل ویرایش رابط کاربری. مقدار هر کدام از پنل مدیریت یا
 * خط فرمان قابل تغییر است؛ متن ذخیره‌شده جای پیش‌فرض را می‌گیرد.
 * جای‌نگهدار {dailyCap} در زمان نمایش با سقف روزانه واقعی پر می‌شود.
 */
const TEXTS = {
  menu_note: '🎁 با فعالیت در ربات کوین جمع کنید و\nسرویس رایگان بگیرید.\n\n<i>برای شروع، راهنما را ببینید.</i>',
  guide_what: 'یک امتیاز داخلی که با فعالیت در ربات جمع می‌شود و\nبا آن بدون پرداخت پول، سرویس می‌گیرید.',
  guide_rules: '• سقف دریافت روزانه <code>{dailyCap}</code> کوین\n• هر فعالیت فقط یک‌بار جایزه دارد\n• کوین قابل انتقال به کاربر دیگر یا تبدیل به پول نیست',
  guide_footer: 'همه رویدادها در گردش حساب ثبت می‌شود.',
  earn_signup: 'ثبت‌نام در ربات',
  earn_join: 'جوین کانال/گروه',
  earn_purchase: 'خرید سرویس',
  earn_mission: 'انجام ماموریت‌ها',
  earn_referral: 'خرید دوستان دعوت‌شده',
};

/** متن‌ها با اولویت: ذخیره‌شده > پیش‌فرض. */
function getTexts() {
  const s = loadStore();
  return Object.assign({}, TEXTS, s.texts || {});
}

/**
 * ذخیره متن سفارشی. خالی یعنی برگشت به پیش‌فرض.
 * برای امنیت پیام تلگرام، کاراکترهای < و > پذیرفته نمی‌شوند
 * (متن نامعتبر HTML باعث خطای ارسال می‌شود).
 */
function setText(key, value) {
  key = String(key);
  if (!(key in TEXTS)) throw new Error('کلید متن ناشناخته: ' + key);
  value = String(value == null ? '' : value).trim();
  if (value.length > 1400) throw new Error('متن خیلی طولانی است (بیش از ۱۴۰۰ نویسه)');
  if (/[<>]/.test(value)) throw new Error('در متن نباید کاراکتر < یا > باشد');
  const s = loadStore();
  s.texts = s.texts || {};
  if (!value) delete s.texts[key];
  else s.texts[key] = value;
  saveStore(s);
  return getTexts()[key];
}

/** برگشت به متن پیش‌فرض. */
function resetText(key) {
  const s = loadStore();
  if (s.texts && key in s.texts) {
    delete s.texts[key];
    saveStore(s);
  }
  return getTexts()[key];
}

function setCoinPrice(planId, coins) {
  const s = loadStore();
  s.coinPrices = s.coinPrices || {};
  if (coins === null) delete s.coinPrices[String(planId)];
  else s.coinPrices[String(planId)] = Math.max(0, Math.round(Number(coins)));
  saveStore(s);
  return getCoinPrice(planId);
}

/** همه قیمت‌های ثبت‌شده (شناسه پلن → کوین). برای پنل مدیریت. */
function getCoinPrices() {
  const s = loadStore();
  return Object.assign({}, s.coinPrices || {});
}

/** خرج‌کردن برای یک محصول. صدور اشتراک کار ربات است، نه این ماژول. */
function spendForPlan(uid, planId) {
  const price = getCoinPrice(planId);
  if (price === null) return { ok: false, reason: 'این محصول با کوین فروخته نمی‌شود' };
  return addEvent(uid, 'spend', -price, { plan: planId });
}

// ───────────────────────── محصول کوینی ─────────────────────────

/**
 * محصول کوینی یک بسته از پیش تعریف‌شده است، نه پلن خام.
 *
 * چرا این‌طور: در خرید تومانی، ربات از کاربر نام‌کاربری و حجم
 * می‌پرسد و برای آن حالت گفت‌وگویی لازم است. در فروشگاه کوینی
 * همه‌چیز از قبل مشخص است، پس کاربر فقط یک دکمه می‌زند.
 */
function listProducts() {
  const s = loadStore();
  return Object.values(s.products || {})
    .filter(p => p && p.active !== false)
    .sort((a, b) => (a.coins || 0) - (b.coins || 0));
}

function getProduct(id) {
  const s = loadStore();
  return (s.products || {})[String(id)] || null;
}

function setProduct(p) {
  if (!p || !p.id) throw new Error('محصول باید شناسه داشته باشد');
  for (const k of ['planId', 'cat', 'coins']) {
    if (p[k] === undefined || p[k] === null || p[k] === '') {
      throw new Error('فیلد لازم پر نشده: ' + k);
    }
  }
  const s = loadStore();
  s.products = s.products || {};
  s.products[String(p.id)] = {
    id: String(p.id),
    label: p.label || String(p.id),
    planId: String(p.planId),
    cat: String(p.cat),
    gb: Number(p.gb || 0),
    days: Number(p.days || 0),
    coins: Math.max(0, Math.round(Number(p.coins))),
    active: p.active !== false,
  };
  saveStore(s);
  return s.products[String(p.id)];
}

function removeProduct(id) {
  const s = loadStore();
  if (!s.products || !s.products[String(id)]) return false;
  delete s.products[String(id)];
  saveStore(s);
  return true;
}

// ───────────────────────── ابزار مدیریت ─────────────────────────

/** دارندگان برتر، از بیشترین موجودی. برای پنل مدیریت. */
function topHolders(n) {
  const s = loadStore();
  return Object.entries(s.balances || {})
    .map(([uid, bal]) => ({ uid: uid, balance: Number(bal || 0) }))
    .filter(x => x.balance > 0)
    .sort((a, b) => b.balance - a.balance)
    .slice(0, n || 10);
}

/** شناسه کاربرانی که اخیراً رویداد داشته‌اند، جدیدترین اول. */
function recentUsers(n) {
  const seen = new Set();
  const out = [];
  for (const r of readLedger().slice().reverse()) {
    const uid = String(r.uid);
    if (!seen.has(uid)) {
      seen.add(uid);
      out.push(uid);
    }
    if (out.length >= (n || 10)) break;
  }
  return out;
}

/** آخرین رویدادهای دفتر کل، جدیدترین اول. */
function ledgerRecent(n) {
  return readLedger().slice(-(n || 20)).reverse();
}

/** همه کاربرانی که تاکنون رویداد یا موجودی داشته‌اند، بر اساس آخرین فعالیت. */
function userList() {
  const s = loadStore();
  const seen = new Map();
  for (const r of readLedger()) {
    const uid = String(r.uid);
    if (!seen.has(uid)) seen.set(uid, r.ts);
  }
  for (const uid of Object.keys(s.balances || {})) {
    if (!seen.has(uid)) seen.set(uid, 0);
  }
  return [...seen.entries()]
    .map(([uid, ts]) => ({ uid: uid, lastTs: ts }))
    .sort((a, b) => b.lastTs - a.lastTs);
}

// ───────────────────────── گزارش ─────────────────────────

function history(uid, limit) {
  return readLedger()
    .filter(r => String(r.uid) === String(uid))
    .slice(-(limit || 20))
    .reverse();
}

function stats() {
  const led = readLedger();
  const issued = led.filter(r => r.amount > 0).reduce((a, r) => a + r.amount, 0);
  const spent = led.filter(r => r.amount < 0).reduce((a, r) => a - r.amount, 0);
  const s = loadStore();
  const holders = Object.keys(s.balances || {}).length;
  const circulating = Object.values(s.balances || {})
    .reduce((a, v) => a + Number(v || 0), 0);
  return { events: led.length, issued: issued, spent: spent,
           circulating: circulating, holders: holders };
}

// ───────────────────────── ابزار خط فرمان ─────────────────────────

function cli() {
  const [cmd, a, b, ...rest] = process.argv.slice(2);
  const out = (o) => console.log(JSON.stringify(o, null, 2));

  switch (cmd) {
    case 'balance':
      return out({ uid: a, balance: getBalance(a) });
    case 'grant':
      return out(addEvent(a, 'admin', Number(b), { note: rest.join(' ') }));
    case 'history':
      return out(history(a, Number(b) || 20));
    case 'settings':
      return out(getSettings());
    case 'set': {
      let v = b;
      if (v === 'true') v = true;
      else if (v === 'false') v = false;
      else if (v !== '' && !isNaN(Number(v))) v = Number(v);
      return out(setSetting(a, v));
    }
    case 'price':
      return out({ plan: a, coins: b === undefined ? getCoinPrice(a)
                                                   : setCoinPrice(a, Number(b)) });
    case 'prices':
      return out(getCoinPrices());
    case 'rewards':
      return out(getRewards());
    case 'reward':
      return out({ key: a, coins: b === undefined ? getRewards()[a]
                                                  : setReward(a, Number(b)) });
    case 'reward-add':
      return out({ key: a, coins: addRewardAction(a, Number(b)) });
    case 'reward-del':
      return out({ removed: removeRewardAction(a) });
    case 'texts':
      return out(getTexts());
    case 'text':
      return out({ key: a, value: b === undefined ? getTexts()[a]
                                                   : setText(a, [b, ...rest].join(' ')) });
    case 'text-reset':
      return out({ key: a, value: resetText(a) });
    case 'stats':
      return out(stats());
    case 'products':
      return out(listProducts());
    case 'product-add': {
      const o = JSON.parse(a);
      return out(setProduct(o));
    }
    case 'product-del':
      return out({ removed: removeProduct(a) });
    case 'top':
      return out(topHolders(Number(a) || 10));
    case 'recent':
      return out(recentUsers(Number(a) || 10));
    case 'ledger':
      return out(ledgerRecent(Number(a) || 20));
    case 'users':
      return out(userList());
    case 'selftest':
      return selftest();
    default:
      console.log([
        'استفاده:',
        '  node foxcoin.js selftest',
        '  node foxcoin.js settings',
        '  node foxcoin.js set <کلید> <مقدار>',
        '  node foxcoin.js balance <شناسه کاربر>',
        '  node foxcoin.js grant <شناسه> <مقدار> <دلیل>',
        '  node foxcoin.js history <شناسه> [تعداد]',
        '  node foxcoin.js price <شناسه پلن> [کوین]',
        '  node foxcoin.js stats',
        '  node foxcoin.js products',
        '  node foxcoin.js product-add \'{"id":"P1","label":"سی گیگ",',
        '      "planId":"44trir5v","cat":"volume","gb":30,"days":30,"coins":100}\'',
        '  node foxcoin.js product-del <شناسه محصول>',
        '  node foxcoin.js top [تعداد]',
        '  node foxcoin.js recent [تعداد]',
        '  node foxcoin.js ledger [تعداد]',
        '  node foxcoin.js rewards',
        '  node foxcoin.js reward <کلید> [کوین]',
        '  node foxcoin.js reward-add <کلید> <کوین>',
        '  node foxcoin.js reward-del <کلید>',
        '  node foxcoin.js texts',
        '  node foxcoin.js text <کلید> <متن>',
        '  node foxcoin.js text-reset <کلید>',
      ].join('\n'));
  }
}

/** خودآزمون روی پوشه موقت. به داده واقعی دست نمی‌زند. */
function selftest() {
  const os = require('os');
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'foxcoin-'));
  const child = require('child_process');
  const code = [
    'const m=require(' + JSON.stringify(__filename) + ');',
    'const a=(c,m2)=>{if(!c){console.log("❌ "+m2);process.exit(1);}console.log("✅ "+m2);};',
    'm.setSetting("dailyCap",100);',
    'a(m.getSettings().shopEnabled===true,"فروشگاه کوینی پیش‌فرض باز است");',
    'm.setSetting("shopEnabled",false);',
    'a(m.getSettings().shopEnabled===false,"فروشگاه بسته شد");',
    'm.setSetting("shopEnabled",true);',
    'a(m.getBalance("u1")===0,"موجودی اولیه صفر است");',
    'a(m.addEvent("u1","signup",5).ok,"جایزه ثبت‌نام ثبت شد");',
    'a(m.getBalance("u1")===5,"موجودی به ۵ رسید");',
    'a(!m.addEvent("u1","spend",-99).ok,"خرج بیش از موجودی رد شد");',
    'a(m.addEvent("u1","admin",200).ok,"ادمین از سقف روزانه معاف است");',
    'a(!m.addEvent("u1","mission",150).ok,"سقف روزانه رعایت شد");',
    'a(m.claimMission("u1","m1",3).ok,"ماموریت اول گرفته شد");',
    'a(!m.claimMission("u1","m1",3).ok,"ماموریت تکراری رد شد");',
    'm.setSetting("purchaseMode","relative");m.setSetting("purchasePerAmount",10000);',
    'a(m.coinsForPurchase(35000)===3,"نرخ نسبی درست حساب شد");',
    'm.setSetting("purchaseMode","fixed");m.setSetting("purchaseFixed",10);',
    'a(m.coinsForPurchase(35000)===10,"نرخ ثابت درست حساب شد");',
    'm.setCoinPrice("p1",50);',
    'a(m.getCoinPrice("p1")===50,"قیمت کوینی ثبت شد");',
    'a(m.getCoinPrice("nope")===null,"محصول بدون قیمت کوینی نال است");',
    'a(m.getCoinPrices().p1===50,"فهرست قیمت‌ها درست است");',
    'a(m.spendForPlan("u1","p1").ok,"خرید کوینی انجام شد");',
    'm.setProduct({id:"x1",label:"سی گیگ",planId:"44trir5v",cat:"volume",gb:30,days:30,coins:100});',
    'a(m.listProducts().length===1,"محصول کوینی ثبت شد");',
    'a(m.getProduct("x1").coins===100,"قیمت محصول درست است");',
    'm.setProduct({id:"x2",label:"ارزان",planId:"cm1698h4",cat:"volume",gb:10,days:30,coins:40});',
    'a(m.listProducts()[0].id==="x2","محصولات از ارزان به گران مرتب شدند");',
    'let bad=false; try{m.setProduct({id:"x3"})}catch(e){bad=true} a(bad,"محصول ناقص رد شد");',
    'a(m.removeProduct("x1")===true,"محصول حذف شد");',
    'a(m.listProducts().length===1,"فهرست پس از حذف درست شد");',
    'const th=m.topHolders(5);',
    'a(th.length===1 && th[0].uid==="u1" && th[0].balance===158,"دارندگان برتر مرتب شدند");',
    'a(m.recentUsers(3)[0]==="u1","کاربران اخیر پیدا شدند");',
    'a(m.userList().length===1 && m.userList()[0].uid==="u1","فهرست همه کاربران درست است");',
    'a(m.ledgerRecent(3)[0].type==="spend","دفتر اخیر آخرین رویداد را اول می‌آورد");',
    'const s=m.stats();',
    'a(s.events===4,"دفتر دقیقاً چهار رویداد موفق دارد");',
    'a(s.issued===208,"جمع صادرشده ۲۰۸ است");',
    'a(s.spent===50,"جمع خرج‌شده ۵۰ است");',
    'a(s.circulating===158,"کوین در گردش ۱۵۸ است");',
    'a(s.holders===1,"یک دارنده ثبت شده");',
    'a(m.history("u1",99).length===4,"تاریخچه کامل برگشت");',
    'a(m.history("u1",2).length===2,"تاریخچه محدود شد");',
    'a(m.history("u1",1)[0].type==="spend","آخرین رویداد خرج است");',
    'const rw0=m.getRewards();',
    'a(rw0.signup===5 && rw0.join===10 && rw0.mission===3,"جوایز پیش‌فرض درست است");',
    'm.setReward("join",0);',
    'a(!m.grantReward("u1","join").ok,"جایزه صفر رد شد");',
    'm.setReward("join",10);',
    'a(m.grantReward("u1","join").ok,"جایزه جوین داده شد");',
    'a(!m.grantReward("u1","join").ok,"جایزه جوین فقط یک بار است");',
    'a(m.getBalance("u1")===168,"موجودی با جوین درست شد");',
    'a(m.grantReward("u1","referral").ok,"جایزه دعوت داده شد");',
    'a(m.getBalance("u1")===178,"موجودی با دعوت درست شد");',
    'm.addRewardAction("daily",7);',
    'a(m.getRewards().daily===7,"فعالیت سفارشی اضافه شد");',
    'a(m.grantReward("u1","daily").ok,"جایزه فعالیت سفارشی داده شد");',
    'a(m.removeRewardAction("daily")===true,"فعالیت سفارشی حذف شد");',
    'a(m.removeRewardAction("join")===false,"پیش‌فرض حذف نمی‌شود");',
    'a(m.getTexts().guide_what.includes("امتیاز داخلی"),"متن پیش‌فرض راهنما هست");',
    'a(m.getTexts().earn_join==="جوین کانال/گروه","عنوان بخش جوین پیش‌فرض است");',
    'm.setText("guide_what","متن سفارشی من");',
    'a(m.getTexts().guide_what==="متن سفارشی من","متن سفارشی ذخیره شد");',
    'a(m.setText("guide_what","")===m.TEXTS.guide_what,"خالی یعنی برگشت به پیش‌فرض");',
    'a(m.resetText("guide_what")===m.TEXTS.guide_what,"ریست صریح هم کار می‌کند");',
    'let badT=false; try{m.setText("guide_what","<b>بد</b>")}catch(e){badT=true} a(badT,"کاراکتر < رد شد");',
    'let badK=false; try{m.setText("nope","x")}catch(e){badK=true} a(badK,"کلید ناشناخته رد شد");',
    'console.log("\\nهمه تست‌ها گذشتند.");',
  ].join('\n');
  const f = path.join(tmp, 't.js');
  fs.writeFileSync(f, code);
  const r = child.spawnSync(process.execPath, [f],
    { env: Object.assign({}, process.env, { FOXCOIN_DATA_DIR: tmp }),
      encoding: 'utf8' });
  process.stdout.write(r.stdout || '');
  process.stderr.write(r.stderr || '');
  console.log('\nپوشه آزمون: ' + tmp);
  process.exit(r.status || 0);
}

module.exports = {
  getSettings, setSetting, getBalance, addEvent, coinsForPurchase,
  claimMission, getCoinPrice, setCoinPrice, getCoinPrices, spendForPlan,
  listProducts, getProduct, setProduct, removeProduct,
  topHolders, recentUsers, ledgerRecent, userList,
  getRewards, setReward, addRewardAction, removeRewardAction, grantReward,
  getTexts, setText, resetText, TEXTS,
  history, stats, readLedger, DEFAULTS, EVENTS, REWARD_DEFAULTS,
};

if (require.main === module) cli();
