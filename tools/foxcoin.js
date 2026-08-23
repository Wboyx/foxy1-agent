'use strict';
/**
 * ════════════════════════════════════════════════════════════════
 *  FOX COIN — هسته اقتصاد کوین
 *  نسخه: 1.10.0 | 2026-08-23 | جوایز + پلکان + ماموریت + زیرمجموعه‌گیری
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
  signup:   { mode: 'fixed', coins: 20,   percent: 0, perAmount: 10000, cap: 0,   minPurchase: 0, repeat: 'once',   enabled: true },
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
/**
 * چندمین خرید کاربر است؟ از دفتر کل شمرده می‌شود، نه از شمارنده
 * جدا — چون دفتر کل تنها منبع حقیقت است و اگر ادمین رویدادی را
 * دستی اصلاح کند، شمارش هم خودش درست می‌ماند.
 * خروجی: تعداد خریدهای *قبلی* (۰ یعنی این اولین خرید است).
 */
function purchaseCount(uid) {
  uid = String(uid);
  let n = 0;
  for (const e of readLedger()) {
    if (String(e.uid) !== uid) continue;
    if (e.type === 'purchase') n++;
  }
  return n;
}

/**
 * ── پلکان خرید ─────────────────────────────────────────────
 * برای «خرید اول ۵۰، دوم ۳۰، سوم به بعد ۱۰».
 * در tiers ذخیره می‌شود: آرایه‌ای از عددها که هر خانه جایزه همان
 * شماره خرید است؛ بعد از آخرین خانه، rest برای بقیه.
 *
 *   tiers: [50, 30]   rest: 10
 *   خرید ۱ → ۵۰ ، خرید ۲ → ۳۰ ، خرید ۳ به بعد → ۱۰
 *
 * اگر tiers خالی باشد، رفتار قبلی (fixed/percent/per) دست‌نخورده
 * می‌ماند — یعنی نصب‌های موجود چیزی حس نمی‌کنند.
 */
function getTiers() {
  const s = loadStore();
  const t = s.purchaseTiers || {};
  return {
    tiers: Array.isArray(t.tiers) ? t.tiers.map(x => Math.max(0, Math.round(Number(x) || 0))) : [],
    rest: t.rest === undefined || t.rest === null ? null : Math.max(0, Math.round(Number(t.rest) || 0)),
    enabled: !!t.enabled,
  };
}

function setTiers(patch) {
  const s = loadStore();
  const cur = getTiers();
  if (patch.tiers !== undefined) {
    cur.tiers = (patch.tiers || []).map(x => Math.max(0, Math.round(Number(x) || 0)));
  }
  if (patch.rest !== undefined) {
    cur.rest = patch.rest === null ? null : Math.max(0, Math.round(Number(patch.rest) || 0));
  }
  if (patch.enabled !== undefined) cur.enabled = !!patch.enabled;
  s.purchaseTiers = cur;
  saveStore(s);
  return getTiers();
}

/** جایزه پلکانی برای n اُمین خرید (n از ۱ شروع می‌شود). */
function tierCoinsFor(n) {
  const t = getTiers();
  if (!t.enabled || !t.tiers.length) return null;
  const idx = Math.max(1, Math.round(Number(n) || 1)) - 1;
  if (idx < t.tiers.length) return t.tiers[idx];
  return t.rest === null ? t.tiers[t.tiers.length - 1] : t.rest;
}

function onPurchase(uid, amountToman, meta) {
  // شماره این خرید = خریدهای قبلی + ۱
  const nth = purchaseCount(uid) + 1;
  const tierCoins = tierCoinsFor(nth);

  if (tierCoins !== null) {
    // حالت پلکانی: یک جایزه بر اساس شماره خرید.
    // first_purchase جدا داده نمی‌شود چون پله اول خودش همان است.
    const out = [];
    if (tierCoins > 0) {
      const meta2 = Object.assign({ action: 'purchase', nth: nth },
                                  meta || {});
      const r = addEvent(uid, 'purchase', tierCoins, meta2);
      out.push(Object.assign({ key: 'purchase', nth: nth, tier: true },
                             r, { amount: tierCoins }));
    } else {
      out.push({ key: 'purchase', nth: nth, tier: true, ok: false,
                 reason: 'جایزه این پله صفر است' });
    }
    return out;
  }

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
  earn_signup_welcome: 'هدیه خوش‌آمدگویی',
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
/**
 * ── فرمول قیمت ─────────────────────────────────────────────
 * به‌جای تنظیم دستی تک‌تک محصولات، دو فرمول جدا نگه می‌داریم:
 *   volume    : perGb × گیگ  + perDay × روز  + base
 *   unlimited : perDay × روز + base
 * محصول می‌تواند قیمت دستی داشته باشد (manualPrice=true) که
 * فرمول به آن دست نمی‌زند.
 */
const PRICING_DEFAULTS = {
  volume:    { base: 0, perGb: 3, perDay: 0, round: 5, enabled: true },
  unlimited: { base: 50, perGb: 0, perDay: 2, round: 5, enabled: true },
};

function getPricing(cat) {
  const s = loadStore();
  const c = normCat(cat);
  const saved = (s.pricing || {})[c] || {};
  return Object.assign({}, PRICING_DEFAULTS[c], saved);
}

function getAllPricing() {
  const out = {};
  for (const c of CATS) out[c] = getPricing(c);
  return out;
}

function setPricing(cat, patch) {
  const c = normCat(cat);
  const s = loadStore();
  s.pricing = s.pricing || {};
  const cur = Object.assign({}, PRICING_DEFAULTS[c], s.pricing[c] || {});
  for (const k of ['base', 'perGb', 'perDay', 'round']) {
    if (patch[k] !== undefined) cur[k] = Math.max(0, Number(patch[k]) || 0);
  }
  if (patch.enabled !== undefined) cur.enabled = !!patch.enabled;
  s.pricing[c] = cur;
  saveStore(s);
  return getPricing(c);
}

function resetPricing(cat) {
  const c = normCat(cat);
  const s = loadStore();
  if (s.pricing) delete s.pricing[c];
  saveStore(s);
  return getPricing(c);
}

/** قیمت پیشنهادی فرمول برای یک محصول (بدون ذخیره). */
function priceFor(product) {
  const c = normCat(product && product.cat);
  const f = getPricing(c);
  if (!f.enabled) return null;
  const gb = c === 'unlimited' ? 0 : Math.max(0, Number(product.gb) || 0);
  const days = Math.max(0, Number(product.days) || 0);
  let v = Number(f.base) + gb * Number(f.perGb) + days * Number(f.perDay);
  const r = Math.max(1, Number(f.round) || 1);
  v = Math.ceil(v / r) * r;
  return Math.max(0, Math.round(v));
}

/**
 * اعمال فرمول روی محصولات. محصولاتی که قیمت دستی دارند رد
 * می‌شوند مگر force داده شود.
 * خروجی: گزارش تغییرها — بدون اعمال اگر apply=false باشد.
 */
function applyPricing(opts) {
  opts = opts || {};
  const only = opts.cat ? normCat(opts.cat) : null;
  const s = loadStore();
  const items = Object.values(s.products || {});
  const changes = [];
  for (const p of items) {
    if (only && normCat(p.cat) !== only) continue;
    if (p.manualPrice && !opts.force) continue;
    const next = priceFor(p);
    if (next === null || next === p.coins) continue;
    changes.push({ id: p.id, label: p.label, from: p.coins, to: next });
    if (opts.apply) {
      s.products[String(p.id)].coins = next;
      s.products[String(p.id)].manualPrice = false;
    }
  }
  if (opts.apply && changes.length) saveStore(s);
  return changes;
}

/** قیمت دستی: فرمول دیگر این محصول را عوض نمی‌کند. */
function setManualPrice(id, coins) {
  const s = loadStore();
  const p = (s.products || {})[String(id)];
  if (!p) return null;
  p.coins = Math.max(0, Math.round(Number(coins) || 0));
  p.manualPrice = true;
  saveStore(s);
  return p;
}

/** برگرداندن محصول به قیمت فرمولی. */
function clearManualPrice(id) {
  const s = loadStore();
  const p = (s.products || {})[String(id)];
  if (!p) return null;
  p.manualPrice = false;
  const next = priceFor(p);
  if (next !== null) p.coins = next;
  saveStore(s);
  return p;
}

/**
 * ── ماموریت‌ها ─────────────────────────────────────────────
 * تا امروز دکمه «ماموریت‌ها» فقط «به‌زودی» می‌گفت. حالا ادمین
 * ماموریت تعریف می‌کند و کاربر می‌گیرد.
 *
 * هر ماموریت:
 *   id     شناسه یکتا
 *   title  چیزی که کاربر می‌بیند
 *   desc   توضیح کوتاه (اختیاری)
 *   coins  جایزه
 *   kind   نوع تحقق:
 *            'manual'   کاربر خودش دکمه «انجام دادم» را می‌زند
 *            'purchase' با رسیدن به N خرید باز می‌شود
 *            'balance'  با رسیدن موجودی به N باز می‌شود
 *            'daily'    با N روز پیاپی حضور باز می‌شود
 *   need   عدد شرط (برای kindهای خودکار)
 *   repeat 'once' یا 'always'
 *   active فعال/غیرفعال
 *
 * چرا شرط‌ها از داده موجود خوانده می‌شوند: هیچ شمارنده جدیدی
 * نمی‌سازیم. purchase از دفتر کل، balance از موجودی، daily از
 * زنجیره روزانه — همان منابع حقیقتی که از قبل داریم.
 */
const MISSION_KINDS = ['manual', 'purchase', 'balance', 'daily'];

function listMissions(includeOff) {
  const s = loadStore();
  const all = Object.values(s.missions || {});
  const out = includeOff ? all : all.filter(m => m.active !== false);
  return out.sort((a, b) => (a.coins || 0) - (b.coins || 0));
}

function getMission(id) {
  const s = loadStore();
  return (s.missions || {})[String(id)] || null;
}

function setMission(m) {
  if (!m || !m.id) throw new Error('ماموریت باید شناسه داشته باشد');
  const s = loadStore();
  s.missions = s.missions || {};
  const kind = MISSION_KINDS.includes(String(m.kind)) ? String(m.kind) : 'manual';
  s.missions[String(m.id)] = {
    id: String(m.id),
    title: String(m.title || m.id).slice(0, 120),
    desc: String(m.desc || '').slice(0, 300),
    coins: Math.max(0, Math.round(Number(m.coins) || 0)),
    kind: kind,
    need: Math.max(0, Math.round(Number(m.need) || 0)),
    repeat: m.repeat === 'always' ? 'always' : 'once',
    active: m.active !== false,
  };
  saveStore(s);
  return s.missions[String(m.id)];
}

function removeMission(id) {
  const s = loadStore();
  if (s.missions) delete s.missions[String(id)];
  saveStore(s);
  return true;
}

function missionClaimed(uid, id) {
  const s = loadStore();
  return !!(s.claimed || {})['m:' + String(uid) + ':' + String(id)];
}

/**
 * پیشرفت کاربر روی یک ماموریت.
 * خروجی: { done, have, need, claimed, claimable, reason }
 */
function missionProgress(uid, m) {
  uid = String(uid);
  const claimed = missionClaimed(uid, m.id);
  let have = 0;
  let need = Math.max(0, Number(m.need) || 0);

  if (m.kind === 'purchase') have = purchaseCount(uid);
  else if (m.kind === 'balance') have = getBalance(uid);
  else if (m.kind === 'daily') have = (dailyStatus(uid) || {}).streak || 0;
  else { have = 0; need = 0; }   // manual: شرط عددی ندارد

  const done = m.kind === 'manual' ? true : have >= need;
  const once = m.repeat !== 'always';
  const claimable = m.active !== false && done && !(once && claimed);

  let reason = '';
  if (m.active === false) reason = 'غیرفعال';
  else if (once && claimed) reason = 'قبلاً دریافت شده';
  else if (!done) reason = 'هنوز کامل نشده';

  return { done: done, have: have, need: need, claimed: claimed,
           claimable: claimable, reason: reason };
}

/** دریافت جایزه یک ماموریت با همه بررسی‌ها. */
function claimMissionById(uid, id) {
  uid = String(uid);
  const m = getMission(id);
  if (!m) return { ok: false, reason: 'این ماموریت وجود ندارد' };
  const pr = missionProgress(uid, m);
  if (!pr.claimable) return { ok: false, reason: pr.reason || 'قابل دریافت نیست' };
  if (m.coins <= 0) return { ok: false, reason: 'جایزه این ماموریت صفر است' };

  const r = addEvent(uid, 'mission', m.coins, { mission: m.id, title: m.title });
  if (!r.ok) return r;

  if (m.repeat !== 'always') {
    const s = loadStore();
    s.claimed = s.claimed || {};
    s.claimed['m:' + uid + ':' + m.id] = Date.now();
    saveStore(s);
  }
  return Object.assign({}, r, { amount: m.coins, mission: m.id });
}


/**
 * ── سیستم زیرمجموعه‌گیری (رفرال) ───────────────────────────
 *
 * طراحی بر پایه چیزی که در برنامه‌های موفق تکرار می‌شود:
 *
 * ۱. جایزه دوطرفه. اگر فقط دعوت‌کننده جایزه بگیرد، دعوت‌شده دلیلی
 *    ندارد لینک را جدی بگیرد. وقتی هر دو چیزی می‌گیرند، دعوت از
 *    «التماس» به «هدیه» تبدیل می‌شود.
 * ۲. جایزه روی خرید واقعی، نه روی ثبت‌نام. ثبت‌نام رایگان است و
 *    اکانت جعلی می‌آورد؛ خرید یعنی پول واقعی.
 * ۳. پلکان خرید زیرمجموعه: خرید اول بیشتر، بعدی‌ها کمتر. همان
 *    الگویی که ۳۰٪ ماه اول / ۲۰٪ ماه دوم / ۱۰٪ بعد را می‌سازد.
 * ۴. پله‌های تعداد دعوت: با ۵ و ۱۰ و ۲۵ دعوتِ خریدار، جایزه یکجا.
 *    این چیزی است که دعوت‌کننده معمولی را به دعوت‌کننده حرفه‌ای
 *    تبدیل می‌کند.
 * ۵. سقف، برای اینکه یک نفر کل بودجه را نبرد.
 *
 * ساختار ذخیره:
 *   s.referrals[uid] = { by, at, purchases, earned }   ← رابطه
 *   s.refConfig = { enabled, invitee, tiers, rest, milestones, cap }
 */

const REF_DEFAULTS = {
  enabled: true,
  invitee: 15,            // هدیه به دعوت‌شده (بعد از اولین خریدش)
  tiers: [50, 30, 20],    // جایزه دعوت‌کننده: خرید اول/دوم/سوم زیرمجموعه
  rest: 10,               // خریدهای بعدی؛ null یعنی تکرار آخرین پله
  milestones: [           // پله تعدادی: با N زیرمجموعه خریدار
    { need: 5,  coins: 100 },
    { need: 10, coins: 250 },
    { need: 25, coins: 700 },
  ],
  cap: 0,                 // سقف کل درآمد رفرال هر کاربر (۰ = بی‌نهایت)
};

function getRefConfig() {
  const s = loadStore();
  return Object.assign({}, REF_DEFAULTS, s.refConfig || {});
}

function setRefConfig(patch) {
  const s = loadStore();
  const cur = Object.assign({}, REF_DEFAULTS, s.refConfig || {});
  const next = Object.assign({}, cur, patch || {});

  next.enabled = next.enabled !== false;
  next.invitee = Math.max(0, Math.floor(Number(next.invitee) || 0));
  next.cap = Math.max(0, Math.floor(Number(next.cap) || 0));
  next.tiers = (Array.isArray(next.tiers) ? next.tiers : [])
    .slice(0, 10).map(x => Math.max(0, Math.floor(Number(x) || 0)));
  next.rest = (next.rest === null || next.rest === undefined)
    ? null : Math.max(0, Math.floor(Number(next.rest) || 0));
  next.milestones = (Array.isArray(next.milestones) ? next.milestones : [])
    .slice(0, 10)
    .map(m => ({ need: Math.max(1, Math.floor(Number(m.need) || 1)),
                 coins: Math.max(0, Math.floor(Number(m.coins) || 0)) }))
    .sort((a, b) => a.need - b.need);

  s.refConfig = next;
  saveStore(s);
  return next;
}

/** جایزه دعوت‌کننده بابت n اُمین خرید یک زیرمجموعه. */
function refTierCoins(nth) {
  const c = getRefConfig();
  if (!c.enabled) return 0;
  const i = Math.max(1, Math.floor(nth)) - 1;
  if (i < c.tiers.length) return c.tiers[i];
  if (c.rest !== null) return c.rest;
  return c.tiers.length ? c.tiers[c.tiers.length - 1] : 0;
}

/**
 * ثبت رابطه دعوت. یک‌بار و برای همیشه؛ اگر کاربر قبلاً دعوت‌کننده
 * داشته باشد عوض نمی‌شود (وگرنه می‌شد لینک‌ها را جابه‌جا کرد).
 */
function setInviter(uid, inviterUid) {
  uid = String(uid);
  inviterUid = String(inviterUid);
  if (!uid || !inviterUid) return { ok: false, reason: 'شناسه نامعتبر' };
  if (uid === inviterUid) {
    return { ok: false, reason: 'کاربر نمی‌تواند دعوت‌کننده خودش باشد' };
  }
  const s = loadStore();
  s.referrals = s.referrals || {};
  if (s.referrals[uid] && s.referrals[uid].by) {
    return { ok: false, reason: 'قبلاً دعوت‌کننده دارد',
             by: s.referrals[uid].by };
  }
  // حلقه: اگر دعوت‌کننده خودش زیرمجموعه این کاربر باشد
  let cur = s.referrals[inviterUid] && s.referrals[inviterUid].by;
  for (let i = 0; i < 20 && cur; i++) {
    if (String(cur) === uid) {
      return { ok: false, reason: 'حلقه دعوت مجاز نیست' };
    }
    cur = s.referrals[cur] && s.referrals[cur].by;
  }
  s.referrals[uid] = { by: inviterUid, at: Date.now(),
                       purchases: 0, earned: 0 };
  saveStore(s);
  return { ok: true, by: inviterUid };
}

function getInviter(uid) {
  const s = loadStore();
  const r = (s.referrals || {})[String(uid)];
  return r && r.by ? String(r.by) : null;
}

/** فهرست زیرمجموعه‌های مستقیم یک کاربر. */
function listInvitees(uid) {
  uid = String(uid);
  const s = loadStore();
  const out = [];
  for (const [k, v] of Object.entries(s.referrals || {})) {
    if (v && String(v.by) === uid) {
      out.push({ uid: k, at: v.at || 0,
                 purchases: v.purchases || 0, earned: v.earned || 0 });
    }
  }
  return out.sort((a, b) => (b.earned || 0) - (a.earned || 0));
}

/** آمار رفرال یک کاربر — همان چیزی که در ربات نشان می‌دهیم. */
function refStats(uid) {
  const list = listInvitees(uid);
  const buyers = list.filter(x => x.purchases > 0);
  const earned = list.reduce((a, b) => a + (b.earned || 0), 0);
  const c = getRefConfig();
  let next = null;
  for (const m of c.milestones) {
    if (buyers.length < m.need) { next = m; break; }
  }
  return {
    total: list.length,
    buyers: buyers.length,
    earned: earned,
    next: next,
    remaining: next ? next.need - buyers.length : 0,
    list: list,
  };
}

/**
 * موتور اصلی: بعد از خرید واقعی کاربر صدا زده می‌شود.
 * هم جایزه دعوت‌کننده را می‌دهد، هم هدیه دعوت‌شده را، هم پله‌های
 * تعدادی را بررسی می‌کند.
 */
function onReferralPurchase(uid, amountToman, meta) {
  uid = String(uid);
  const c = getRefConfig();
  const out = { inviter: null, invitee: null, milestone: null };
  if (!c.enabled) return out;

  const s = loadStore();
  s.referrals = s.referrals || {};
  const rel = s.referrals[uid];
  if (!rel || !rel.by) return out;

  const inviter = String(rel.by);
  rel.purchases = (rel.purchases || 0) + 1;
  const nth = rel.purchases;
  saveStore(s);

  // ۱) هدیه دعوت‌شده — فقط بعد از اولین خرید خودش
  if (nth === 1 && c.invitee > 0) {
    const r = addEvent(uid, 'referral', c.invitee,
                       { action: 'invitee_bonus', inviter: inviter });
    out.invitee = Object.assign({ amount: c.invitee }, r);
  }

  // ۲) جایزه دعوت‌کننده بابت این خرید
  //
  // ترتیب اینجا مهم است: اول addEvent، بعد loadStore. اگر برعکس
  // باشد، نسخه‌ای که قبل از addEvent خوانده‌ایم موجودی تازه را
  // ندارد و saveStore آن را پاک می‌کند. یک‌بار همین اتفاق افتاد و
  // موجودی دعوت‌کننده صفر ماند با اینکه رویداد ثبت شده بود.
  const coins = refTierCoins(nth);
  if (coins > 0) {
    const cap = c.cap;
    const already = totalRefEarned(inviter);
    const give = cap > 0 ? Math.max(0, Math.min(coins, cap - already)) : coins;
    if (give > 0) {
      const r = addEvent(inviter, 'referral', give,
        { action: 'ref_purchase', invitee: uid, nth: nth,
          amount: amountToman });
      const s2 = loadStore();
      s2.referrals = s2.referrals || {};
      const rel2 = s2.referrals[uid] || {};
      rel2.earned = (rel2.earned || 0) + give;
      s2.referrals[uid] = rel2;
      saveStore(s2);
      out.inviter = Object.assign({ amount: give, nth: nth }, r);
    } else {
      out.inviter = { ok: false, reason: 'سقف درآمد رفرال پر شده' };
    }
  }

  // ۳) پله تعدادی — وقتی این زیرمجموعه تازه «خریدار» شد
  if (nth === 1) {
    const st = refStats(inviter);
    for (const m of c.milestones) {
      if (st.buyers === m.need && m.coins > 0) {
        const key = 'rm:' + inviter + ':' + m.need;
        const s3 = loadStore();
        if (!(s3.claimed || {})[key]) {
          const r = addEvent(inviter, 'referral', m.coins,
            { action: 'milestone', need: m.need });
          const s4 = loadStore();          // بعد از addEvent، نه قبلش
          s4.claimed = s4.claimed || {};
          s4.claimed[key] = Date.now();
          saveStore(s4);
          out.milestone = Object.assign({ amount: m.coins, need: m.need }, r);
        }
        break;
      }
    }
  }

  return out;
}

/** مجموع کوینی که این کاربر تا حالا از رفرال گرفته. */
function totalRefEarned(uid) {
  return listInvitees(uid).reduce((a, b) => a + (b.earned || 0), 0);
}

/** جدول برترین دعوت‌کننده‌ها — برای رقابت و انگیزه. */
function refLeaderboard(limit) {
  const s = loadStore();
  const agg = {};
  for (const v of Object.values(s.referrals || {})) {
    if (!v || !v.by) continue;
    const k = String(v.by);
    agg[k] = agg[k] || { uid: k, invites: 0, buyers: 0, earned: 0 };
    agg[k].invites++;
    if (v.purchases > 0) agg[k].buyers++;
    agg[k].earned += v.earned || 0;
  }
  return Object.values(agg)
    .sort((a, b) => b.earned - a.earned || b.buyers - a.buyers)
    .slice(0, Math.max(1, Math.floor(limit || 10)));
}

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

/**
 * دسته‌های واقعی ربات دقیقاً دوتا هستند: volume و unlimited.
 * نسخه‌های قبلی 'days' را به‌عنوان دسته دوم فرض می‌کردند که در
 * ربات وجود ندارد — به همین دلیل پلن‌های نامحدود هرگز فهرست
 * نمی‌شدند. هر مقدار ناشناخته به volume برمی‌گردد.
 */
const CATS = ['volume', 'unlimited'];

function normCat(c) {
  const v = String(c || '').toLowerCase();
  if (v === 'unlimited' || v === 'unlim' || v === 'nolimit') return 'unlimited';
  // 'days' میراث نسخه قدیمی است: در ربات دسته زمانی نداریم،
  // نزدیک‌ترین معادلش نامحدودِ مدت‌دار است.
  if (v === 'days' || v === 'time') return 'unlimited';
  return 'volume';
}

function isUnlimited(p) {
  return normCat(p && p.cat) === 'unlimited';
}

function setProduct(p) {
  if (!p || !p.id) throw new Error('محصول باید شناسه داشته باشد');
  for (const k of ['planId', 'cat', 'coins']) {
    if (p[k] === undefined || p[k] === null || p[k] === '') {
      throw new Error('فیلد لازم پر نشده: ' + k);
    }
  }
  const cat = normCat(p.cat);
  const s = loadStore();
  s.products = s.products || {};
  s.products[String(p.id)] = {
    id: String(p.id),
    label: p.label || String(p.id),
    planId: String(p.planId),
    cat: cat,
    // نامحدود حجم ندارد؛ ذخیره صفر تا هیچ‌جا «۰ گیگ» چاپ نشود
    gb: cat === 'unlimited' ? 0 : Number(p.gb || 0),
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
    case 'pricing':
      return out(a ? getPricing(a) : getAllPricing());
    case 'pricing-set': {
      // node foxcoin.js pricing-set volume '{"perGb":4,"base":10}'
      let patch = {};
      try { patch = JSON.parse(b || '{}'); } catch (e) {
        return out({ error: 'JSON نامعتبر' });
      }
      return out(setPricing(a, patch));
    }
    case 'pricing-reset':
      return out(resetPricing(a));
    case 'pricing-preview':
      return out(applyPricing({ cat: a || null, apply: false }));
    case 'pricing-apply':
      return out(applyPricing({ cat: a || null, apply: true,
                                force: b === 'force' }));
    case 'product-manual':
      return out(setManualPrice(a, Number(b)));
    case 'product-auto':
      return out(clearManualPrice(a));
    case 'rewards':
      return out(getRewards());
    case 'tiers':
      return out(getTiers());
    case 'tiers-set': {
      // node foxcoin.js tiers-set '50,30' 10
      const list = String(a || '').split(',')
        .map(x => x.trim()).filter(Boolean).map(Number);
      return out(setTiers({ tiers: list, enabled: list.length > 0,
                            rest: b === undefined ? null : Number(b) }));
    }
    case 'tiers-off':
      return out(setTiers({ enabled: false }));
    case 'tiers-test':
      return out({ nth: Number(a) || 1, coins: tierCoinsFor(Number(a) || 1) });
    case 'purchase-count':
      return out({ uid: a, count: purchaseCount(a) });
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
    'a(rw0.signup.coins===20 && rw0.join.coins===10 && rw0.mission.coins===3,"جوایز پیش‌فرض درست است");',
    '',
    '// ── پلکان خرید',
    'a(m.tierCoinsFor(1)===null,"بدون پلکان، نال برمی‌گردد");',
    'm.setTiers({enabled:true,tiers:[50,30],rest:10});',
    'a(m.tierCoinsFor(1)===50,"پله اول ۵۰");',
    'a(m.tierCoinsFor(2)===30,"پله دوم ۳۰");',
    'a(m.tierCoinsFor(3)===10,"بقیه ۱۰");',
    'a(m.tierCoinsFor(99)===10,"پله نودونهم هم ۱۰");',
    'a(m.purchaseCount("tu")===0,"کاربر تازه صفر خرید دارد");',
    'var t1=m.onPurchase("tu",100000);',
    'a(t1[0].amount===50 && t1[0].nth===1,"خرید اول ۵۰ کوین داد");',
    'a(t1.length===1,"در حالت پلکان، جایزه دوگانه داده نمی‌شود");',
    'var t2=m.onPurchase("tu",100000);',
    'a(t2[0].amount===30 && t2[0].nth===2,"خرید دوم ۳۰ کوین داد");',
    'var t3=m.onPurchase("tu",100000);',
    'a(t3[0].amount===10 && t3[0].nth===3,"خرید سوم ۱۰ کوین داد");',
    'a(m.getBalance("tu")===90,"جمع پلکان درست است: ۵۰+۳۰+۱۰");',
    'a(m.purchaseCount("tu")===3,"شمارش خرید درست است");',
    '// rest=null یعنی تکرار آخرین پله',
    'm.setTiers({tiers:[7,5],rest:null});',
    'a(m.tierCoinsFor(9)===5,"بدون rest، آخرین پله تکرار می‌شود");',
    '// خاموش‌کردن پلکان رفتار قدیمی را برمی‌گرداند',
    'm.setTiers({enabled:false});',
    'a(m.tierCoinsFor(1)===null,"خاموش یعنی نال");',
    'var old1=m.onPurchase("tv",100000);',
    'a(old1.length===2,"رفتار قدیمی: دو جایزه جدا");',
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
    // ── ماموریت‌ها
    'm.setMission({id:"q1",title:"اولین خرید",coins:25,kind:"purchase",need:1});',
    'm.setMission({id:"q2",title:"دستی",coins:10,kind:"manual"});',
    'a(m.listMissions().length===2,"دو ماموریت ثبت شد");',
    'a(m.listMissions()[0].id==="q2","مرتب‌سازی از کم‌جایزه به پرجایزه");',
    'a(m.getMission("q1").repeat==="once","تکرار پیش‌فرض یک‌بار است");',
    'a(m.getMission("q1").active===true,"ماموریت پیش‌فرض فعال است");',
    'a(m.missionProgress("u7",m.getMission("q2")).claimable,"دستی بلافاصله قابل دریافت است");',
    'a(!m.missionProgress("u7",m.getMission("q1")).claimable,"خرید نکرده پس قفل است");',
    'a(m.missionProgress("u7",m.getMission("q1")).need===1,"شرط درست خوانده شد");',
    'm.onPurchase("u7",{planId:"p1",price:1000});',
    'a(m.missionProgress("u7",m.getMission("q1")).claimable,"بعد از خرید باز شد");',
    'const cm=m.claimMissionById("u7","q1"); a(cm.ok&&cm.amount===25,"جایزه ماموریت داده شد");',
    'a(!m.claimMissionById("u7","q1").ok,"ماموریت یک‌بارمصرف دوباره نمی‌دهد");',
    'a(m.missionProgress("u7",m.getMission("q1")).claimed,"وضعیت دریافت‌شده ثبت شد");',
    'm.setMission({id:"q3",title:"همیشگی",coins:5,kind:"manual",repeat:"always"});',
    'a(m.claimMissionById("u7","q3").ok&&m.claimMissionById("u7","q3").ok,"همیشگی دوبار داد");',
    'm.setMission({id:"q2",title:"دستی",coins:10,kind:"manual",active:false});',
    'a(m.listMissions().length===2,"غیرفعال از فهرست کاربر حذف شد");',
    'a(m.listMissions(true).length===3,"ولی در فهرست ادمین هست");',
    'a(!m.claimMissionById("u7","q2").ok,"ماموریت غیرفعال جایزه نمی‌دهد");',
    'a(m.removeMission("q3")===true,"ماموریت حذف شد");',
    'a(m.getMission("q3")===null,"بعد از حذف پیدا نمی‌شود");',
    'a(!m.claimMissionById("u7","nope").ok,"ماموریت ناموجود رد شد");',
    'm.setMission({id:"q4",title:"موجودی",coins:5,kind:"balance",need:100000});',
    'a(m.missionProgress("u7",m.getMission("q4")).have===m.getBalance("u7"),"پیشرفت موجودی از تراز واقعی می‌آید");',
    // ── زیرمجموعه‌گیری
    'm.setSetting("dailyCap",0);',
    'a(m.setInviter("rb","ra").ok,"رابطه دعوت ثبت شد");',
    'a(!m.setInviter("rb","rc").ok,"دعوت‌کننده دوم رد شد");',
    'a(!m.setInviter("ra","ra").ok,"دعوت خود رد شد");',
    'a(!m.setInviter("ra","rb").ok,"حلقه دعوت رد شد");',
    'a(m.getInviter("rb")==="ra","دعوت‌کننده خوانده شد");',
    'const rp=m.onReferralPurchase("rb",100000);',
    'a(rp.inviter&&rp.inviter.amount===50,"دعوت‌کننده پله اول ۵۰ گرفت");',
    'a(rp.invitee&&rp.invitee.amount===15,"دعوت‌شده هدیه ۱۵ گرفت");',
    'a(m.getBalance("ra")===50,"موجودی دعوت‌کننده ثبت شد");',
    'a(m.getBalance("rb")===15,"موجودی دعوت‌شده ثبت شد");',
    'a(m.onReferralPurchase("rb",50000).inviter.amount===30,"خرید دوم ۳۰");',
    'a(m.onReferralPurchase("rb",50000).inviter.amount===20,"خرید سوم ۲۰");',
    'a(m.onReferralPurchase("rb",50000).inviter.amount===10,"خرید چهارم rest=۱۰");',
    'a(m.onReferralPurchase("rb",50000).invitee===null,"هدیه دعوت‌شده یک‌بار است");',
    'for(const u of ["rc","rd","re","rf"]){m.setInviter(u,"ra");m.onReferralPurchase(u,50000);}',
    'a(m.refStats("ra").buyers===5,"پنج زیرمجموعه خریدار شمرده شد");',
    'a(m.history("ra").filter(e=>e.meta&&e.meta.action==="milestone").length===1,"پله پنج‌نفره یک‌بار جایزه داد");',
    'a(m.refStats("ra").next.need===10,"پله بعدی ده نفر است");',
    'a(m.refStats("ra").remaining===5,"پنج نفر تا پله بعدی مانده");',
    'a(m.refLeaderboard(3)[0].uid==="ra","جدول برترین دعوت‌کننده‌ها درست است");',
    'm.setRefConfig({enabled:false});',
    'm.setInviter("rq","rp");',
    'a(m.onReferralPurchase("rq",50000).inviter===null,"خاموش یعنی بی‌جایزه");',
    'm.setRefConfig({enabled:true});',
    'm.setRefConfig({cap:10});',
    'm.setInviter("rz","ry"); m.onReferralPurchase("rz",50000);',
    'a(m.getBalance("ry")<=10,"سقف درآمد رفرال رعایت شد");',
    'm.setRefConfig({cap:0});',
    'm.setSetting("dailyCap",60);',
    'm.setInviter("rk2","rk"); m.onReferralPurchase("rk2",50000);',
    'm.setInviter("rk3","rk"); m.onReferralPurchase("rk3",50000);',
    'a(m.getBalance("rk")<=60,"سقف روزانه جلوی جایزه رفرال را هم می‌گیرد");',
    'm.setSetting("dailyCap",200);',
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
  CATS, normCat, isUnlimited,
  getPricing, getAllPricing, setPricing, resetPricing,
  priceFor, applyPricing, setManualPrice, clearManualPrice,
  PRICING_DEFAULTS,
  topHolders, recentUsers, ledgerRecent, userList,
  getRewards, getReward, setReward, setRewardConfig, resetRewardConfig, computeReward,
  addRewardAction, removeRewardAction, grantReward,
  onPurchase, rewardReferral, rewardRefPurchase,
  purchaseCount, getTiers, setTiers, tierCoinsFor,
  REF_DEFAULTS, getRefConfig, setRefConfig, refTierCoins,
  setInviter, getInviter, listInvitees, refStats,
  onReferralPurchase, totalRefEarned, refLeaderboard,
  listMissions, getMission, setMission, removeMission,
  missionProgress, missionClaimed, claimMissionById, MISSION_KINDS,
  claimDaily, dailyStatus, coinsForPurchase,
  getTexts, setText, resetText, TEXTS,
  history, stats, readLedger, DEFAULTS, EVENTS, REWARD_DEFAULTS,
};

if (require.main === module) cli();
