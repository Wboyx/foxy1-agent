#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
════════════════════════════════════════════════════════════════
 UPGRADE FOXCOIN — ارتقای هسته کوین به نسخه کامل (محصول + مدیریت)
 نسخه: 2.0 | 2026-08-22
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
    'a(m.getCoinPrices().p1===50,"فهرست قیمت‌ها درست است");',
'''

EXPORTS_BLOCK = r'''  getCoinPrices,
  listProducts, getProduct, setProduct, removeProduct,
  topHolders, recentUsers, ledgerRecent,
'''

# هر قدم: نشانه (اگر باشد یعنی قبلاً اضافه شده)، لنگرگاه، کجا، متن
STEPS = [
    {"name": "بخش محصول کوینی",
     "marker": "function listProducts(",
     "anchor": "// ───────────────────────── گزارش ─────────────────────────",
     "where": "before", "add": PRODUCTS_BLOCK + "\n"},
    {"name": "فهرست قیمت‌ها",
     "marker": "function getCoinPrices(",
     "anchor": "  return getCoinPrice(planId);\n}",
     "where": "after", "add": PRICES_BLOCK},
    {"name": "ابزار مدیریت",
     "marker": "function topHolders(",
     "anchor": "// ───────────────────────── ابزار خط فرمان ─────────────────────────",
     "where": "before", "add": ADMIN_BLOCK + "\n"},
    {"name": "دستورهای خط فرمان",
     "marker": "case 'products':",
     "anchor": "    case 'stats':",
     "where": "before", "add": CLI_BLOCK},
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
