#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
patch-coinfix4.py — escape کاراکترهای < و > در متن‌های رابط تلگرام.

تلگرام پیامی که تگ نیمه‌کاره داشته باشد را رد می‌کند و دکمه «مرده» به نظر می‌رسد.
سه رشته‌ی رابط کاربری به &lt; / &gt; تبدیل می‌شوند.

کاربرد: python3 patch-coinfix4.py --dir /مسیر/foxteam-bot
"""
import argparse, os, shutil, subprocess, sys, time

REPL = []

REPL.append(("bot.js", "save-fail-ltgt",
"""    return sendTelegram(config, chatId, saved ? "✅ متن ذخیره شد." : "❌ متن ذخیره نشد. کاراکتر < یا > مجاز نیست.", { inline_keyboard: [[{ text: "📝 متن‌ها", callback_data: "admin:texts" }]] });""",
"""    return sendTelegram(config, chatId, saved ? "✅ متن ذخیره شد." : "❌ متن ذخیره نشد. کاراکتر &lt; یا &gt; مجاز نیست.", { inline_keyboard: [[{ text: "📝 متن‌ها", callback_data: "admin:texts" }]] });"""))

REPL.append(("foxcoin-admin.js", "hook-ltgt",
"""                 '<i>بدون < یا >. اگر پیام «بفرست» نیامد، هوک\\n' +""",
"""                 '<i>بدون &lt; یا &gt;. اگر پیام «بفرست» نیامد، هوک\\n' +"""))

REPL.append(("foxcoin-admin.js", "editor-ltgt",
"""          '<i>بدون کاراکتر < یا > · حداکثر ۱۴۰۰ نویسه</i>',""",
"""          '<i>بدون کاراکتر &lt; یا &gt;. حداکثر ۱۴۰۰ نویسه</i>',"""))


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--dir", required=True)
    a = ap.parse_args()
    files = {}
    for name in ("bot.js", "foxcoin-admin.js"):
        p = os.path.join(a.dir, name)
        if not os.path.exists(p):
            print("ERROR: not found:", p); return 1
        files[name] = open(p, "r", encoding="utf-8").read()

    missing = [(f, l) for f, l, o, n in REPL if o not in files[f]]
    if missing:
        print("ERROR: missing targets:", missing); return 2

    stamp = time.strftime("%Y%m%d-%H%M%S")
    baks = []
    for name in files:
        bak = "%s.bak-coinfix4-%s" % (os.path.join(a.dir, name), stamp)
        shutil.copy2(os.path.join(a.dir, name), bak); baks.append(bak)

    applied = []
    for f, l, o, n in REPL:
        files[f] = files[f].replace(o, n, 1); applied.append("%s:%s" % (f, l))

    tmps = []
    for f, txt in files.items():
        tmp = os.path.join(a.dir, f + ".coinfix4.tmp.js")
        open(tmp, "w", encoding="utf-8").write(txt); tmps.append((f, tmp))
        chk = subprocess.run(["node", "--check", tmp], capture_output=True, text=True)
        if chk.returncode != 0:
            for _, t in tmps:
                if os.path.exists(t): os.remove(t)
            print("SYNTAX FAILED in", f); print(chk.stderr[:400]); return 3
    for f, tmp in tmps:
        os.replace(tmp, os.path.join(a.dir, f))
    print("PATCHED OK:", ", ".join(applied))
    print("backups:", ", ".join(baks))
    return 0


if __name__ == "__main__":
    sys.exit(main())
