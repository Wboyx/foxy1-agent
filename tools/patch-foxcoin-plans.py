#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
════════════════════════════════════════════════════════════════
 PATCH FOXCOIN PLANS — تزریق موتور پلن و سرویس‌سازی به فاکس کوین
 نسخه: 1.0 | 2026-08-23
════════════════════════════════════════════════════════════════

مشکلی که حل می‌کند (حلقه گم‌شده فاز ۳):

  ماژول‌های فاکس کوین دو تابع از ربات می‌خواهند:

      ctx.getPlans(env, cat)                    → لیست پلن‌ها
      ctx.deliverService(env, config, uid, opt) → ساخت سرویس

  ولی `patch-foxcoin-admin.py` و `patch-foxcoin.py` هنگام ساختن ctx
  فقط این‌ها را می‌گذاشتند:

      config, chatId, messageId, uid, data, botUsername, editTelegram

  نه `env`، نه `getPlans`، نه `deliverService`. نتیجه:

   ۱. پنل → «➕ محصول جدید» → انتخاب دسته → همیشه بن‌بست:
      «❌ ربات لیست پلن‌ها را در اختیار پنل نمی‌گذارد»
      یعنی هیچ محصولی از داخل ربات ساخته نمی‌شد.

   ۲. کاربر → فروشگاه → تأیید خرید → `ctx.getPlans is not a function`
      استثنا می‌خورد و خرید بی‌صدا می‌مرد.

  این وصله هر دو ctx را کامل می‌کند.

محافظ‌ها (همان الگوی وصله‌های قبلی):
  ۱. بکاپ با مهر زمان قبل از هر تغییر
  ۲. اگر وصله قبلاً خورده باشد، دوباره نمی‌زند
  ۳. بعد از وصله، بررسی نحو با node --check
  ۴. اگر نحو خراب بود، خودکار بکاپ را برمی‌گرداند
  ۵. سرویس را خودش ری‌استارت نمی‌کند. آن تصمیم با توست.

پیش‌نیاز: patch-foxcoin.py و patch-foxcoin-admin.py خورده باشند.

استفاده:
  python3 patch-foxcoin-plans.py            نمایش برنامه + توابع کشف‌شده
  python3 patch-foxcoin-plans.py --apply    اعمال واقعی
  python3 patch-foxcoin-plans.py --revert   برگرداندن آخرین بکاپ همین وصله

اگر تشخیص خودکار نام توابع را اشتباه گرفت، دستی بده:
  FOXCOIN_GETPLANS=loadPlans FOXCOIN_DELIVER=createService \\
      python3 patch-foxcoin-plans.py --apply

برای تست بدون لمس سرور:
  FOXCOIN_BOT=/tmp/x/bot.js python3 patch-foxcoin-plans.py --apply
"""

import os
import re
import shutil
import subprocess
import sys
import time

BOT = os.environ.get("FOXCOIN_BOT", "/root/foxteam-bot/bot.js")
BACKUP_DIR = os.environ.get("FOXCOIN_BACKUP_DIR", "/root/botjs-backups")
MARK = "coinPlansWired"

# دو ctx ای که وصله‌های قبلی ساخته‌اند
CTX_ANCHORS = [
    ("coinUI", "const handledByCoin = await coinUI.route({"),
    ("coinAdmin", "const handledByAdmin = await coinAdmin.route({"),
]

# نامزدهای نام تابع، به ترتیب اولویت. اولین موجود در bot.js برنده است.
GETPLANS_CANDIDATES = [
    "getPlans", "loadPlans", "fetchPlans", "listPlans",
    "readPlans", "plansFor", "getPlansByCat", "getPlanList",
]
DELIVER_CANDIDATES = [
    "deliverService", "createService", "issueService", "makeService",
    "buildService", "provisionService", "createClient", "addClient",
]

# الگوی اعلان تابع در جاوااسکریپت
DECL = r"(?:async\s+)?function\s+%s\s*\(|(?:const|let|var)\s+%s\s*=\s*(?:async\s*)?\("


def read():
    with open(BOT, encoding="utf-8") as f:
        return f.read()


def check_env():
    problems = []
    if not os.path.exists(BOT):
        problems.append("bot.js پیدا نشد: " + BOT)
    d = os.path.dirname(BOT) or "."
    for m in ("foxcoin.js", "foxcoin-ui.js", "foxcoin-admin.js"):
        if not os.path.exists(os.path.join(d, m)):
            problems.append("ماژول نصب نشده: " + os.path.join(d, m))
    if not os.path.isdir(BACKUP_DIR):
        problems.append("پوشه بکاپ نیست: " + BACKUP_DIR)
    return problems


def declared(src, name):
    return re.search(DECL % (re.escape(name), re.escape(name)), src) is not None


def discover(src, candidates, override_env):
    """نام تابع را پیدا کن: اول متغیر محیطی، بعد نامزدها، بعد حدس عمومی."""
    forced = os.environ.get(override_env, "").strip()
    if forced:
        return forced, ("دستی از %s" % override_env,
                        "اعلان دیده شد ✅" if declared(src, forced)
                        else "⚠️ اعلانش در bot.js پیدا نشد")
    for c in candidates:
        if declared(src, c):
            return c, ("خودکار", "اعلان دیده شد ✅")
    return None, (None, "پیدا نشد ❌")


def guess_report(src, candidates):
    """اگر چیزی پیدا نشد، نام‌های مشابه را برای کمک به کاربر نشان بده."""
    key = "plan" if "getPlans" in candidates else "service"
    found = set()
    for m in re.finditer(
            r"(?:async\s+)?function\s+(\w*%s\w*)\s*\(" % key, src, re.I):
        found.add(m.group(1))
    for m in re.finditer(
            r"(?:const|let|var)\s+(\w*%s\w*)\s*=\s*(?:async\s*)?\(" % key,
            src, re.I):
        found.add(m.group(1))
    return sorted(found)[:12]


def plan(src):
    rows = []
    ok = True

    for label, anchor in CTX_ANCHORS:
        n = src.count(anchor)
        state = ("یکتا ✅" if n == 1 else
                 ("پیدا نشد ❌ (اول وصله‌های قبلی)" if n == 0
                  else "%d بار تکرار ❌" % n))
        rows.append(("ctx " + label, state))
        if n != 1:
            ok = False

    gp, (gsrc, gstate) = discover(src, GETPLANS_CANDIDATES, "FOXCOIN_GETPLANS")
    rows.append(("تابع getPlans",
                 ("%s (%s) — %s" % (gp, gsrc, gstate)) if gp else gstate))
    if not gp:
        ok = False

    dv, (dsrc, dstate) = discover(src, DELIVER_CANDIDATES, "FOXCOIN_DELIVER")
    rows.append(("تابع deliverService",
                 ("%s (%s) — %s" % (dv, dsrc, dstate)) if dv else dstate))
    if not dv:
        ok = False

    # آیا env در دستگیره callback در دسترس است؟
    has_env = bool(re.search(r"\benv\b\s*[,)]", src))
    rows.append(("متغیر env در ربات",
                 "دیده شد ✅" if has_env else "⚠️ دیده نشد — env: null می‌رود"))

    return rows, ok, gp, dv, has_env


def build_fields(gp, dv, has_env):
    """فیلدهای افزودنی به هر دو ctx. امضاها همان چیزی است که ماژول‌ها
    انتظار دارند: getPlans(env, cat) و deliverService(env, config, uid, o)."""
    envexp = "env" if has_env else "null"
    return (
        "\n        env: %s,"
        "\n        getPlans: (e, cat) => %s(e, cat),"
        "\n        deliverService: (e, c, uid, o) => %s(e, c, uid, o),"
        % (envexp, gp, dv)
    )


def apply_patch(src, gp, dv, has_env):
    out = src
    fields = build_fields(gp, dv, has_env)
    for _label, anchor in CTX_ANCHORS:
        i = out.index(anchor)
        j = i + len(anchor)
        out = out[:j] + fields + out[j:]
    # نشانه وصله، تا دوباره زده نشود
    out = out.replace(
        "const coinAdmin = require('./foxcoin-admin');",
        "const coinAdmin = require('./foxcoin-admin'); // coinPlansWired",
        1)
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
                        if "before-foxcoin-plans" in f])
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
    rows, ok, gp, dv, has_env = plan(src)

    print("\nبررسی")
    for name, state in rows:
        print("   %-22s %s" % (name, state))
    print("\nوصله قبلاً خورده؟", "بله" if already else "نه")

    if already:
        print("\nتغییری لازم نیست. برای زدن دوباره، اول --revert کن.")
        return 0

    if not ok:
        print("\nهیچ تغییری اعمال نشد.")
        if not gp:
            g = guess_report(src, GETPLANS_CANDIDATES)
            print("\nتابع پلن‌ها با نام‌های شناخته‌شده پیدا نشد.")
            if g:
                print("نامزدهای مشابه در bot.js:", "، ".join(g))
            print("نام درست را دستی بده:")
            print("   FOXCOIN_GETPLANS=<نام> python3 "
                  "patch-foxcoin-plans.py --apply")
        if not dv:
            d = guess_report(src, DELIVER_CANDIDATES)
            print("\nتابع ساخت سرویس با نام‌های شناخته‌شده پیدا نشد.")
            if d:
                print("نامزدهای مشابه در bot.js:", "، ".join(d))
            print("نام درست را دستی بده:")
            print("   FOXCOIN_DELIVER=<نام> python3 "
                  "patch-foxcoin-plans.py --apply")
        return 1

    print("\nچه چیزی به هر دو ctx اضافه می‌شود:")
    print(build_fields(gp, dv, has_env))

    if "--apply" not in args:
        print("\nاین فقط نمایش برنامه بود. برای اعمال واقعی:")
        print("   python3 patch-foxcoin-plans.py --apply")
        return 0

    stamp = time.strftime("%Y-%m-%d-%H%M%S")
    bak = os.path.join(BACKUP_DIR, "bot.js.before-foxcoin-plans-" + stamp)
    shutil.copy2(BOT, bak)
    print("\nبکاپ:", bak)

    new = apply_patch(src, gp, dv, has_env)
    tmp = BOT + ".foxcoin-plans-tmp.js"
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
    print("\nبعد تست کن: پنل → 🛍 فاکس شاپ → ➕ محصول جدید → دسته")
    print("باید لیست پلن‌های واقعی ربات بیاید، نه پیام خطا.")
    print("\nاگر چیزی خراب شد، برگشت:")
    print("   python3 patch-foxcoin-plans.py --revert")
    return 0


if __name__ == "__main__":
    sys.exit(main())
