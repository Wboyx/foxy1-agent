#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
════════════════════════════════════════════════════════════════
 UPGRADE FOXCOIN — ارتقای هسته کوین به نسخه کامل (محصول + مدیریت)
 نسخه: 2.2 | 2026-08-22
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

# ── جوایز فعالیت ─────────────────────────────────────────────────
REWARDS_BLOCK = r'''
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
'''

REWARDS_CLI_BLOCK = r'''    case 'rewards':
      return out(getRewards());
    case 'reward':
      return out({ key: a, coins: b === undefined ? getRewards()[a]
                                                  : setReward(a, Number(b)) });
    case 'reward-add':
      return out({ key: a, coins: addRewardAction(a, Number(b)) });
    case 'reward-del':
      return out({ removed: removeRewardAction(a) });
'''

REWARDS_TESTS_BLOCK = r'''    'const rw0=m.getRewards();',
    'a(rw0.signup===5 && rw0.join===10 && rw0.mission===3,"جوایز پیش‌فرض درست است");',
    'm.setReward("join",0);',
    'a(!m.grantReward("u1","join").ok,"جایزه صفر رد شد");',
    'm.setReward("join",10);',
    'a(m.grantReward("u1","join").ok,"جایزه جوین داده شد");',
    'a(!m.grantReward("u1","join").ok,"جایزه جوین فقط یک بار است");',
    'm.addRewardAction("daily",7);',
    'a(m.getRewards().daily===7,"فعالیت سفارشی اضافه شد");',
    'a(m.removeRewardAction("daily")===true,"فعالیت سفارشی حذف شد");',
    'a(m.removeRewardAction("join")===false,"پیش‌فرض حذف نمی‌شود");',
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
  getRewards, setReward, addRewardAction, removeRewardAction, grantReward,
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
        i = out.index(st["anchor"])
        if st["where"] == "before":
            out = out[:i] + st["add"] + out[i:]
        else:
            j = i + len(st["anchor"])
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
