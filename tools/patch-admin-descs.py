#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
patch-admin-descs.py — بخش راحت «ویرایش توضیح محصولات» در تنظیمات ادمین.

۱) دکمه‌ی «📝 ویرایش توضیح محصولات» مستقیم داخل پنل مدیریت.
۲) صفحه‌ی واحد با لیست همه‌ی محصولات (نامحدود + حجمی) — روی هرکدام بزنی
   توضیح جدید را می‌پرسی و ذخیره می‌کند (شامل محصولات آینده).
۳) هنگام ویرایش، توضیح فعلی هم نمایش داده می‌شود.

ایمن: بکاپ + node --check + rollback. فقط bot.js.
کاربرد:  python3 patch-admin-descs.py [--app PATH]
بعد:     systemctl restart foxteam-bot
"""
import argparse, os, shutil, subprocess, sys, time

DEFAULT = "/root/foxteam-bot/bot.js"

# ۱) دکمه در پنل مدیریت
OLD_MENU = """        [{ text: "📦 مدیریت محصولات و سرویس‌ها", callback_data: "product_manage" }],"""
NEW_MENU = """        [{ text: "📝 ویرایش توضیح محصولات", callback_data: "admin_edit_descs" }],
        [{ text: "📦 مدیریت محصولات و سرویس‌ها", callback_data: "product_manage" }],"""

# ۲) صفحه‌ی لیست همه‌ی محصولات برای ویرایش توضیح
OLD_ANCHOR = """  // اسم قدیمی این کالبک برای سازگاری با پیام‌های قبلی (مثلاً پیام /start) نگه داشته شده"""
NEW_ANCHOR = """  if (data === "admin_edit_descs") {
    const u = await getPlans(env, "unlimited");
    const v = await getPlans(env, "volume");
    const rows = [];
    u.forEach((p) => rows.push([{ text: `📝 ${p.name} — نامحدود`, callback_data: `edit_desc:unlimited:${p.id}` }]));
    v.forEach((p) => rows.push([{ text: `📝 ${p.name} — حجمی`, callback_data: `edit_desc:volume:${p.id}` }]));
    if (!rows.length) return editTelegram(config, chatId, cb.message.message_id, "❌ محصولی تعریف نشده است.");
    rows.push([{ text: "🔙 پنل مدیریت", callback_data: "admin_settings" }]);
    return editTelegram(config, chatId, cb.message.message_id, `📝 <b>ویرایش توضیح محصولات:</b>\\nروی هر محصول بزنید و توضیح جدید را بفرستید. این توضیح دقیقاً در صفحه‌ی خرید همان محصول نمایش داده می‌شود.`, { inline_keyboard: rows });
  }

  // اسم قدیمی این کالبک برای سازگاری با پیام‌های قبلی (مثلاً پیام /start) نگه داشته شده"""

# ۳) نمایش توضیح فعلی هنگام ویرایش
OLD_PROMPT = """    return editTelegram(config, chatId, cb.message.message_id, `📝 **توضیح جدید برای «${pl ? pl.name : ""}» را بفرستید:**\\n(برای پاک‌کردن بنویسید ندارد)`);"""
NEW_PROMPT = """    const cur = pl && pl.desc && pl.desc !== "ندارد" ? pl.desc : "(هنوز توضیحی ندارد)";
    return editTelegram(config, chatId, cb.message.message_id, `📝 **توضیح فعلی «${pl ? pl.name : ""}»:**\\n${cur}\\n━━━━━━━━━━━━━━\\n✏️ توضیح جدید را بفرستید (برای پاک‌کردن بنویسید ندارد):`);"""

REPL = [
    ("settings-button", OLD_MENU, NEW_MENU),
    ("descs-screen", OLD_ANCHOR, NEW_ANCHOR),
    ("show-current", OLD_PROMPT, NEW_PROMPT),
]


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--app", default=os.environ.get("FOXBOT_APP", DEFAULT))
    a = ap.parse_args()
    if not os.path.exists(a.app):
        print("ERROR: not found:", a.app); return 1
    with open(a.app, "r", encoding="utf-8") as f:
        txt = f.read()

    if "admin_edit_descs" in txt:
        print("ALREADY PATCHED."); return 0

    missing = [n for n, o, _ in REPL if o not in txt]
    if missing:
        print("ERROR: missing targets:", missing); return 2

    stamp = time.strftime("%Y%m%d-%H%M%S")
    bak = "%s.bak-admindescs-%s" % (a.app, stamp)
    shutil.copy2(a.app, bak)
    print("BACKUP:", bak)

    for n, o, nw in REPL:
        txt = txt.replace(o, nw, 1)

    tmp = a.app + ".admindescs.tmp.js"
    with open(tmp, "w", encoding="utf-8") as f:
        f.write(txt)
    chk = subprocess.run(["node", "--check", tmp], capture_output=True, text=True)
    if chk.returncode != 0:
        os.remove(tmp); print("SYNTAX FAILED -> rolled back."); print(chk.stderr[:400]); return 3
    os.replace(tmp, a.app)
    print("PATCHED OK:", ", ".join(n for n, _, _ in REPL))
    print("NEXT: systemctl restart foxteam-bot")
    print("rollback: cp %s %s" % (bak, a.app))
    return 0


if __name__ == "__main__":
    sys.exit(main())
