#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
patch-shop-desc.py — نمایش توضیح هر محصول در فهرست خرید (بالای دکمه‌ها).

مشکل: فهرست خرید فقط دکمه نام/قیمت بود؛ desc فقط در مرحله تایید می‌آمد.
این پچ یک بلوک متنی می‌سازد که برای هر محصول، نام + desc کامل را بالای
دکمه‌ها چاپ می‌کند تا مشتری قبل از انتخاب، لوکیشن‌ها و ویژگی‌ها را ببیند.

ایمن: بکاپ خودکار + node --check + rollback خودکار در صورت شکست.
فقط یک return در هندلر shop_cat عوض می‌شود؛ بقیه کد دست‌نخورده.

کاربرد:
    python3 patch-shop-desc.py            (مسیر پیش‌فرض /root/foxteam-bot/bot.js)
    python3 patch-shop-desc.py --app PATH
"""
import argparse
import os
import shutil
import subprocess
import sys
import time

DEFAULT = "/root/foxteam-bot/bot.js"

OLD = "return editTelegram(config, chatId, cb.message.message_id, `👇 **محصول مورد نظر را انتخاب کنید:**`, { inline_keyboard: rows });"

NEW = (
    "let shopDescText = \"\";\n"
    "    plans.forEach((p) => { if (p.desc && p.desc !== \"ندارد\") shopDescText += `\\n🛍 **${p.name}**\\n${p.desc}\\n`; });\n"
    "    const shopListMsg = `👇 **محصول مورد نظر را انتخاب کنید:**` + (shopDescText ? `\\n━━━━━━━━━━━━━━${shopDescText}` : \"\");\n"
    "    return editTelegram(config, chatId, cb.message.message_id, shopListMsg, { inline_keyboard: rows });"
)


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--app", default=os.environ.get("FOXBOT_APP", DEFAULT))
    a = ap.parse_args()

    if not os.path.exists(a.app):
        print("ERROR: bot.js not found:", a.app)
        return 1
    with open(a.app, "r", encoding="utf-8") as f:
        txt = f.read()

    if "shopDescText" in txt:
        print("ALREADY PATCHED. nothing to do.")
        return 0
    if OLD not in txt:
        print("ERROR: target line not found; bot.js may differ. aborting.")
        return 2

    stamp = time.strftime("%Y%m%d-%H%M%S")
    bak = "%s.bak-shopdesc-%s" % (a.app, stamp)
    shutil.copy2(a.app, bak)
    print("BACKUP:", bak)

    new = txt.replace(OLD, NEW, 1)
    tmp = a.app + ".shopdesc.tmp.js"
    with open(tmp, "w", encoding="utf-8") as f:
        f.write(new)

    chk = subprocess.run(["node", "--check", tmp], capture_output=True, text=True)
    if chk.returncode != 0:
        os.remove(tmp)
        print("SYNTAX CHECK FAILED -> rolled back.")
        print(chk.stderr[:500])
        return 3
    os.replace(tmp, a.app)
    print("PATCHED OK (syntax valid).")
    print("NEXT: systemctl restart foxteam-bot")
    print("rollback: cp %s %s" % (bak, a.app))
    return 0


if __name__ == "__main__":
    sys.exit(main())
