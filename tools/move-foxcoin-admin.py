#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
════════════════════════════════════════════════════════════════
 MOVE FOXCOIN ADMIN — انتقال دکمه مدیریت فاکس کوین به منوی مدیریت ارشد
 نسخه: 1.0 | 2026-08-22
════════════════════════════════════════════════════════════════

چه می‌کند:
  ۱. دکمه «⚙️ مدیریت فاکس کوین» را از منوی اصلی ربات برمی‌دارد
  ۲. همان دکمه را به منوی «مدیریت ارشد» اضافه می‌کند؛ منوی ارشد
     در ربات با callback_data="admin_settings" باز می‌شود و فقط
     ادمین‌های ربات به آن دسترسی دارند.

چرا:
  دکمه مدیریت نباید در منوی اصلی (که کاربر عادی می‌بیند) باشد.
  درِ واقعی پنل همچنان در خود ماژول foxcoin-admin است
  (FOXCOIN_ADMINS یا config) — این فقط جای دکمه را عوض می‌کند.

جای درج:
  بعد از ردیف «راهنمای اتصال گروه» (help_group) و قبل از ردیف
  بازگشت در همان منو. اگر آن ردیف با شکل دیگری بود، داخل بلاک
  admin_settings قبل از ردیف «بازگشت» درج می‌کند.

پیش‌نیاز:
  وصله‌های قبلی خورده باشند (patch-foxcoin.py و patch-foxcoin-admin.py).

محافظ‌ها:
  ۱. بکاپ با مهر زمان قبل از هر تغییر
  ۲. لنگرگاه‌ها شمرده می‌شوند؛ اگر یکتا نبودند یا پیدا نشدند،
     هیچ تغییری اعمال نمی‌شود
  ۳. node --check بعد از تغییر؛ اگر خراب بود، بکاپ برمی‌گردد
  ۴. اگر دکمه از قبل منتقل شده باشد، تشخیص می‌دهد و کاری نمی‌کند

استفاده:
  python3 move-foxcoin-admin.py            نمایش برنامه
  python3 move-foxcoin-admin.py --apply    اعمال واقعی
  python3 move-foxcoin-admin.py --revert   برگرداندن آخرین بکاپ همین اسکریپت
"""

import os
import re
import shutil
import subprocess
import sys
import time

BOT = os.environ.get("FOXCOIN_BOT", "/root/foxteam-bot/bot.js")
BACKUP_DIR = os.environ.get("FOXCOIN_BACKUP_DIR", "/root/botjs-backups")

# دکمه‌ای که patch-foxcoin-admin.py به منوی اصلی اضافه کرده
MAIN_BTN = '[{ text: coinAdmin.T.title, callback_data: "admin" }],'

# ردیف‌هایی که منوی مدیریت ارشد با آن‌ها شناخته می‌شود
INSERT_AFTER_CANDIDATES = [
    '[{ text: "⚙️ راهنمای اتصال گروه", callback_data: "help_group" }],',
    '[{ text: "راهنمای اتصال گروه", callback_data: "help_group" }],',
]

ADMIN_BLOCK_ANCHOR = 'if (data === "admin_settings") {'
BACK_ROW = '{ text: "🏠 بازگشت", callback_data: "back_main" }'

NEW_ROW = '        [{ text: coinAdmin.T.title, callback_data: "admin" }],'

MARK = "coinAdmin"  # برای تشخیص «وصله فاکس کوین نصب است»


def read():
    with open(BOT, encoding="utf-8") as f:
        return f.read()


def write(path, text):
    with open(path, "w", encoding="utf-8") as f:
        f.write(text)


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


def find_insert_point(src):
    """محل درج را پیدا می‌کند: (موقعیت، شرح). یا None اگر مطمئن نیست."""
    for c in INSERT_AFTER_CANDIDATES:
        n = src.count(c)
        if n == 1:
            return src.index(c) + len(c), "بعد از ردیف «راهنمای اتصال گروه»"
    # هر ردیف دکمه‌ای که به help_group وصل است (شکل متفاوت ایموجی)
    m = re.search(r'\{ text: "[^"]*", callback_data: "help_group" \},?', src)
    if m and len(re.findall(r'callback_data: "help_group"', src)) == 1:
        return m.end(), "بعد از ردیف «help_group» (شکل دیگر)"
    # داخل بلاک admin_settings، قبل از ردیف بازگشت
    b = src.find(ADMIN_BLOCK_ANCHOR)
    if b != -1:
        seg = src[b:b + 8000]
        m2 = re.search(re.escape(BACK_ROW), seg)
        if m2:
            return b + m2.start(), "قبل از ردیف «بازگشت» در منوی مدیریت ارشد"
    return None, ""


def already_moved(src):
    """اگر داخل بلاک admin_settings دکمه فاکس کوین باشد، منتقل شده است."""
    b = src.find(ADMIN_BLOCK_ANCHOR)
    if b == -1:
        return False
    return "coinAdmin" in src[b:b + 8000]


def node_check(path):
    r = subprocess.run(["node", "--check", path],
                       capture_output=True, text=True)
    return r.returncode == 0, (r.stderr or r.stdout or "").strip()


def remove_main_button(src):
    """ردیف دکمه را از منوی اصلی برمی‌دارد. ۰ یا ۱ بار باید باشد."""
    n = src.count(MAIN_BTN)
    if n == 0:
        return src, 0
    if n > 1:
        raise RuntimeError("دکمه مدیریت بیش از یک بار در فایل است: %d" % n)
    pat = re.compile(r'^[ \t]*' + re.escape(MAIN_BTN) + r'[ \t]*\r?\n',
                     re.MULTILINE)
    out, count = pat.subn("", src, count=1)
    return out, count


def insert_admin_row(src):
    pos, desc = find_insert_point(src)
    if pos is None:
        raise RuntimeError("محل درج در منوی مدیریت ارشد پیدا نشد")
    if desc.startswith("قبل از"):
        out = src[:pos] + NEW_ROW + "\n" + src[pos:]
    else:
        out = src[:pos] + "\n" + NEW_ROW + src[pos:]
    return out, desc


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
                        if "before-move-foxcoin" in f])
        if not cands:
            print("بکاپی از این انتقال پیدا نشد.")
            return 1
        last = os.path.join(BACKUP_DIR, cands[-1])
        shutil.copy2(last, BOT)
        print("برگردانده شد از:", last)
        print("حالا سرویس را ری‌استارت کن:")
        print("   systemctl restart foxteam-bot")
        return 0

    print("\nبررسی وضعیت")
    print("   دکمه در منوی اصلی:", "هست ✅" if MAIN_BTN in src else "نیست ✅ (قبلاً برداشته شده)")

    if already_moved(src):
        print("   در منوی مدیریت ارشد: هست ✅")
        print("\nدکمه از قبل منتقل شده است. تغییری لازم نیست.")
        return 0

    pos, desc = find_insert_point(src)
    print("   محل درج:", desc if pos is not None else "پیدا نشد ❌")
    if pos is None:
        print("\nمنوی مدیریت ارشد (admin_settings) با لنگرگاه‌های شناخته‌شده پیدا نشد.")
        print("هیچ تغییری اعمال نشد. اول ببین bot.js واقعاً همین ساختار را دارد:")
        print("   grep -n 'admin_settings\\|help_group\\|راهنمای اتصال گروه' " + BOT)
        return 1

    if "--apply" not in args:
        print("\nاین فقط نمایش برنامه بود. برای اعمال واقعی:")
        print("   python3 move-foxcoin-admin.py --apply")
        return 0

    stamp = time.strftime("%Y-%m-%d-%H%M%S")
    bak = os.path.join(BACKUP_DIR, "bot.js.before-move-foxcoin-" + stamp)
    shutil.copy2(BOT, bak)
    print("\nبکاپ:", bak)

    try:
        out, removed = remove_main_button(src)
        out, desc2 = insert_admin_row(out)
    except RuntimeError as e:
        print("❌", e)
        print("   هیچ تغییری اعمال نشد.")
        return 1

    tmp = BOT + ".move-foxcoin-tmp.js"
    write(tmp, out)
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

    print("✅ انتقال انجام شد و نحو سالم است.")
    print("   دکمه از منوی اصلی حذف شد:", "بله" if removed else "قبلاً حذف بود")
    print("   دکمه به منوی مدیریت ارشد اضافه شد:", desc2)
    print("\nحالا سرویس را ری‌استارت کن:")
    print("   systemctl restart foxteam-bot")
    print("\nاگر چیزی خراب شد، برگشت:")
    print("   python3 move-foxcoin-admin.py --revert")
    return 0


if __name__ == "__main__":
    sys.exit(main())
