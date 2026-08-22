#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
════════════════════════════════════════════════════════════════
 UPGRADE FOXCOIN — ارتقای هسته کوین به نسخه کامل (محصول + مدیریت)
 نسخه: 2.4 | 2026-08-22 | + متن‌های سفارشی + موتور جوایز پیشرفته
════════════════════════════════════════════════════════════════

چرا این اسکریپت:
  آپلود فایل کامل به مخزن چند بار ناموفق ماند. به‌جای جابه‌جاکردن
  هفده کیلوبایت، فقط تکه‌ای که کم است اضافه می‌شود.

چه می‌کند:
  ۱. بررسی می‌کند فایل همان نسخه قدیمی شناخته‌شده باشد
  ۲. بکاپ می‌گیرد
  ۳. بخش محصول کوینی، ابزار مدیریت (دارندگان برتر، کاربران اخیر،
     دفتر کل، فهرست قیمت‌ها) و دستورهای خط فرمان را اضافه می‌کند
  ۴. فهرست خروجی ماژول را کامل می‌کند
  ۵. نحو را چک می‌کند و اگر خراب بود برمی‌گرداند

تفاوت با نسخه ۱:
  هر بخش نشانه (marker) خودش را دارد. اگر نشانه باشد، آن بخش رد
  می‌شود. پس اسکریپت هم روی نسخه فاز ۱ و هم روی نسخه نیمه‌ارتقا
  درست کار می‌کند — چند بار اجرا هم ضرری ندارد.

استفاده:
  python3 upgrade-foxcoin.py            نمایش برنامه
  python3 upgrade-foxcoin.py --apply    اعمال

برای تست در محیط دیگر (بدون لمس سرور):
  FOXCOIN_TARGET=/tmp/x/foxcoin.js python3 upgrade-foxcoin.py --apply
"""

import os
import shutil
import subprocess
import sys
import time

TARGET = os.environ.get("FOXCOIN_TARGET", "/root/foxteam-bot/foxcoin.js")

# ── بخش محصول کوینی (دقیقاً همان کد نسخه مخزن) ─────────────────────
PRODUCTS_BLOCK = r'''
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
'''

# ── سوئیچ باز/بسته فروشگاه ───────────────────────────────────────
SHOP_BLOCK = r'''
  shopEnabled: true,          // فروشگاه کوینی باز/بسته
'''

# ── جوایز فعالیت (موتور پیشرفته) ─────────────────────────────────────
REWARDS_BLOCK = r'''
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

function setReward(key, coins) {
  return setRewardConfig(key, { mode: 'fixed', coins: Math.max(0, Math.round(Number(coins))) });
}

function resetRewardConfig(key) {
  key = String(key);
  const s = loadStore();
  if (s.rewards && key in s.rewards) {
    delete s.rewards[key];
    saveStore(s);
  }
  return getReward(key);
}

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

function removeRewardAction(key) {
  const s = loadStore();
  if (!s.rewards || !(key in s.rewards)) return false;
  if (key in REWARD_DEFAULTS) return false;
  delete s.rewards[key];
  saveStore(s);
  return true;
}

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

function onPurchase(uid, amountToman, meta) {
  return [
    Object.assign({ key: 'purchase' },
      grantReward(uid, 'purchase', { amount: amountToman, meta: meta })),
    Object.assign({ key: 'first_purchase' },
      grantReward(uid, 'first_purchase', { amount: amountToman, meta: meta })),
  ];
}

function rewardReferral(inviterUid, inviteeUid, amountToman, meta) {
  return grantReward(inviterUid, 'referral', {
    amount: amountToman,
    meta: Object.assign({ invitee: String(inviteeUid) }, meta || {}),
  });
}

function rewardRefPurchase(inviterUid, inviteeUid, amountToman, meta) {
  return grantReward(inviterUid, 'ref_purchase', {
    amount: amountToman,
    meta: Object.assign({ invitee: String(inviteeUid) }, meta || {}),
  });
}

function yesterdayKey(now) {
  return todayKey(now - 864e5);
}

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

function coinsForPurchase(tomanAmount) {
  return computeReward('purchase', { amount: tomanAmount });
}
'''

REWARDS_CLI_BLOCK = r'''    case 'rewards':
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
'''

REWARDS_TESTS_BLOCK = r'''    'const rw0=m.getRewards();',
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
    'm.setRewardConfig("purchase",{mode:"fixed",coins:10});',
    'm.setRewardConfig("ref_purchase",{minPurchase:100000});',
    'a(m.computeReward("ref_purchase",{amount:50000})===0,"حداقل مبلغ خرید رعایت شد");',
    'm.setRewardConfig("ref_purchase",{minPurchase:0});',
    'm.setReward("join",0);',
    'a(!m.grantReward("u1","join").ok,"جایزه صفر رد شد");',
    'm.setReward("join",10);',
    'a(m.grantReward("u1","join").ok,"جایزه جوین داده شد");',
    'a(!m.grantReward("u1","join").ok,"جایزه جوین فقط یک بار است");',
    'a(m.rewardReferral("u5","u9",100000).ok,"جایزه دعوت (اولین خرید دعوت‌شده) داده شد");',
    'a(!m.rewardReferral("u5","u9",100000).ok,"جایزه دعوت فقط یک بار است");',
    'const rr=m.rewardRefPurchase("u4","u9",50000);',
    'a(rr.ok && rr.event.amount===100,"خرید زیرمجموعه: ۵٪ با سقف ۱۰۰");',
    'const fp=m.onPurchase("u3",200000,{desc:"تست"});',
    'a(fp[0].ok && fp[0].event.amount===10,"جایزه خرید عادی داده شد");',
    'a(fp[1].ok && fp[1].event.amount===20,"پاداش اولین خرید داده شد");',
    'const fp2=m.onPurchase("u3",100000);',
    'a(!fp2[1].ok,"پاداش اولین خرید فقط یک بار است");',
    'a(m.claimDaily("u2",{now:Date.now()-1728e5}).ok,"جایزه روزانه (دو روز پیش) گرفته شد");',
    'const d2=m.claimDaily("u2",{now:Date.now()-864e5});',
    'a(d2.ok && d2.streak===2,"زنجیره روز دوم شد");',
    'const d3=m.claimDaily("u2");',
    'a(d3.ok && d3.streak===3 && d3.event.amount===6,"روز سوم با پاداش زنجیره ۱.۲ برابر شد");',
    'm.addRewardAction("visit",2);',
    'a(m.getRewards().visit.coins===2,"فعالیت سفارشی اضافه شد");',
    'a(m.removeRewardAction("visit")===true,"فعالیت سفارشی حذف شد");',
    'a(m.removeRewardAction("join")===false,"پیش‌فرض حذف نمی‌شود");',
'''

# ── متن‌های سفارشی ───────────────────────────────────────────────
TEXTS_BLOCK = r'''
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
'''

TEXTS_CLI_BLOCK = r'''    case 'texts':
      return out(getTexts());
    case 'text':
      return out({ key: a, value: b === undefined ? getTexts()[a]
                                                   : setText(a, [b, ...rest].join(' ')) });
    case 'text-reset':
      return out({ key: a, value: resetText(a) });
'''

TEXTS_TESTS_BLOCK = r'''    'a(m.getTexts().guide_what.includes("امتیاز داخلی"),"متن پیش‌فرض راهنما هست");',
    'a(m.getTexts().earn_join==="جوین کانال/گروه","عنوان بخش جوین پیش‌فرض است");',
    'm.setText("guide_what","متن سفارشی من");',
    'a(m.getTexts().guide_what==="متن سفارشی من","متن سفارشی ذخیره شد");',
    'a(m.setText("guide_what","")===m.TEXTS.guide_what,"خالی یعنی برگشت به پیش‌فرض");',
    'a(m.resetText("guide_what")===m.TEXTS.guide_what,"ریست صریح هم کار می‌کند");',
    'let badT=false; try{m.setText("guide_what","<b>بد</b>")}catch(e){badT=true} a(badT,"کاراکتر < رد شد");',
    'let badK=false; try{m.setText("nope","x")}catch(e){badK=true} a(badK,"کلید ناشناخته رد شد");',
'''

TEXTS_EXPORTS_BLOCK = r'''  getTexts, setText, resetText, TEXTS,
'''

REWARDS_EXPORTS_BLOCK = r'''  onPurchase, rewardReferral, rewardRefPurchase,
  claimDaily, dailyStatus, coinsForPurchase,
'''

# ── فهرست همه قیمت‌های ثبت‌شده ────────────────────────────────────
PRICES_BLOCK = r'''

/** همه قیمت‌های ثبت‌شده (شناسه پلن → کوین). برای پنل مدیریت. */
function getCoinPrices() {
  const s = loadStore();
  return Object.assign({}, s.coinPrices || {});
}
'''

# ── ابزار مدیریت (برای پنل مدیریت) ────────────────────────────────
ADMIN_BLOCK = r'''
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
'''

CLI_BLOCK = r'''    case 'products':
      return out(listProducts());
    case 'product-add': {
      const o = JSON.parse(a);
      return out(setProduct(o));
    }
    case 'product-del':
      return out({ removed: removeProduct(a) });
    case 'prices':
      return out(getCoinPrices());
    case 'top':
      return out(topHolders(Number(a) || 10));
    case 'recent':
      return out(recentUsers(Number(a) || 10));
    case 'ledger':
      return out(ledgerRecent(Number(a) || 20));
'''

TESTS_BLOCK = r'''    'm.setProduct({id:"x1",label:"سی گیگ",planId:"44trir5v",cat:"volume",gb:30,days:30,coins:100});',
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
    'a(m.ledgerRecent(3)[0].type==="spend","دفتر اخیر آخرین رویداد را اول می‌آورد");',
    'a(m.userList().length===1 && m.userList()[0].uid==="u1","فهرست همه کاربران درست است");',
    'a(m.getCoinPrices().p1===50,"فهرست قیمت‌ها درست است");',
    'a(m.getSettings().shopEnabled===true,"فروشگاه کوینی پیش‌فرض باز است");',
    'm.setSetting("shopEnabled",false);',
    'a(m.getSettings().shopEnabled===false,"فروشگاه بسته شد");',
    'm.setSetting("shopEnabled",true);',
'''

EXPORTS_BLOCK = r'''  getCoinPrices,
  listProducts, getProduct, setProduct, removeProduct,
  topHolders, recentUsers, ledgerRecent, userList,
  getRewards, getReward, setReward, setRewardConfig, resetRewardConfig, computeReward,
  addRewardAction, removeRewardAction, grantReward,
  onPurchase, rewardReferral, rewardRefPurchase,
  claimDaily, dailyStatus, coinsForPurchase,
'''

# هر قدم: نشانه (اگر باشد یعنی قبلاً اضافه شده)، لنگرگاه، کجا، متن
STEPS = [
    {"name": "سوئیچ باز/بسته فروشگاه",
     "marker": "shopEnabled",
     "anchor": "  dailyCap: 200,              // سقف کوین دریافتی هر کاربر در روز",
     "where": "after", "add": SHOP_BLOCK},
    {"name": "رویداد جوین",
     "marker": "                'join',",
     "anchor": "const EVENTS = ['signup', 'mission', 'purchase', 'referral',",
     "where": "after", "add": "\n                'join',"},
    {"name": "رویدادهای روزانه و اولین خرید",
     "marker": "                'daily',",
     "anchors": ["                'join',",
                 "const EVENTS = ['signup', 'mission', 'purchase', 'referral',"],
     "where": "after", "add": "\n                'daily',\n                'first_purchase',"},
    {"name": "بخش محصول کوینی",
     "marker": "function listProducts(",
     "anchor": "// ───────────────────────── گزارش ─────────────────────────",
     "where": "before", "add": PRODUCTS_BLOCK + "\n"},
    {"name": "فهرست قیمت‌ها",
     "marker": "function getCoinPrices(",
     "anchor": "  return getCoinPrice(planId);\n}",
     "where": "after", "add": PRICES_BLOCK},
    {"name": "جوایز فعالیت",
     "marker": "function getRewards(",
     "anchor": "// ───────────────────────── گزارش ─────────────────────────",
     "where": "before", "add": REWARDS_BLOCK + "\n"},
    {"name": "دستورهای جوایز",
     "marker": "case 'rewards':",
     "anchor": "    case 'price':",
     "where": "before", "add": REWARDS_CLI_BLOCK},
    {"name": "تست‌های جوایز",
     "marker": "جوایز پیش‌فرض درست است",
     "anchor": "    'a(m.history(\"u1\",1)[0].type===\"spend\",\"آخرین رویداد خرج است\");',",
     "where": "after", "add": "\n" + REWARDS_TESTS_BLOCK.rstrip("\n")},
    {"name": "ابزار مدیریت",
     "marker": "function topHolders(",
     "anchor": "// ───────────────────────── ابزار خط فرمان ─────────────────────────",
     "where": "before", "add": ADMIN_BLOCK + "\n"},
    {"name": "دستورهای خط فرمان",
     "marker": "case 'products':",
    "anchor": "    case 'stats':",
    "where": "before", "add": CLI_BLOCK},
    {"name": "دستور فهرست کاربران",
     "marker": "case 'users':",
     "anchor": "    case 'stats':",
     "where": "before",
     "add": "    case 'users':\n      return out(userList());\n"},
    {"name": "تست‌های محصول و مدیریت",
     "marker": "محصول کوینی ثبت شد",
     "anchor": "    'a(m.history(\"u1\",1)[0].type===\"spend\",\"آخرین رویداد خرج است\");',",
     "where": "after", "add": "\n" + TESTS_BLOCK.rstrip("\n")},
    {"name": "فهرست خروجی ماژول",
     "marker": "listProducts, getProduct, setProduct, removeProduct,",
     "anchor": "  claimMission, getCoinPrice, setCoinPrice, spendForPlan,",
     "where": "after", "add": "\n" + EXPORTS_BLOCK.rstrip("\n")},
    {"name": "متن‌های سفارشی",
     "marker": "function getTexts(",
     "anchor": "// ───────────────────────── گزارش ─────────────────────────",
     "where": "before", "add": TEXTS_BLOCK + "\n"},
    {"name": "دستورهای متن",
     "marker": "case 'texts':",
     "anchor": "    case 'stats':",
     "where": "before", "add": TEXTS_CLI_BLOCK},
    {"name": "تست‌های متن",
     "marker": "متن پیش‌فرض راهنما هست",
     "anchor": "    'a(m.history(\"u1\",1)[0].type===\"spend\",\"آخرین رویداد خرج است\");',",
     "where": "after", "add": "\n" + TEXTS_TESTS_BLOCK.rstrip("\n")},
    {"name": "خروجی متن‌ها",
     "marker": "getTexts, setText, resetText, TEXTS,",
     "anchor": "  claimMission, getCoinPrice, setCoinPrice, spendForPlan,",
     "where": "after", "add": "\n" + TEXTS_EXPORTS_BLOCK.rstrip("\n")},
    {"name": "خروجی موتور جوایز",
     "marker": "onPurchase, rewardReferral, rewardRefPurchase,",
     "anchors": ["  getTexts, setText, resetText, TEXTS,",
                 "  claimMission, getCoinPrice, setCoinPrice, spendForPlan,"],
     "where": "after", "add": "\n" + REWARDS_EXPORTS_BLOCK.rstrip("\n")},
]


def node_check(p):
    r = subprocess.run(["node", "--check", p], capture_output=True, text=True)
    return r.returncode == 0, (r.stderr or r.stdout or "").strip()


def main():
    if not os.path.exists(TARGET):
        print("فایل پیدا نشد:", TARGET)
        return 1
    src = open(TARGET, encoding="utf-8").read()

    print("\nبررسی قدم‌ها")
    ok = True
    todo = []
    for st in STEPS:
        if st["marker"] in src:
            print("   %-22s قبلاً هست ✅ (رد شد)" % st["name"])
            continue
        if "anchors" in st:
            found = None
            for cand in st["anchors"]:
                if src.count(cand) == 1:
                    found = cand
                    break
            if found is None:
                print("   %-22s %s" % (st["name"], "پیدا نشد ❌"))
                ok = False
            else:
                print("   %-22s %s" % (st["name"], "یکتا ✅ (%s)" % found.strip()[:40]))
                todo.append(st)
            continue
        n = src.count(st["anchor"])
        print("   %-22s %s" % (st["name"],
              "یکتا ✅" if n == 1 else ("پیدا نشد ❌" if n == 0 else "%d بار ❌" % n)))
        if n != 1:
            ok = False
        else:
            todo.append(st)
    if not ok:
        print("\nیک یا چند لنگرگاه درست نیست. هیچ تغییری اعمال نشد.")
        return 1
    if not todo:
        print("\nهمه‌چیز از قبل کامل است. کاری لازم نیست.")
        return 0

    if "--apply" not in sys.argv:
        print("\nاین فقط نمایش برنامه بود. برای اعمال واقعی:")
        print("   python3 upgrade-foxcoin.py --apply")
        return 0

    bak = TARGET + ".bak-" + time.strftime("%Y%m%d-%H%M%S")
    shutil.copy2(TARGET, bak)
    print("\nبکاپ:", bak)

    out = src
    for st in todo:
        if "anchors" in st:
            anchor = None
            for cand in st["anchors"]:
                if out.count(cand) == 1:
                    anchor = cand
                    break
            if anchor is None:
                print("   ⚠️ لنگرگاه «%s» ناپدید شد؛ رد شد." % st["name"])
                continue
        else:
            anchor = st["anchor"]
        i = out.index(anchor)
        if st["where"] == "before":
            out = out[:i] + st["add"] + out[i:]
        else:
            j = i + len(anchor)
            out = out[:j] + st["add"] + out[j:]

    tmp = TARGET + ".up-tmp.js"
    open(tmp, "w", encoding="utf-8").write(out)
    good, msg = node_check(tmp)
    if not good:
        os.remove(tmp)
        print("❌ نحو خراب شد. تغییری اعمال نشد.")
        print(msg[:400])
        return 1
    os.replace(tmp, TARGET)
    print("✅ ارتقا انجام شد.")
    print("حجم تازه: %d بایت" % os.path.getsize(TARGET))
    print("\nحالا خودآزمون بگیر:")
    print("   node foxcoin.js selftest | tail -3")
    print("   node foxcoin-ui.js | tail -3")
    print("   node foxcoin-admin.js | tail -3")
    print("\nاگر خراب شد، برگشت:")
    print("   cp -a " + bak + " " + TARGET)
    return 0


if __name__ == "__main__":
    sys.exit(main())
