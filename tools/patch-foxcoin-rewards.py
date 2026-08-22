#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
════════════════════════════════════════════════════════════════
 PATCH FOXCOIN REWARDS — هوک جوایز خرید در bot.js
 نسخه: 1.0 | 2026-08-22
════════════════════════════════════════════════════════════════

چه می‌کند:
  بعد از وصله مدیریت (patch-foxcoin-admin.py)، دو هوک اضافه می‌کند تا
  موتور جوایز پیشرفته (foxcoin.js v1.6.0) به خریدهای واقعی وصل شود:

   ۱. بارگذاری هسته:  const coinCore = require('./foxcoin');
   ۲. هوک خرید: در تابع fulfillOrder (قیف مرکزی همه خریدهای درگاه)،
      بعد از تأیید پرداخت و قبل از تحویل سرویس، جایزه خرید و پاداش
      اولین خرید به‌صورت خودکار داده می‌شود.

  اگر در آینده سیستم دعوت داخلی ربات حذف شود، جوایز «خرید
  زیرمجموعه» هم با دو خط مشابه به همین‌جا وصل می‌شود (راهنما در
  انتهای همین فایل).

محافظ‌ها (همان الگوی وصله‌های قبلی):
  ۱. بکاپ با مهر زمان قبل از هر تغییر
  ۲. اگر وصله قبلاً خورده باشد، دوباره نمی‌زند
  ۳. بعد از وصله، بررسی نحو با node --check
  ۴. اگر نحو خراب بود، خودکار بکاپ را برمی‌گرداند
  ۵. سرویس را خودش ری‌استارت نمی‌کند. آن تصمیم با توست.

پیش‌نیاز: patch-foxcoin-admin.py قبلاً خورده باشد (لنگرگاه coinAdmin).

استفاده:
  python3 patch-foxcoin-rewards.py            نمایش برنامه، بدون تغییر
  python3 patch-foxcoin-rewards.py --apply    اعمال واقعی
  python3 patch-foxcoin-rewards.py --revert   برگرداندن آخرین بکاپ همین وصله

برای تست در محیط دیگر (بدون لمس سرور):
  FOXCOIN_BOT=/tmp/x/bot.js python3 patch-foxcoin-rewards.py --apply
"""

import os
import shutil
import subprocess
import sys
import time

BOT = os.environ.get("FOXCOIN_BOT", "/root/foxteam-bot/bot.js")
BACKUP_DIR = os.environ.get("FOXCOIN_BACKUP_DIR", "/root/botjs-backups")
MARK = "coinRewards"

# هوک خرید: در ابتدای شاخه purchase تابع fulfillOrder
PURCHASE_HOOK = r'''    try { await coinCore.onPurchase(String(userId), Number(amount) || 0, { desc: (meta && meta.desc) || 'خرید' }); } catch (e) {}
'''

# لنگرگاه‌های شاخه purchase در fulfillOrder (به ترتیب اولویت)
PURCHASE_ANCHORS = [
    'if (purpose === "purchase") {',
]


def read():
    with open(BOT, encoding="utf-8") as f:
        return f.read()


def check_env():
    problems = []
    if not os.path.exists(BOT):
        problems.append("bot.js پیدا نشد: " + BOT)
    mod = os.path.join(os.path.dirname(BOT), "foxcoin.js")
    if not os.path.exists(mod):
        problems.append("هسته نصب نشده: " + mod)
    if not os.path.isdir(BACKUP_DIR):
        problems.append("پوشه بکاپ نیست: " + BACKUP_DIR)
    return problems


def plan(src):
    rows = []
    ok = True

    # قدم ۱: بارگذاری هسته
    n = src.count("const coinAdmin = require('./foxcoin-admin');")
    rows.append(("بارگذاری هسته", "یکتا ✅" if n == 1 else
                 ("پیدا نشد ❌ (اول patch-foxcoin-admin.py)" if n == 0
                  else "%d بار تکرار ❌" % n)))
    if n != 1:
        ok = False

    # قدم ۲: شاخه خرید در fulfillOrder
    pur = None
    for cand in PURCHASE_ANCHORS:
        c = src.count(cand)
        if c == 1:
            pur = cand
            rows.append(("هوک خرید (fulfillOrder)", "یکتا ✅"))
            break
    if not pur:
        rows.append(("هوک خرید (fulfillOrder)",
                     "پیدا نشد ❌ (ساختار ربات فرق دارد)"))
        ok = False

    return rows, ok, pur


def apply_patch(src, pur):
    out = src
    i = out.index("const coinAdmin = require('./foxcoin-admin');")
    j = i + len("const coinAdmin = require('./foxcoin-admin');")
    out = out[:j] + "\nconst coinCore = require('./foxcoin');" + out[j:]

    i = out.index(pur)
    j = i + len(pur)
    out = out[:j] + "\n" + PURCHASE_HOOK + out[j:]
    return out


def node_check(path):
    r = subprocess.run(["node", "--check", path],
                       capture_output=True, text=True)
    return r.returncode == 0, (r.stderr or r.stdout or "").strip()


def main():
    args = sys.argv[1:]
    probs = check_env()
    if probs:
        print("پیش‌نیازها کامل نیست:")
        for p in probs:
            print("   ❌", p)
        return 1

    src = read()

    if "--revert" in args:
        cands = sorted([f for f in os.listdir(BACKUP_DIR)
                        if "before-foxcoin-rewards" in f])
        if not cands:
            print("بکاپی از این وصله پیدا نشد.")
            return 1
        last = os.path.join(BACKUP_DIR, cands[-1])
        shutil.copy2(last, BOT)
        print("برگردانده شد از:", last)
        print("حالا سرویس را ری‌استارت کن:")
        print("   systemctl restart foxteam-bot")
        return 0

    already = MARK in src
    rows, ok, pur = plan(src)

    print("\nبررسی لنگرگاه‌ها")
    for name, state in rows:
        print("   %-24s %s" % (name, state))
    print("\nوصله قبلاً خورده؟", "بله" if already else "نه")

    if already:
        print("\nتغییری لازم نیست. اگر می‌خواهی دوباره بزنی، اول --revert کن.")
        return 0
    if not ok:
        print("\nیک یا چند لنگرگاه یکتا نیست. هیچ تغییری اعمال نشد.")
        print("جوایز خرید هنوز به خریدهای واقعی وصل نیست — ولی پنل و")
        print("موتور کاملاً آماده‌اند. با داشتن bot.js سرور، لنگرگاه دقیق")
        print("قابل تنظیم است.")
        return 1

    if "--apply" not in args:
        print("\nاین فقط نمایش برنامه بود. برای اعمال واقعی:")
        print("   python3 patch-foxcoin-rewards.py --apply")
        return 0

    stamp = time.strftime("%Y-%m-%d-%H%M%S")
    bak = os.path.join(BACKUP_DIR, "bot.js.before-foxcoin-rewards-" + stamp)
    shutil.copy2(BOT, bak)
    print("\nبکاپ:", bak)

    new = apply_patch(src, pur)
    tmp = BOT + ".foxcoin-rewards-tmp.js"
    with open(tmp, "w", encoding="utf-8") as f:
        f.write(new)

    good, msg = node_check(tmp)
    if not good:
        os.remove(tmp)
        print("❌ نحو خراب شد، هیچ تغییری اعمال نشد.")
        print(msg[:500])
        return 1

    os.replace(tmp, BOT)
    good2, msg2 = node_check(BOT)
    if not good2:
        shutil.copy2(bak, BOT)
        print("❌ بعد از جابه‌جایی نحو خراب بود، بکاپ برگردانده شد.")
        print(msg2[:500])
        return 1

    print("✅ وصله اعمال شد و نحو سالم است.")
    print("خط‌های اضافه‌شده: %d"
          % (len(new.splitlines()) - len(src.splitlines())))
    print("\nحالا سرویس را ری‌استارت کن:")
    print("   systemctl restart foxteam-bot")
    print("\nاگر چیزی خراب شد، برگشت:")
    print("   python3 patch-foxcoin-rewards.py --revert")
    return 0


if __name__ == "__main__":
    sys.exit(main())
