#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
════════════════════════════════════════════════════════════════
 PATCH FOXCOIN ADMIN — اتصال پنل مدیریت فاکس کوین به ربات
 نسخه: 1.0 | 2026-08-22
════════════════════════════════════════════════════════════════

چه می‌کند:
  بعد از وصله فاکس کوین (patch-foxcoin.py)، سه چیز اضافه می‌کند:
   ۱. بارگذاری ماژول foxcoin-admin
   ۲. دکمه «مدیریت فاکس کوین» در منوی اصلی
   ۳. شرط مسیریابی admin در دستگیره callback

  دکمه برای همه دیده می‌شود ولی درِ واقعی در خود ماژول است:
  هر کس ادمین نباشد فقط پیام «فقط برای مدیریت» می‌گیرد.
  (مخفی‌کردن دکمه از دید غیرمدیرها، اگر خواستی، کار bot.js است.)

محافظ‌ها (همان الگوی patch-foxcoin.py):
  ۱. بکاپ با مهر زمان قبل از هر تغییر
  ۲. اگر وصله قبلاً خورده باشد، دوباره نمی‌زند
  ۳. بعد از وصله، بررسی نحو با node --check
  ۴. اگر نحو خراب بود، خودکار بکاپ را برمی‌گرداند
  ۵. سرویس را خودش ری‌استارت نمی‌کند. آن تصمیم با توست.

پیش‌نیاز: وصله فاکس کوین (patch-foxcoin.py) قبلاً خورده باشد.
           لنگرگاه‌های این وصله همان خط‌های اضافه‌شده توسط آن هستند.

استفاده:
  python3 patch-foxcoin-admin.py            نمایش برنامه، بدون تغییر
  python3 patch-foxcoin-admin.py --apply    اعمال واقعی
  python3 patch-foxcoin-admin.py --revert   برگرداندن آخرین بکاپ همین وصله

برای تست در محیط دیگر (بدون لمس سرور):
  FOXCOIN_BOT=/tmp/x/bot.js python3 patch-foxcoin-admin.py --apply
"""

import os
import re
import shutil
import subprocess
import sys
import time

BOT = os.environ.get("FOXCOIN_BOT", "/root/foxteam-bot/bot.js")
BACKUP_DIR = os.environ.get("FOXCOIN_BACKUP_DIR", "/root/botjs-backups")
MARK = "coinAdmin"

# لنگرگاه، متن افزودنی، و اینکه قبل بیاید یا بعد
STEPS = [
    {
        "name": "بارگذاری ماژول مدیریت",
        "anchor": "const coinUI = require('./foxcoin-ui');",
        "where": "after",
        "add": "\nconst coinAdmin = require('./foxcoin-admin');",
    },
    {
        "name": "دکمه مدیریت در منوی اصلی",
        "anchor": '[{ text: coinUI.MENU_BUTTON.text, callback_data: "coin" }],',
        "where": "after",
        "add": '\n    [{ text: coinAdmin.T.title, callback_data: "admin" }],',
    },
    {
        "name": "شرط مدیریت در مسیریاب",
        "anchor": "if (handledByCoin) return;",
        "where": "after",
        "add": (
            '\n    if (data === "admin" || data.startsWith("admin:")) {\n'
            '      const handledByAdmin = await coinAdmin.route({\n'
            '        config: config, chatId: chatId,\n'
            '        messageId: cb.message.message_id, uid: userId,\n'
            '        data: data, botUsername: (config.botUsername || ""),\n'
            '        editTelegram: editTelegram });\n'
            '      if (handledByAdmin) return;\n'
            '    }'
        ),
    },
]


def read():
    with open(BOT, encoding="utf-8") as f:
        return f.read()


def check_env():
    problems = []
    if not os.path.exists(BOT):
        problems.append("bot.js پیدا نشد: " + BOT)
    mod = os.path.join(os.path.dirname(BOT), "foxcoin-admin.js")
    if not os.path.exists(mod):
        problems.append("ماژول نصب نشده: " + mod)
    if not os.path.isdir(BACKUP_DIR):
        problems.append("پوشه بکاپ نیست: " + BACKUP_DIR)
    return problems


def plan(src):
    rows = []
    ok = True
    for st in STEPS:
        n = src.count(st["anchor"])
        state = "یکتا ✅" if n == 1 else ("پیدا نشد ❌" if n == 0
                                          else "%d بار تکرار ❌" % n)
        if n != 1:
            ok = False
        rows.append((st["name"], state))
    return rows, ok


def apply_patch(src):
    out = src
    for st in STEPS:
        a = st["anchor"]
        i = out.index(a)
        if st["where"] == "before":
            out = out[:i] + st["add"] + out[i:]
        else:
            j = i + len(a)
            out = out[:j] + st["add"] + out[j:]
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
                        if "before-foxcoin-admin" in f])
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
    rows, ok = plan(src)

    print("\nبررسی لنگرگاه‌ها")
    for name, state in rows:
        print("   %-22s %s" % (name, state))
    print("\nوصله قبلاً خورده؟", "بله" if already else "نه")

    if already:
        print("\nتغییری لازم نیست. اگر می‌خواهی دوباره بزنی، اول --revert کن.")
        return 0
    if not ok:
        print("\nیک یا چند لنگرگاه یکتا نیست. هیچ تغییری اعمال نشد.")
        print("این یعنی کد ربات با آنچه انتظار داشتیم فرق دارد.")
        print("نکته: اول باید وصله فاکس کوین (patch-foxcoin.py) خورده باشد.")
        return 1

    if "--apply" not in args:
        print("\nاین فقط نمایش برنامه بود. برای اعمال واقعی:")
        print("   python3 patch-foxcoin-admin.py --apply")
        return 0

    stamp = time.strftime("%Y-%m-%d-%H%M%S")
    bak = os.path.join(BACKUP_DIR, "bot.js.before-foxcoin-admin-" + stamp)
    shutil.copy2(BOT, bak)
    print("\nبکاپ:", bak)

    new = apply_patch(src)
    tmp = BOT + ".foxcoin-admin-tmp.js"
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
    print("   python3 patch-foxcoin-admin.py --revert")
    return 0


if __name__ == "__main__":
    sys.exit(main())
