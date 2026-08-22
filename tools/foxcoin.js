'use strict';
/**
 * ════════════════════════════════════════════════════════════════
 *  FOX COIN — هسته اقتصاد کوین
 *  نسخه: 1.6.0 | 2026-08-22 | موتور جوایز پیشرفته (ثابت/درصدی/نسبی + سقف + زنجیره روزانه)
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
                'spend', 'admin', 'reset', 'join', 'daily', 'first_purchase'];

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

/**
 * پیکربندی هر فعالیت جایزه‌دار. همه موارد از پنل مدیریت قابل تغییر است:
 *   mode        fixed (کوین ثابت) | percent (درصد از مبلغ) | per (هر X تومان، ۱ کوین)
 *   coins       کوین ثابت
 *   percent     درصد از مبلغ خرید
 *   perAmount   تومان به ازای هر ۱ کوین (حالت per)
 *   cap         سقف هر جایزه (فقط درصدی)
 *   minPurchase حداقل مبلغ خرید برای فعال‌بودن جایزه
 *   repeat      once (فقط یک‌بار برای هر کاربر) | always (هر بار)
 *   enabled     روشن/خاموش
 */
const REWARD_DEFAULTS = {
  signup:   { mode: 'fixed', coins: 5,   percent: 0, perAmount: 10000, cap: 0,   minPurchase: 0, repeat: 'once',   enabled: true },
  join:     { mode: 'fixed', coins: 10,  percent: 0, perAmount: 10000, cap: 0,   minPurchase: 0, repeat: 'once',   enabled: true },
  referral: { mode: 'fixed', coins: 10,  percent: 0, perAmount: 10000, cap: 0,   minPurchase: 0, repeat: 'once',   enabled: true },
  mission:  { mode: 'fixed', coins: 3,   percent: 0, perAmount: 10000, cap: 0,   minPurchase: 0, repeat: 'once',   enabled: true },
  purchase: { mode: 'fixed', coins: 10,  percent: 1, perAmount: 10000, cap: 0,   minPurchase: 0, repeat: 'always', enabled: true },
  first_purchase: { mode: 'fixed', coins: 20, percent: 0, perAmount: 10000, cap: 0, minPurchase: 0, repeat: 'once', enabled: true },
  ref_purchase:   { mode: 'percent', coins: 0, percent: 5, perAmount: 10000, cap: 100, minPurchase: 0, repeat: 'always', enabled: true },
  daily:    { mode: 'fixed', coins: 5,   percent: 0, perAmount: 10000, cap: 0,   minPurchase: 0, repeat: 'always', enabled: true },
};

/** هر فعالیت چه نوع رویدادی در دفتر می‌سازد. */
const REWARD_EVENT = { signup: 'signup', join: 'join', referral: 'referral',
                       mission: 'mission', purchase: 'purchase',
                       first_purchase: 'first_purchase',
                       ref_purchase: 'referral', daily: 'daily' };

/** پیکربندی یک فعالیت با سازگاری مقادیر قدیمی (عدد یا کلیدهای قدیمی). */
function normalizeReward(key, stored, settings) {
  const def = REWARD_DEFAULTS[key] ||
    { mode: 'fixed', coins: 10, percent: 0, perAmount: 10000, cap: 0,
      minPurchase: 0, repeat: 'once', enabled: true };
  const cfg = Object.assign({}, def);
  if (stored !== undefined && stored !== null) {
    if (typeof stored === 'object') Object.assign(cfg, stored);
    else { cfg.mode = 'fixed'; cfg.coins = Math.max(0, Math.round(Number(stored) || 0)); }
  }
  // سازگاری با تنظیمات قدیمی خرید (purchaseMode/purchaseFixed/purchasePerAmount)
  if (key === 'purchase' && stored === undefined) {
    if (settings.purchaseMode === 'relative' && Number(settings.purchasePerAmount) > 0) {
      cfg.mode = 'per';
      cfg.perAmount = Math.max(1, Number(settings.purchasePerAmount));
    } else if (settings.purchaseFixed !== undefined) {
      cfg.coins = Math.max(0, Number(settings.purchaseFixed) || 0);
    }
  }
  if (cfg.mode === 'percent') cfg.percent = Math.max(0, Number(cfg.percent) || 0);
  return cfg;
}

/** پیکربندی همه فعالیت‌ها (پیش‌فرض‌ها + سفارشی‌ها + سازگاری). */
function getRewards() {
  const s = loadStore();
  const settings = s.settings || {};
  const out = {};
  const legacy = {};
  if (settings.signupReward !== undefined) legacy.signup = Number(settings.signupReward) || 0;
  if (settings.referralReward !== undefined) legacy.referral = Number(settings.referralReward) || 0;
  const keys = new Set([...Object.keys(REWARD_DEFAULTS),
                        ...Object.keys(s.rewards || {}),
                        ...Object.keys(legacy)]);
  for (const key of keys) {
    const stored = legacy[key] !== undefined ? legacy[key] : (s.rewards || {})[key];
    out[key] = normalizeReward(key, stored, settings);
  }
  return out;
}

function getReward(key) {
  return getRewards()[String(key)] || null;
}

/** تغییر بخشی از پیکربندی یک فعالیت (مثلاً فقط percent یا enabled). */
function setRewardConfig(key, patch) {
  key = String(key);
  const cur = getRewards();
  if (!(key in cur)) throw new Error('کلید جایزه ناشناخته: ' + key);
  const s = loadStore();
  s.rewards = s.rewards || {};
  const base = normalizeReward(key, undefined, s.settings || {});
  const prev = (typeof s.rewards[key] === 'object' && s.rewards[key]) ? s.rewards[key] : {};
  s.rewards[key] = Object.assign({}, base, prev, patch || {});
  saveStore(s);
  return getReward(key);
}

/** سازگاری: مقدار ثابت (کوین) برای یک فعالیت. */
function setReward(key, coins) {
  return setRewardConfig(key, { mode: 'fixed', coins: Math.max(0, Math.round(Number(coins))) });
}

/** برگشت کامل به پیکربندی پیش‌فرض (یا حذف تنظیم سفارشی). */
function resetRewardConfig(key) {
  key = String(key);
  const s = loadStore();
  if (s.rewards && key in s.rewards) {
    delete s.rewards[key];
    saveStore(s);
  }
  return getReward(key);
}

/** افزودن فعالیت جایزه‌دار سفارشی (مثلاً بازدید روزانه). */
function addRewardAction(key, coins) {
  key = String(key);
  if (!/^[a-z0-9_]{2,20}$/.test(key)) throw new Error('کلید جایزه نامعتبر');
  const s = loadStore();
  s.rewards = s.rewards || {};
  s.rewards[key] = Object.assign(
    { mode: 'fixed', coins: 0, percent: 0, perAmount: 10000, cap: 0,
      minPurchase: 0, repeat: 'once', enabled: true },
    { coins: Math.max(0, Math.round(Number(coins)) || 0) });
  saveStore(s);
  return getReward(key);
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
 * محاسبه کوین یک فعالیت بر اساس پیکربندی و بستر (مبلغ خرید).
 * fixed: کوین ثابت | percent: درصد از مبلغ | per: هر X تومان، یک کوین.
 * minPurchase: زیر این مبلغ جایزه‌ای نیست | cap: سقف هر جایزه (درصدی).
 */
function computeReward(key, ctx) {
  const cfg = getReward(key);
  if (!cfg || !cfg.enabled) return 0;
  const amount = Math.max(0, Number(ctx && ctx.amount) || 0);
  if (cfg.minPurchase > 0 && amount < cfg.minPurchase) return 0;
  let coins = 0;
  if (cfg.mode === 'percent') {
    coins = Math.floor(amount * (Number(cfg.percent) || 0) / 100);
    if (cfg.cap > 0) coins = Math.min(coins, Math.round(Number(cfg.cap)));
  } else if (cfg.mode === 'per') {
    coins = Math.floor(amount / Math.max(1, Number(cfg.perAmount) || 1));
  } else {
    coins = Math.round(Number(cfg.coins) || 0);
  }
  return Math.max(0, coins);
}

/**
 * دادن جایزه یک فعالیت به کاربر.
 * repeat=once فقط یک بار برای هر کاربر؛ repeat=always هر بار (سقف روزانه همچنان هست).
 * ctx = { amount: مبلغ خرید (برای درصدی/نسبی), meta: اطلاعات فرعی }
 */
function grantReward(uid, key, ctx) {
  key = String(key);
  const cfg = getReward(key);
  if (!cfg || !cfg.enabled) return { ok: false, reason: 'این فعالیت غیرفعال است' };
  const coins = computeReward(key, ctx);
  if (coins <= 0) return { ok: false, reason: 'جایزه این فعالیت صفر است' };
  uid = String(uid);
  const repeatOnce = cfg.repeat === 'once';
  if (repeatOnce) {
    const claimKey = 'r:' + uid + ':' + key;
    const s0 = loadStore();
    if (s0.claimed && s0.claimed[claimKey]) {
      return { ok: false, reason: 'قبلاً دریافت شده' };
    }
  }
  const type = REWARD_EVENT[key] || 'mission';
  const meta = Object.assign({ action: key }, (ctx && ctx.meta) || {});
  const res = addEvent(uid, type, coins, meta);
  if (!res.ok) return res;
  if (repeatOnce) {
    const s2 = loadStore();
    s2.claimed = s2.claimed || {};
    s2.claimed['r:' + uid + ':' + key] = Date.now();
    saveStore(s2);
  }
  return Object.assign({}, res, { amount: coins, key: key });
}

/** جایزه خرید سرویس (خود کاربر) + پاداش اولین خرید. */
function onPurchase(uid, amountToman, meta) {
  return [
    Object.assign({ key: 'purchase' },
      grantReward(uid, 'purchase', { amount: amountToman, meta: meta })),
    Object.assign({ key: 'first_purchase' },
      grantReward(uid, 'first_purchase', { amount: amountToman, meta: meta })),
  ];
}

/** جایزه یک‌باره به دعوت‌کننده بابت اولین خرید دعوت‌شده. */
function rewardReferral(inviterUid, inviteeUid, amountToman, meta) {
  return grantReward(inviterUid, 'referral', {
    amount: amountToman,
    meta: Object.assign({ invitee: String(inviteeUid) }, meta || {}),
  });
}

/** جایزه به دعوت‌کننده بابت هر خرید دعوت‌شده (همیشگی، با سقف). */
function rewardRefPurchase(inviterUid, inviteeUid, amountToman, meta) {
  return grantReward(inviterUid, 'ref_purchase', {
    amount: amountToman,
    meta: Object.assign({ invitee: String(inviteeUid) }, meta || {}),
  });
}

// ── جایزه روزانه (حضور) با زنجیره ──

function yesterdayKey(now) {
  return todayKey(now - 864e5);
}

/** وضعیت جایزه روزانه کاربر: آیا امروز گرفته و زنجیره چند روز است. */
function dailyStatus(uid) {
  uid = String(uid);
  const s = loadStore();
  const rec = (s.daily || {})[uid];
  const today = todayKey();
  return {
    claimedToday: !!(rec && rec.last === today),
    streak: rec ? Math.max(1, Number(rec.streak) || 1) : 0,
  };
}

/**
 * جایزه روزانه. هر روز پیاپی ۱۰٪ پاداش بیشتر (تا ۲ برابر).
 * opts.now فقط برای آزمون (شبیه‌سازی روزهای گذشته).
 */
function claimDaily(uid, opts) {
  uid = String(uid);
  const cfg = getReward('daily');
  if (!cfg || !cfg.enabled) return { ok: false, reason: 'جایزه روزانه غیرفعال است' };
  const now = (opts && opts.now) || Date.now();
  const today = todayKey(now);
  const s = loadStore();
  const prev = (s.daily || {})[uid];
  if (prev && prev.last === today) {
    return { ok: false, reason: 'امروز گرفتی',
             streak: Math.max(1, Number(prev.streak) || 1) };
  }
  let streak = 1;
  if (prev && prev.last === yesterdayKey(now)) {
    streak = (Number(prev.streak) || 1) + 1;
  }
  const mult = 1 + 0.1 * Math.min(Math.max(0, streak - 1), 9);
  const coins = Math.round(computeReward('daily', {}) * mult);
  if (coins <= 0) return { ok: false, reason: 'جایزه روزانه صفر است' };
  const res = addEvent(uid, 'daily', coins, {
    streak: streak, mult: Math.round(mult * 100) / 100 });
  if (!res.ok) return res;
  s.daily = s.daily || {};
  s.daily[uid] = { last: today, streak: streak };
  saveStore(s);
  return Object.assign({}, res, { amount: coins, streak: streak,
                                  mult: Math.round(mult * 100) / 100 });
}

/** نرخ کوین بابت خرید (سازگاری کامل با تنظیمات قدیمی). */
function coinsForPurchase(tomanAmount) {
  return computeReward('purchase', { amount: tomanAmount });
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
  earn_daily: 'حضور روزانه',
  earn_first_purchase: 'اولین خرید شما',
  earn_ref_purchase: 'خرید زیرمجموعه‌های شما',
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
      return out({ key: a, reward: b === undefined ? getReward(a)
                                                   : setReward(a, Number(b)) });
    case 'reward-config':
      return out(setRewardConfig(a, JSON.parse(b || '{}')));
    case 'reward-mode':
      return out(setRewardConfig(a, { mode: b }));
    case 'reward-cap':
      return out(setRewardConfig(a, { cap: Number(b) }));
    case 'reward-min':
      return out(setRewardConfig(a, { minPurchase: Number(b) }));
    case 'reward-repeat':
      return out(setRewardConfig(a, { repeat: b }));
    case 'reward-toggle':
      return out(setRewardConfig(a, { enabled: b !== 'false' }));
    case 'reward-add':
      return out({ key: a, reward: addRewardAction(a, Number(b)) });
    case 'reward-del':
      return out({ removed: removeRewardAction(a) });
    case 'daily':
      return out(claimDaily(a));
    case 'purchase':
      return out(onPurchase(a, Number(b), { note: rest.join(' ') }));
    case 'ref-purchase':
      return out(rewardRefPurchase(a, b, Number(rest[0]), { note: rest.slice(1).join(' ') }));
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
        '  node foxcoin.js reward-config <کلید> \'{"mode":"percent","percent":5}\'',
        '  node foxcoin.js reward-mode <کلید> fixed|percent|per',
        '  node foxcoin.js reward-cap <کلید> <سقف>',
        '  node foxcoin.js reward-min <کلید> <حداقل مبلغ>',
        '  node foxcoin.js reward-repeat <کلید> once|always',
        '  node foxcoin.js reward-toggle <کلید>',
        '  node foxcoin.js reward-add <کلید> <کوین>',
        '  node foxcoin.js reward-del <کلید>',
        '  node foxcoin.js daily <شناسه کاربر>',
        '  node foxcoin.js purchase <شناسه> <مبلغ تومان>',
        '  node foxcoin.js ref-purchase <دعوت‌کننده> <دعوت‌شده> <مبلغ>',
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
    'a(rw0.signup.coins===5 && rw0.join.coins===10 && rw0.mission.coins===3,"جوایز پیش‌فرض درست است");',
    'a(rw0.ref_purchase.mode==="percent" && rw0.ref_purchase.percent===5,"خرید زیرمجموعه پیش‌فرض درصدی است");',
    'a(m.computeReward("ref_purchase",{amount:1000})===50,"درصد جایزه زیرمجموعه حساب شد");',
    'a(m.computeReward("ref_purchase",{amount:100000})===100,"سقف جایزه زیرمجموعه اعمال شد");',
    'a(m.computeReward("purchase",{amount:50000})===10,"جایزه خرید پیش‌فرض ثابت است");',
    'm.setRewardConfig("purchase",{mode:"percent",percent:1});',
    'a(m.computeReward("purchase",{amount:50000})===500,"جایزه خرید درصدی شد");',
    'a(m.coinsForPurchase(50000)===500,"نرخ خرید از پیکربندی جوایز می‌آید");',
    'm.setRewardConfig("purchase",{mode:"per",perAmount:10000});',
    'a(m.coinsForPurchase(35000)===3,"نرخ نسبی (هر ده هزار) درست است");',
    'a(m.coinsForPurchase(5000)===0,"زیر یک واحد نسبی چیزی نمی‌دهد");',
    'm.setRewardConfig("purchase",{mode:"fixed",coins:10});',
    'm.setRewardConfig("ref_purchase",{minPurchase:100000});',
    'a(m.computeReward("ref_purchase",{amount:50000})===0,"حداقل مبلغ خرید رعایت شد");',
    'a(m.computeReward("ref_purchase",{amount:200000})===100,"بالای حداقل مبلغ جایزه حساب شد");',
    'm.setRewardConfig("ref_purchase",{minPurchase:0});',
    'm.setReward("join",0);',
    'a(!m.grantReward("u1","join").ok,"جایزه صفر رد شد");',
    'm.setReward("join",10);',
    'a(m.grantReward("u1","join").ok,"جایزه جوین داده شد");',
    'a(!m.grantReward("u1","join").ok,"جایزه جوین فقط یک بار است");',
    'a(m.getBalance("u1")===168,"موجودی با جوین درست شد");',
    'a(m.grantReward("u1","referral").ok,"جایزه دعوت داده شد");',
    'a(m.getBalance("u1")===178,"موجودی با دعوت درست شد");',
    'a(m.rewardReferral("u5","u9",100000).ok,"جایزه دعوت (اولین خرید دعوت‌شده) داده شد");',
    'a(!m.rewardReferral("u5","u9",100000).ok,"جایزه دعوت فقط یک بار است");',
    'const rr=m.rewardRefPurchase("u4","u9",50000);',
    'a(rr.ok && rr.amount===100,"خرید زیرمجموعه: ۵٪ با سقف ۱۰۰");',
    'a(!m.rewardRefPurchase("u4","u9",50000).ok,"سقف روزانه برای خرید زیرمجموعه هم هست");',
    'a(m.getBalance("u4")===100,"موجودی دعوت‌کننده درست شد");',
    'm.setRewardConfig("join",{enabled:false});',
    'a(!m.grantReward("u1","join").ok,"فعالیت غیرفعال جایزه نمی‌دهد");',
    'm.setRewardConfig("join",{enabled:true});',
    'const fp=m.onPurchase("u3",200000,{desc:"تست"});',
    'a(fp[0].ok && fp[0].amount===10,"جایزه خرید عادی داده شد");',
    'a(fp[1].ok && fp[1].amount===20,"پاداش اولین خرید داده شد");',
    'const fp2=m.onPurchase("u3",100000);',
    'a(fp2[0].ok,"خرید دوم هم جایزه دارد");',
    'a(!fp2[1].ok,"پاداش اولین خرید فقط یک بار است");',
    'a(m.claimDaily("u2",{now:Date.now()-1728e5}).ok,"جایزه روزانه (دو روز پیش) گرفته شد");',
    'const d2=m.claimDaily("u2",{now:Date.now()-864e5});',
    'a(d2.ok && d2.streak===2,"زنجیره روز دوم شد");',
    'const d3=m.claimDaily("u2");',
    'a(d3.ok && d3.streak===3 && d3.amount===6,"روز سوم با پاداش زنجیره ۱.۲ برابر شد");',
    'a(!m.claimDaily("u2").ok,"جایزه روزانه تکراری رد شد");',
    'a(m.dailyStatus("u2").claimedToday===true,"وضعیت روزانه درست است");',
    'm.setRewardConfig("daily",{enabled:false});',
    'a(!m.claimDaily("u1").ok,"جایزه روزانه غیرفعال رد شد");',
    'm.setRewardConfig("daily",{enabled:true});',
    'm.addRewardAction("visit",2);',
    'a(m.getRewards().visit.coins===2,"فعالیت سفارشی اضافه شد");',
    'a(m.grantReward("u1","visit").ok,"جایزه فعالیت سفارشی داده شد");',
    'a(!m.grantReward("u1","visit").ok,"فعالیت سفارشی فقط یک بار است");',
    'm.setRewardConfig("visit",{repeat:"always"});',
    'a(m.grantReward("u1","visit").ok,"با تکرار همیشگی دوباره جایزه داد");',
    'a(m.removeRewardAction("visit")===true,"فعالیت سفارشی حذف شد");',
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
  getRewards, getReward, setReward, setRewardConfig, resetRewardConfig, computeReward,
  addRewardAction, removeRewardAction, grantReward,
  onPurchase, rewardReferral, rewardRefPurchase,
  claimDaily, dailyStatus, coinsForPurchase,
  getTexts, setText, resetText, TEXTS,
  history, stats, readLedger, DEFAULTS, EVENTS, REWARD_DEFAULTS,
};

if (require.main === module) cli();
