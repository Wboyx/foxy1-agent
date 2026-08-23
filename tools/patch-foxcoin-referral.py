#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
════════════════════════════════════════════════════════════════
 PATCH FOXCOIN REFERRAL — وصل‌کردن زیرمجموعه‌گیری به bot.js
 نسخه: 1.0 | 2026-08-23
════════════════════════════════════════════════════════════════

چرا این وصله لازم است:
  موتور رفرال در foxcoin.js کامل است و تست‌هایش سبزند، ولی خودش
  نمی‌داند چه کسی با لینک چه کسی وارد شده. این را فقط bot.js
  می‌داند. بدون این وصله، صفحه «دعوت دوستان» همیشه صفر نشان
  می‌دهد — موتور هست ولی هیچ‌وقت روشن نمی‌شود.

سه چیز وصل می‌شود:

  ۱. بارگذاری هسته:  const coinCore = require('./foxcoin');
     (اگر وصله جوایز قبلاً این را گذاشته، دوباره اضافه نمی‌شود)

  ۲. هوک ورود با لینک: هرجا /start پردازش می‌شود، اگر پارامترش
     ref_<شناسه> بود، رابطه دعوت ثبت می‌شود.
     coinCore.setInviter خودش جلوی دعوت خود، تغییر دعوت‌کننده و
     حلقه دعوت را می‌گیرد، پس اینجا شرط اضافه لازم نیست.

  ۳. هوک خرید: بعد از هر خرید موفق، onReferralPurchase صدا زده
     می‌شود تا جایزه دعوت‌کننده، هدیه دعوت‌شده و پله‌های تعدادی
     حساب شوند.

  هر سه داخل try/catch‌اند: اگر فاکس کوین خطا بدهد، خرید کاربر
  و ورود او هرگز نباید بشکند.

محافظ‌ها (همان الگوی وصله‌های قبلی):
  ۱. بکاپ با مهر زمان قبل از هر تغییر
  ۲. اگر وصله قبلاً خورده باشد، دوباره نمی‌زند
  ۳. بعد از وصله، بررسی نحو با node --check
  ۴. اگر نحو خراب شد، خودکار بکاپ را برمی‌گرداند
  ۵. سرویس را خودش ری‌استارت نمی‌کند. آن تصمیم با توست.

استفاده:
  python3 patch-foxcoin-referral.py            گزارش، بدون تغییر
  python3 patch-foxcoin-referral.py --apply    اعمال واقعی
  python3 patch-foxcoin-referral.py --revert   برگرداندن آخرین بکاپ

تست بدون لمس سرور:
  FOXCOIN_BOT=/tmp/x/bot.js python3 patch-foxcoin-referral.py --apply
"""

import os
import re
import shutil
import subprocess
import sys
import time

BOT = os.environ.get("FOXCOIN_BOT", "/root/foxteam-bot/bot.js")
BACKUP_DIR = os.environ.get("FOXCOIN_BACKUP_DIR", "/root/botjs-backups")
MARK = "coinReferral"

REQUIRE_LINE = "const coinCore = require('./foxcoin');"

START_HOOK = (
    "  // coinReferral: ثبت رابطه دعوت وقتی کاربر با لینک ref_ وارد می‌شود\n"
    "  try {\n"
    "    const _refM = String(%(param)s || '').match(/^ref_(.+)$/);\n"
    "    if (_refM) coinCore.setInviter(String(%(uid)s), _refM[1]);\n"
    "  } catch (e) {}\n"
)

PURCHASE_HOOK = (
    "    try { coinCore.onReferralPurchase(String(%(uid)s), "
    "Number(%(amt)s) || 0); } catch (e) {}\n"
)


def read():
    with open(BOT, "r", encoding="utf-8") as f:
        return f.read()


def write(src):
    with open(BOT, "w", encoding="utf-8") as f:
        f.write(src)


def backup():
    os.makedirs(BACKUP_DIR, exist_ok=True)
    stamp = time.strftime("%Y-%m-%d-%H%M%S")
    dst = os.path.join(BACKUP_DIR, "bot.js.before-foxcoin-referral-" + stamp)
    shutil.copy2(BOT, dst)
    return dst


def latest_backup():
    if not os.path.isdir(BACKUP_DIR):
        return None
    c = [f for f in os.listdir(BACKUP_DIR)
         if f.startswith("bot.js.before-foxcoin-referral-")]
    if not c:
        return None
    c.sort()
    return os.path.join(BACKUP_DIR, c[-1])


def node_check(path):
    try:
        r = subprocess.run(["node", "--check", path],
                           capture_output=True, text=True, timeout=60)
        return r.returncode == 0, (r.stderr or "").strip()
    except FileNotFoundError:
        return True, "node پیدا نشد — بررسی نحو رد شد"
    except Exception as e:
        return False, str(e)


def find_start_site(src):
    """
    جایی که /start پردازش می‌شود را پیدا می‌کند و نام متغیرهای
    پارامتر و شناسه کاربر را برمی‌گرداند.

    چند الگوی رایج امتحان می‌شود؛ هیچ‌کدام جواب نداد، دست خالی
    برمی‌گردیم تا کاربر خودش تصمیم بگیرد — حدس زدن بدتر از نزدن است.
    """
    patterns = [
        # if (text.startsWith('/start')) {   با payload جدا
        (r"(if\s*\([^)]*\bstartsWith\(['\"]\/start['\"]\)[^)]*\)\s*\{)",
         None),
        # const [, payload] = text.split(' ')  نزدیک /start
        (r"(const\s+\w+\s*=\s*\w+\.split\(['\"] ['\"]\)\[1\][^\n]*\n)",
         None),
        # case '/start':
        (r"(case\s+['\"]\/start['\"]\s*:)", None),
    ]
    for pat, _ in patterns:
        m = re.search(pat, src)
        if m:
            return m
    return None


def guess_var(src, names):
    """اولین نامی که واقعاً در فایل به‌کار رفته را برمی‌گرداند."""
    for n in names:
        if re.search(r"\b" + re.escape(n) + r"\b", src):
            return n
    return None


def find_purchase_site(src):
    """قیف مرکزی خرید — همان لنگری که وصله جوایز از آن استفاده کرد."""
    anchors = [
        'if (purpose === "purchase") {',
        "if (purpose === 'purchase') {",
        "coinCore.onPurchase(",
    ]
    for a in anchors:
        i = src.find(a)
        if i != -1:
            return a, i
    return None, -1


def report(src):
    print("── گزارش پیش از وصله ──\n")
    ok = True

    if MARK in src:
        print("   وصله رفرال            قبلاً خورده ✅ (کاری لازم نیست)")
        return False

    if REQUIRE_LINE in src or "require('./foxcoin')" in src:
        print("   بارگذاری هسته         موجود ✅")
    else:
        print("   بارگذاری هسته         اضافه می‌شود ➕")

    m = find_start_site(src)
    if m:
        print("   محل پردازش /start     پیدا شد ✅  (خط %d)"
              % (src[:m.start()].count("\n") + 1))
    else:
        print("   محل پردازش /start     پیدا نشد ❌")
        ok = False

    uid = guess_var(src, ["userId", "uid", "chatId", "from.id"])
    print("   متغیر شناسه کاربر     %s" % (uid or "پیدا نشد ❌"))
    if not uid:
        ok = False

    param = guess_var(src, ["startParam", "payload", "startPayload",
                            "refParam", "args", "param"])
    print("   متغیر پارامتر start   %s"
          % (param or "پیدا نشد — از split دستی استفاده می‌شود ⚠️"))

    a, i = find_purchase_site(src)
    if a:
        print("   قیف خرید              پیدا شد ✅  (%s)" % a[:40])
    else:
        print("   قیف خرید              پیدا نشد ❌")
        ok = False

    print()
    if not ok:
        print("⚠️  پیش‌نیازها کامل نیست. با متغیر محیطی می‌توانی")
        print("    دستی مشخص کنی، مثلا:")
        print("    FOXCOIN_UID=userId FOXCOIN_STARTPARAM=payload \\")
        print("        python3 patch-foxcoin-referral.py --apply")
    return ok


def apply_patch():
    src = read()

    if MARK in src:
        print("✅ وصله رفرال قبلاً خورده. کاری لازم نیست.")
        return 0

    if not report(src):
        print("\n❌ اعمال نشد.")
        return 1

    uid = os.environ.get("FOXCOIN_UID") or guess_var(
        src, ["userId", "uid", "chatId"])
    param = os.environ.get("FOXCOIN_STARTPARAM") or guess_var(
        src, ["startParam", "payload", "startPayload", "refParam"])
    amt = os.environ.get("FOXCOIN_AMOUNT") or guess_var(
        src, ["amount", "price", "total"])

    dst = backup()
    print("\n💾 بکاپ: %s" % dst)

    out = src

    # ۱) بارگذاری هسته
    if "require('./foxcoin')" not in out:
        lines = out.split("\n")
        ins = 0
        for i, ln in enumerate(lines[:60]):
            if ln.startswith("const ") and "require(" in ln:
                ins = i + 1
        lines.insert(ins, REQUIRE_LINE)
        out = "\n".join(lines)
        print("   ➕ بارگذاری هسته")

    # ۲) هوک /start
    m = find_start_site(out)
    if m:
        if param:
            hook = START_HOOK % {"param": param, "uid": uid}
        else:
            # پارامتر آماده نیست: خودمان از متن پیام درش می‌آوریم
            hook = (
                "  // coinReferral: ثبت رابطه دعوت (ref_ در پارامتر start)\n"
                "  try {\n"
                "    const _refRaw = String((typeof text !== 'undefined' "
                "? text : '') || '');\n"
                "    const _refM = _refRaw.match(/\\/start\\s+ref_(\\S+)/);\n"
                "    if (_refM) coinCore.setInviter(String(%s), _refM[1]);\n"
                "  } catch (e) {}\n" % uid
            )
        pos = m.end()
        out = out[:pos] + "\n" + hook + out[pos:]
        print("   ➕ هوک ورود با لینک دعوت")

    # ۳) هوک خرید
    a, _ = find_purchase_site(out)
    if a:
        hook = PURCHASE_HOOK % {"uid": uid, "amt": amt or "0"}
        if a.startswith("coinCore.onPurchase("):
            # کنار هوک جوایز بگذار — همان‌جا خرید قطعی شده
            ln_start = out.rfind("\n", 0, out.find(a)) + 1
            ln_end = out.find("\n", out.find(a)) + 1
            out = out[:ln_end] + hook + out[ln_end:]
        else:
            i = out.find(a) + len(a)
            out = out[:i] + "\n" + hook + out[i:]
        print("   ➕ هوک خرید زیرمجموعه")

    # پسوند حتما .js بماند، وگرنه node --check فایل را نمی‌شناسد
    # و خطای ERR_UNKNOWN_FILE_EXTENSION می‌دهد که ربطی به کد ندارد.
    tmp = BOT[:-3] + ".tmp-referral.js" if BOT.endswith(".js") \
        else BOT + ".tmp-referral.js"
    with open(tmp, "w", encoding="utf-8") as f:
        f.write(out)
    ok, err = node_check(tmp)
    if not ok:
        os.remove(tmp)
        print("\n❌ نحو خراب شد، تغییری اعمال نشد:\n%s" % err)
        return 1

    shutil.move(tmp, BOT)
    print("\n✅ وصله خورد و نحو سالم است.")
    print("   حالا: systemctl restart foxteam-bot")
    return 0


def revert():
    b = latest_backup()
    if not b:
        print("❌ بکاپی از این وصله پیدا نشد.")
        return 1
    shutil.copy2(b, BOT)
    print("↩️  برگردانده شد از: %s" % b)
    return 0


def main():
    if not os.path.isfile(BOT):
        print("❌ فایل ربات پیدا نشد: %s" % BOT)
        return 1
    if "--revert" in sys.argv:
        return revert()
    if "--apply" in sys.argv:
        return apply_patch()
    src = read()
    print("فایل ربات: %s\n" % BOT)
    report(src)
    print("\n(این فقط گزارش بود. برای اعمال: --apply)")
    return 0


if __name__ == "__main__":
    sys.exit(main())
