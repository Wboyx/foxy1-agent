#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
════════════════════════════════════════════════════════════════
 UPGRADE FOXCOIN — ارتقای هسته کوین به نسخه محصول‌دار
 نسخه: 1.0 | 2026-08-21
════════════════════════════════════════════════════════════════

چرا این اسکریپت:
  آپلود فایل کامل به مخزن چند بار ناموفق ماند. به‌جای جابه‌جاکردن
  هفده کیلوبایت، فقط تکه‌ای که کم است اضافه می‌شود.

چه می‌کند:
  ۱. بررسی می‌کند فایل همان نسخه قدیمی شناخته‌شده باشد
  ۲. بکاپ می‌گیرد
  ۳. بخش محصول کوینی و دستورهای آن را اضافه می‌کند
  ۴. فهرست خروجی ماژول را کامل می‌کند
  ۵. نحو را چک می‌کند و اگر خراب بود برمی‌گرداند

استفاده:
  python3 upgrade-foxcoin.py            نمایش برنامه
  python3 upgrade-foxcoin.py --apply    اعمال
"""

import os
import shutil
import subprocess
import sys
import time

TARGET = "/root/foxteam-bot/foxcoin.js"

PRODUCTS_BLOCK = '''
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

CLI_BLOCK = '''    case 'products':
      return out(listProducts());
    case 'product-add': {
      const o = JSON.parse(a);
      return out(setProduct(o));
    }
    case 'product-del':
      return out({ removed: removeProduct(a) });
'''

TESTS_BLOCK = """    'm.setProduct({id:\\"x1\\",label:\\"سی گیگ\\",planId:\\"44trir5v\\",cat:\\"volume\\",gb:30,days:30,coins:100});',
    'a(m.listProducts().length===1,\\"محصول کوینی ثبت شد\\");',
    'a(m.getProduct(\\"x1\\").coins===100,\\"قیمت محصول درست است\\");',
    'm.setProduct({id:\\"x2\\",label:\\"ارزان\\",planId:\\"cm1698h4\\",cat:\\"volume\\",gb:10,days:30,coins:40});',
    'a(m.listProducts()[0].id===\\"x2\\",\\"محصولات از ارزان به گران مرتب شدند\\");',
    'let bad=false; try{m.setProduct({id:\\"x3\\"})}catch(e){bad=true} a(bad,\\"محصول ناقص رد شد\\");',
    'a(m.removeProduct(\\"x1\\")===true,\\"محصول حذف شد\\");',
"""

STEPS = [
    {"name": "بخش محصول کوینی",
     "anchor": "// ───────────────────────── گزارش ─────────────────────────",
     "where": "before", "add": PRODUCTS_BLOCK + "\n"},
    {"name": "دستورهای خط فرمان",
     "anchor": "    case 'stats':\n      return out(stats());",
     "where": "before", "add": CLI_BLOCK},
    {"name": "تست‌های محصول",
     "anchor": "    'a(m.history(\"u1\",1)[0].type===\"spend\",\"آخرین رویداد خرج است\");',",
     "where": "after", "add": "\n" + TESTS_BLOCK.rstrip("\n")},
    {"name": "فهرست خروجی ماژول",
     "anchor": "  claimMission, getCoinPrice, setCoinPrice, spendForPlan,",
     "where": "after",
     "add": "\n  listProducts, getProduct, setProduct, removeProduct,"},
]


def node_check(p):
    r = subprocess.run(["node", "--check", p], capture_output=True, text=True)
    return r.returncode == 0, (r.stderr or r.stdout or "").strip()


def main():
    if not os.path.exists(TARGET):
        print("فایل پیدا نشد:", TARGET)
        return 1
    src = open(TARGET, encoding="utf-8").read()

    if "listProducts" in src:
        print("این فایل از قبل نسخه محصول‌دار است. کاری لازم نیست.")
        return 0

    print("\nبررسی لنگرگاه‌ها")
    ok = True
    for st in STEPS:
        n = src.count(st["anchor"])
        print("   %-22s %s" % (st["name"],
              "یکتا ✅" if n == 1 else ("پیدا نشد ❌" if n == 0 else "%d بار ❌" % n)))
        if n != 1:
            ok = False
    if not ok:
        print("\nلنگرگاه‌ها درست نیستند. هیچ تغییری اعمال نشد.")
        return 1

    if "--apply" not in sys.argv:
        print("\nبرای اعمال واقعی:")
        print("   python3 upgrade-foxcoin.py --apply")
        return 0

    bak = TARGET + ".bak-" + time.strftime("%Y%m%d-%H%M%S")
    shutil.copy2(TARGET, bak)
    print("\nبکاپ:", bak)

    out = src
    for st in STEPS:
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
    print("\nاگر خراب شد، برگشت:")
    print("   cp -a " + bak + " " + TARGET)
    return 0


if __name__ == "__main__":
    sys.exit(main())
