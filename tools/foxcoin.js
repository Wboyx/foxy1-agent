'use strict';
/**
 * ════════════════════════════════════════════════════════════════
 *  FOX COIN — هسته اقتصاد کوین
 *  نسخه: 1.0.0 | 2026-08-21 | فاز ۱
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
 *  این فاز رابط کاربری ندارد. فقط هسته و ابزار خط فرمان.
 */

const fs = require('fs');
const path = require('path');

const DATA_DIR = process.env.FOXCOIN_DATA_DIR ||
  path.join(__dirname, 'data');
const STORE = path.join(DATA_DIR, 'coin-store.json');
const LEDGER = path.join(DATA_DIR, 'coin-ledger.jsonl');

const EVENTS = ['signup', 'mission', 'purchase', 'referral',
                'spend', 'admin', 'reset'];

const DEFAULTS = {
  enabled: true,
  purchaseMode: 'fixed',      // fixed یا relative
  purchaseFixed: 10,          // در حالت ثابت، کوین هر خرید
  purchasePerAmount: 10000,   // در حالت نسبی، هر چند تومان یک کوین
  referralReward: 10,         // کوین بابت خرید زیرمجموعه
  signupReward: 5,            // جایزه ثبت‌نام
  dailyCap: 200,              // سقف کوین دریافتی هر کاربر در روز
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

/** قیمت کوینی یک محصول. اگر تعریف نشده باشد، یعنی با کوین فروخته نمی‌شود. */
function getCoinPrice(planId) {
  const s = loadStore();
  const v = (s.coinPrices || {})[String(planId)];
  return (v === undefined || v === null) ? null : Number(v);
}

function setCoinPrice(planId, coins) {
  const s = loadStore();
  s.coinPrices = s.coinPrices || {};
  if (coins === null) delete s.coinPrices[String(planId)];
  else s.coinPrices[String(planId)] = Math.max(0, Math.round(Number(coins)));
  saveStore(s);
  return getCoinPrice(planId);
}

/** خرج‌کردن برای یک محصول. صدور اشتراک کار ربات است، نه این ماژول. */
function spendForPlan(uid, planId) {
  const price = getCoinPrice(planId);
  if (price === null) return { ok: false, reason: 'این محصول با کوین فروخته نمی‌شود' };
  return addEvent(uid, 'spend', -price, { plan: planId });
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
    case 'set':
      return out(setSetting(a, isNaN(Number(b)) ? b : Number(b)));
    case 'price':
      return out({ plan: a, coins: b === undefined ? getCoinPrice(a)
                                                   : setCoinPrice(a, Number(b)) });
    case 'stats':
      return out(stats());
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
    'a(m.spendForPlan("u1","p1").ok,"خرید کوینی انجام شد");',
    'const s=m.stats();',
    'a(s.events===4,"دفتر دقیقاً چهار رویداد موفق دارد");',
    'a(s.issued===208,"جمع صادرشده ۲۰۸ است");',
    'a(s.spent===50,"جمع خرج‌شده ۵۰ است");',
    'a(s.circulating===158,"کوین در گردش ۱۵۸ است");',
    'a(s.holders===1,"یک دارنده ثبت شده");',
    'a(m.history("u1",99).length===4,"تاریخچه کامل برگشت");',
    'a(m.history("u1",2).length===2,"تاریخچه محدود شد");',
    'a(m.history("u1",1)[0].type==="spend","آخرین رویداد خرج است");',
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
  claimMission, getCoinPrice, setCoinPrice, spendForPlan,
  history, stats, readLedger, DEFAULTS, EVENTS,
};

if (require.main === module) cli();
