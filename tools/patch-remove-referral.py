#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
════════════════════════════════════════════════════════════════
 REMOVE REFERRAL — حذف بخش زیرمجموعه‌گیری از منوی اصلی ربات
 نسخه: 1.0 | 2026-08-23
════════════════════════════════════════════════════════════════

چرا:
  سیستم دعوت داخلی ربات موجودی واقعی ندارد (همه‌چیز شارژ است) و
  فقط منو را شلوغ می‌کند. همه‌چیز روی محور فاکس کوین می‌چرخد.

چه می‌کند:
  فقط دکمه «دعوت دوستان» را از منوی اصلی برمی‌دارد. به منطق
  ربات دست نمی‌زند — یعنی اگر کسی لینک دعوت قدیمی داشته باشد،
  همچنان کار می‌کند و هیچ داده‌ای پاک نمی‌شود. صرفاً از دید
  کاربر پنهان می‌شود.

  این عمداً محافظه‌کارانه است: حذف منطق دعوت یعنی دست‌زدن به
  چند جای bot.js و ریسک خرابی. پنهان‌کردن دکمه همان نتیجه را
  می‌دهد با صفر ریسک.

محافظ‌ها:
  ۱. بکاپ با مهر زمان
  ۲. اگر قبلاً زده شده باشد، دوباره نمی‌زند
  ۳. node --check و برگشت خودکار در خطا
  ۴. سرویس را خودش ری‌استارت نمی‌کند

استفاده:
  python3 patch-remove-referral.py            نمایش برنامه
  python3 patch-remove-referral.py --apply    اعمال
  python3 patch-remove-referral.py --revert   برگرداندن
"""

import os
import re
import shutil
import subprocess
import sys
import time

BOT = os.environ.get("FOXCOIN_BOT", "/root/foxteam-bot/bot.js")
BACKUP_DIR = os.environ.get("FOXCOIN_BACKUP_DIR", "/root/botjs-backups")
MARK = "referralHidden"

# ردیف دکمه دعوت در منوی اصلی — چند شکل رایج
ROW_PATTERNS = [
    r'\n\s*\[\{[^\n]*callback_data:\s*"referral"[^\n]*\}\],',
    r"\n\s*\[\{[^\n]*callback_data:\s*'referral'[^\n]*\}\],",
]


def read():
    with open(BOT, encoding="utf-8") as f:
        return f.read()


def check_env():
    problems = []
    if not os.path.exists(BOT):
        problems.append("bot.js پیدا نشد: " + BOT)
    if not os.path.isdir(BACKUP_DIR):
        problems.append("پوشه بکاپ نیست: " + BACKUP_DIR)
    return problems


def find_rows(src):
    hits = []
    for pat in ROW_PATTERNS:
        for m in re.finditer(pat, src):
            hits.append((m.start(), m.end(), m.group(0).strip()))
    return hits


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
                        if "before-remove-referral" in f])
        if not cands:
            print("بکاپی از این وصله پیدا نشد.")
            return 1
        last = os.path.join(BACKUP_DIR, cands[-1])
        shutil.copy2(last, BOT)
        print("برگردانده شد از:", last)
        print("   systemctl restart foxteam-bot")
        return 0

    if MARK in src:
        print("\nقبلاً زده شده. برای دوباره‌زدن اول --revert کن.")
        return 0

    hits = find_rows(src)
    print("\nبررسی")
    if not hits:
        print("   ردیف دکمه دعوت پیدا نشد ❌")
        print("\nهیچ تغییری اعمال نشد. شاید قبلاً حذف شده،")
        print("یا شکل دکمه در ربات تو فرق دارد. این را بزن تا ببینم:")
        print("   grep -n referral " + BOT)
        return 1
    for _s, _e, txt in hits:
        print("   ردیف دعوت ✅  " + txt[:70])
    print("\n%d ردیف حذف می‌شود." % len(hits))

    if "--apply" not in args:
        print("\nاین فقط نمایش بود. برای اعمال:")
        print("   python3 patch-remove-referral.py --apply")
        return 0

    stamp = time.strftime("%Y-%m-%d-%H%M%S")
    bak = os.path.join(BACKUP_DIR, "bot.js.before-remove-referral-" + stamp)
    shutil.copy2(BOT, bak)
    print("\nبکاپ:", bak)

    out = src
    for pat in ROW_PATTERNS:
        out = re.sub(pat, "", out)
    out = out.replace("async function tg(config, method, body) {",
                      "// referralHidden\nasync function tg(config, method, body) {", 1)

    tmp = BOT + ".rmref-tmp.js"
    with open(tmp, "w", encoding="utf-8") as f:
        f.write(out)
    good, msg = node_check(tmp)
    if not good:
        os.remove(tmp)
        print("❌ نحو خراب شد، هیچ تغییری اعمال نشد.")
        print(msg[:400])
        return 1
    os.replace(tmp, BOT)
    good2, msg2 = node_check(BOT)
    if not good2:
        shutil.copy2(bak, BOT)
        print("❌ بعد از جابه‌جایی خراب بود، بکاپ برگشت.")
        return 1

    print("✅ دکمه دعوت از منوی اصلی برداشته شد.")
    print("ردیف‌های حذف‌شده: %d" % len(hits))
    print("\n   systemctl restart foxteam-bot")
    print("\nبرگشت: python3 patch-remove-referral.py --revert")
    return 0


if __name__ == "__main__":
    sys.exit(main())
