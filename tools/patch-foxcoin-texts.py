#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
════════════════════════════════════════════════════════════════
 PATCH FOXCOIN TEXTS — دریافت متن از ادمین در bot.js
 نسخه: 1.1 | 2026-08-23
════════════════════════════════════════════════════════════════

چه می‌کند:
  بعد از وصله مدیریت (patch-foxcoin-admin.py)، دو هوک اضافه می‌کند
  تا ادمین بتواند متن‌های بخش‌های فاکس کوین را از پنل ویرایش کند:

   ۱. هوک پیام: وقتی حالت coin_admin_awaiting_text فعال است، متن
      ارسال‌شده ادمین را به coinAdmin.routeText می‌دهد (ذخیره در
      هسته) و حالت را پاک می‌کند.
   ۲. هوک کالبک: وقتی ادمین روی «✏️» در صفحه متن‌ها می‌زند، حالت
      دریافت متن را در bot.js ثبت می‌کند و پیام «متن را بفرست»
      می‌فرستد.

  الگو دقیقاً همان ماشین حالت خود bot.js است (awaiting_admin_text
  برای «مدیریت متن‌ها»). اگر bot.js این الگو را نداشته باشد،
  لنگرگاه پیدا نمی‌شود و اسکریپت بدون هیچ تغییری گزارش می‌دهد.

محافظ‌ها (همان الگوی وصله‌های قبلی):
  ۱. بکاپ با مهر زمان قبل از هر تغییر
  ۲. اگر وصله قبلاً خورده باشد، دوباره نمی‌زند
  ۳. بعد از وصله، بررسی نحو با node --check
  ۴. اگر نحو خراب بود، خودکار بکاپ را برمی‌گرداند
  ۵. سرویس را خودش ری‌استارت نمی‌کند. آن تصمیم با توست.

پیش‌نیاز: وصله مدیریت (patch-foxcoin-admin.py) قبلاً خورده باشد.
           لنگرگاه کالبک همان خطی است که آن وصله اضافه کرده است.

استفاده:
  python3 patch-foxcoin-texts.py            نمایش برنامه، بدون تغییر
  python3 patch-foxcoin-texts.py --apply    اعمال واقعی
  python3 patch-foxcoin-texts.py --revert   برگرداندن آخرین بکاپ همین وصله

برای تست در محیط دیگر (بدون لمس سرور):
  FOXCOIN_BOT=/tmp/x/bot.js python3 patch-foxcoin-texts.py --apply
"""

import os
import re
import shutil
import subprocess
import sys
import time

BOT = os.environ.get("FOXCOIN_BOT", "/root/foxteam-bot/bot.js")
BACKUP_DIR = os.environ.get("FOXCOIN_BACKUP_DIR", "/root/botjs-backups")
MARK = "coinTexts"

MESSAGE_HOOK = r'''
  if (state && state.step === "coin_admin_awaiting_text" && text !== "/cancel" && isAdmin(userId, config)) {
    let saved = false;
    try { saved = await coinAdmin.routeText({ uid: userId, config: config, text: String(text || "") }); } catch (e) { saved = false; }
    await setState(env, userId, null);
    return sendTelegram(config, chatId, saved ? "✅ متن ذخیره شد." : "❌ متن ذخیره نشد. کاراکتر < یا > مجاز نیست.", { inline_keyboard: [[{ text: "📝 متن‌ها", callback_data: "admin:texts" }]] });
  }
'''

CALLBACK_HOOK = r'''
      if (data === "admin:tcancel") {
        coinAdmin.clearPending(userId);
        try { await setState(env, userId, null); } catch (e) {}
      }
      const _coinPending = coinAdmin.pendingText(userId);
      if (_coinPending) {
        try { await setState(env, userId, { step: "coin_admin_awaiting_text" }); } catch (e) {}
        return sendTelegram(config, chatId, _coinPending.prompt, { inline_keyboard: [[{ text: "🔙 انصراف", callback_data: "admin:tcancel" }]] });
      }
'''

# لنگرگاه‌های پیام: چند نامزد، اولی که یکتا باشد برنده است
MESSAGE_ANCHORS = [
    "const state = await getState(env, userId);",
    "const state = await getState(env, chatId);",
]

# لنگرگاه کالبک: خطی که patch-foxcoin-admin.py اضافه کرده است
CALLBACK_ANCHOR = "      if (handledByAdmin) return;"


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



def enclosing_body(src, pos):
    """
    بدنه تابعی که `pos` داخل آن است را برگردان.

    چرا لازم است: نسخه اول پنجره ثابت ۳۵۰۰ نویسه می‌گرفت و از مرز
    تابع رد می‌شد — یک دستگیره بی‌ربط، `text` تابع بعدی را می‌دید و
    برنده می‌شد. هوک در تابع اشتباه می‌نشست و چون آنجا `text` تعریف
    نشده بود، ربات موقع هر پیام کرش می‌کرد.
    """
    starts = [m.start() for m in re.finditer(
        r"(?:^|\n)\s*(?:async\s+)?function\s+\w+\s*\(", src)
        if m.start() < pos]
    begin = starts[-1] if starts else 0
    nxt = re.search(r"\n\s*(?:async\s+)?function\s+\w+\s*\(",
                    src[pos:])
    end = pos + nxt.start() if nxt else len(src)
    return src[begin:end]


def pick_message_site(src):
    """
    وقتی `const state = await getState(...)` چندبار در bot.js هست،
    کدام‌یک دستگیره پیام متنی است؟

    معیار: در بدنه همان تابع، هم متغیر `text` باشد و هم setState.
    دستگیره‌های دیگر (کالبک، اینلاین، جوین) این ترکیب را ندارند.
    امتیاز بیشتر برای تابعی که isAdmin هم دارد — بخش مدیریت
    متن‌ها همان‌جاست.

    خروجی: (offset پایان لنگرگاه، توضیح) یا (None, "")
    """
    best = None
    for cand in MESSAGE_ANCHORS:
        start = 0
        while True:
            i = src.find(cand, start)
            if i < 0:
                break
            start = i + len(cand)
            body = enclosing_body(src, i)
            has_text = re.search(r"\btext\b", body) is not None
            has_set = "setState(" in body
            has_admin = "isAdmin(" in body
            if has_text and has_set:
                score = 2 + (1 if has_admin else 0)
                if best is None or score > best[0]:
                    best = (score, start,
                            "%s — تابعی که text+setState%s دارد"
                            % (cand.strip(),
                               "+isAdmin" if has_admin else ""))
    if best is None:
        return None, ""
    return best[1], best[2]


def plan(src):
    rows = []
    ok = True

    # قدم ۱: هوک پیام
    msg_anchor = None
    for cand in MESSAGE_ANCHORS:
        n = src.count(cand)
        if n == 1:
            msg_anchor = cand
            rows.append(("هوک پیام متنی", "یکتا ✅ (%s)" % cand.strip()))
            break
    if not msg_anchor:
        # لنگرگاه چندبار تکرار شده (bot.js واقعی چند دستگیره پیام
        # دارد). به‌جای تسلیم‌شدن، تابعی را پیدا کن که واقعاً پیام
        # متنی ادمین را می‌گیرد: باید هم `text` و هم setState داشته
        # باشد. آن یکی نقطه درست تزریق است.
        pick, why = pick_message_site(src)
        if pick is not None:
            msg_anchor = pick
            rows.append(("هوک پیام متنی", "انتخاب هوشمند ✅ (%s)" % why))
        else:
            best = None
            for cand in MESSAGE_ANCHORS:
                n = src.count(cand)
                if n > 0:
                    best = "%s (%d بار)" % (cand.strip(), n)
                    break
            rows.append(("هوک پیام متنی",
                         "پیدا نشد ❌" if not best else "%s ❌" % best))
            ok = False

    # قدم ۲: هوک کالبک
    n = src.count(CALLBACK_ANCHOR)
    rows.append(("هوک کالبک", "یکتا ✅" if n == 1 else
                 ("پیدا نشد ❌" if n == 0 else "%d بار تکرار ❌" % n)))
    if n != 1:
        ok = False

    return rows, ok, msg_anchor


def apply_patch(src, msg_anchor):
    out = src
    # msg_anchor یا رشته یکتاست، یا offset پایانِ نقطه انتخاب‌شده
    if isinstance(msg_anchor, int):
        j = msg_anchor
    else:
        j = out.index(msg_anchor) + len(msg_anchor)
    out = out[:j] + MESSAGE_HOOK + out[j:]

    # بلوک کالبک باید قبل از `if (handledByAdmin) return;` بنشیند،
    # وگرنه هرگز اجرا نمی‌شود (مسیر admin همیشه handled برمی‌گرداند).
    i = out.index(CALLBACK_ANCHOR)
    out = out[:i] + CALLBACK_HOOK + out[i:]
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
                        if "before-foxcoin-texts" in f])
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
    rows, ok, msg_anchor = plan(src)

    print("\nبررسی لنگرگاه‌ها")
    for name, state in rows:
        print("   %-22s %s" % (name, state))
    print("\nوصله قبلاً خورده؟", "بله" if already else "نه")

    if already:
        print("\nتغییری لازم نیست. اگر می‌خواهی دوباره بزنی، اول --revert کن.")
        return 0
    if not ok:
        print("\nیک یا چند لنگرگاه یکتا نیست. هیچ تغییری اعمال نشد.")
        print("این یعنی bot.js سرور با الگوی شناخته‌شده فرق دارد.")
        print("متن‌ها همچنان از خط فرمان قابل ویرایش‌اند:")
        print("   node foxcoin.js text <کلید> <متن>")
        return 1

    if "--apply" not in args:
        print("\nاین فقط نمایش برنامه بود. برای اعمال واقعی:")
        print("   python3 patch-foxcoin-texts.py --apply")
        return 0

    stamp = time.strftime("%Y-%m-%d-%H%M%S")
    bak = os.path.join(BACKUP_DIR, "bot.js.before-foxcoin-texts-" + stamp)
    shutil.copy2(BOT, bak)
    print("\nبکاپ:", bak)

    new = apply_patch(src, msg_anchor)
    tmp = BOT + ".foxcoin-texts-tmp.js"
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
    print("   python3 patch-foxcoin-texts.py --revert")
    return 0


if __name__ == "__main__":
    sys.exit(main())
