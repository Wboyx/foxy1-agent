#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
patch-fix-edit.py — محکم‌سازی بخش ویرایش توضیح + لاگ هر کالبک.

۱) لاگ هر کالبک در journalctl (برای تشخیص قطعی هر باگ آینده).
۲) صفحه‌ی لیست محصولات و صفحه‌ی ویرایش: پیام جدید (sendTelegram) به‌جای edit،
   با try/catch — هر خطا به‌جای سکوت، به ادمین نمایش داده می‌شود.
۳) پس از ذخیره، توضیح ذخیره‌شده نمایش + دکمه «ویرایش دوباره».

ایمن: بکاپ + node --check + rollback. فقط bot.js.
کاربرد:  python3 patch-fix-edit.py [--app PATH]
بعد:     systemctl restart foxteam-bot
"""
import argparse, os, shutil, subprocess, sys, time

DEFAULT = "/root/foxteam-bot/bot.js"

# ۱) لاگ هر کالبک
OLD_LOG = """  const data = cb.data;"""
NEW_LOG = """  const data = cb.data;
  console.log("🔔 CB:", data);"""

# ۲) صفحه‌ی لیست — محکم + پیام جدید
OLD_LIST = """  if (data === "admin_edit_descs") {
    const u = await getPlans(env, "unlimited");
    const v = await getPlans(env, "volume");
    const rows = [];
    u.forEach((p) => rows.push([{ text: `📝 ${p.name} — نامحدود`, callback_data: `edit_desc:unlimited:${p.id}` }]));
    v.forEach((p) => rows.push([{ text: `📝 ${p.name} — حجمی`, callback_data: `edit_desc:volume:${p.id}` }]));
    if (!rows.length) return editTelegram(config, chatId, cb.message.message_id, "❌ محصولی تعریف نشده است.");
    rows.push([{ text: "🔙 پنل مدیریت", callback_data: "admin_settings" }]);
    return editTelegram(config, chatId, cb.message.message_id, `📝 <b>ویرایش توضیح محصولات:</b>\\nروی هر محصول بزنید و توضیح جدید را بفرستید. این توضیح دقیقاً در صفحه‌ی خرید همان محصول نمایش داده می‌شود.`, { inline_keyboard: rows });
  }"""
NEW_LIST = """  if (data === "admin_edit_descs") {
    try {
      const u = await getPlans(env, "unlimited");
      const v = await getPlans(env, "volume");
      const rows = [];
      u.forEach((p) => rows.push([{ text: `📝 ${p.name} — نامحدود`, callback_data: `edit_desc:unlimited:${p.id}` }]));
      v.forEach((p) => rows.push([{ text: `📝 ${p.name} — حجمی`, callback_data: `edit_desc:volume:${p.id}` }]));
      if (!rows.length) return editTelegram(config, chatId, cb.message.message_id, "❌ محصولی تعریف نشده است.");
      rows.push([{ text: "🔙 پنل مدیریت", callback_data: "admin_settings" }]);
      return await sendTelegram(config, chatId, `📝 <b>ویرایش توضیح محصولات:</b>\\nروی هر محصول بزنید تا توضیح فعلی‌اش را ببینید و جدیدش را بفرستید. این توضیح دقیقاً در صفحه‌ی خرید همان محصول نمایش داده می‌شود.`, { inline_keyboard: rows });
    } catch (e) {
      console.log("❌ admin_edit_descs error:", e.stack || e.message);
      return sendTelegram(config, chatId, `❌ خطا در بازکردن بخش ویرایش: ${e.message}`);
    }
  }"""

# ۳) صفحه‌ی ویرایش یک محصول — محکم + پیام جدید + دکمه انصراف
OLD_EDIT = """  if (data.startsWith("edit_desc:")) {
    const parts = data.split(":");
    const cat = parts[1]; const planId = parts[2];
    const plans = await getPlans(env, cat);
    const pl = plans.find((p) => p.id === planId);
    await setState(env, userId, { step: "admin_edit_desc_only", meta: { cat, planId } });
    const cur = pl && pl.desc && pl.desc !== "ندارد" ? pl.desc : "(هنوز توضیحی ندارد)";
    return editTelegram(config, chatId, cb.message.message_id, `📝 **توضیح فعلی «${pl ? pl.name : ""}»:**\\n${cur}\\n━━━━━━━━━━━━━━\\n✏️ توضیح جدید را بفرستید (برای پاک‌کردن بنویسید ندارد):`);
  }"""
NEW_EDIT = """  if (data.startsWith("edit_desc:")) {
    try {
      const parts = data.split(":");
      const cat = parts[1]; const planId = parts[2];
      const plans = await getPlans(env, cat);
      const pl = plans.find((p) => p.id === planId);
      if (!pl) return sendTelegram(config, chatId, "❌ محصول پیدا نشد.");
      await setState(env, userId, { step: "admin_edit_desc_only", meta: { cat, planId } });
      const cur = pl.desc && pl.desc !== "ندارد" ? pl.desc : "(هنوز توضیحی ندارد)";
      return await sendTelegram(config, chatId, `📝 <b>توضیح فعلی «${pl.name}»:</b>\\n${cur}\\n━━━━━━━━━━━━━━\\n✏️ <b>همین حالا توضیح جدید را به‌صورت پیام بفرستید</b> (برای پاک‌کردن بنویسید ندارد):`, { inline_keyboard: [[{ text: "🔙 انصراف", callback_data: "admin_edit_descs" }]] });
    } catch (e) {
      console.log("❌ edit_desc error:", e.stack || e.message);
      return sendTelegram(config, chatId, `❌ خطا: ${e.message}`);
    }
  }"""

# ۴) ذخیره — محکم + نمایش نتیجه + دکمه‌ها
OLD_STEP = """    admin_edit_desc_only: async (v) => {
      const cat = state.meta.cat; const planId = state.meta.planId;
      const plans = await getPlans(env, cat);
      const idx = plans.findIndex((p) => p.id === planId);
      if (idx === -1) { await setState(env, chatId, null); return sendTelegram(config, chatId, "❌ محصول پیدا نشد."); }
      plans[idx].desc = v;
      await savePlans(env, cat, plans);
      await setState(env, chatId, null);
      return sendTelegram(config, chatId, `✅ توضیح «${escapeHtml(plans[idx].name)}» ذخیره شد.`, { inline_keyboard: [[{ text: "🔙 مدیریت محصولات", callback_data: `manage_cat:${cat}` }]] });
    },"""
NEW_STEP = """    admin_edit_desc_only: async (v) => {
      try {
        const cat = state.meta.cat; const planId = state.meta.planId;
        const plans = await getPlans(env, cat);
        const idx = plans.findIndex((p) => p.id === planId);
        if (idx === -1) { await setState(env, chatId, null); return sendTelegram(config, chatId, "❌ محصول پیدا نشد."); }
        plans[idx].desc = v;
        await savePlans(env, cat, plans);
        await setState(env, chatId, null);
        return sendTelegram(config, chatId, `✅ توضیح «${escapeHtml(plans[idx].name)}» ذخیره شد و از همین حالا در صفحه‌ی خرید نمایش داده می‌شود:\\n━━━━━━━━━━━━━━\\n${v}\\n━━━━━━━━━━━━━━`, { inline_keyboard: [[{ text: "📝 ویرایش دوباره", callback_data: `edit_desc:${cat}:${planId}` }], [{ text: "🔙 فهرست محصولات", callback_data: "admin_edit_descs" }]] });
      } catch (e) {
        console.log("❌ admin_edit_desc_only error:", e.stack || e.message);
        return sendTelegram(config, chatId, `❌ خطا در ذخیره: ${e.message}`);
      }
    },"""

CORE = [
    ("list-screen", OLD_LIST, NEW_LIST),
    ("edit-screen", OLD_EDIT, NEW_EDIT),
    ("save-step", OLD_STEP, NEW_STEP),
]
OPTIONAL = [("cb-log", OLD_LOG, NEW_LOG)]


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--app", default=os.environ.get("FOXBOT_APP", DEFAULT))
    a = ap.parse_args()
    if not os.path.exists(a.app):
        print("ERROR: not found:", a.app); return 1
    with open(a.app, "r", encoding="utf-8") as f:
        txt = f.read()

    if "admin_edit_descs error:" in txt:
        print("ALREADY PATCHED."); return 0

    missing = [n for n, o, _ in CORE if o not in txt]
    if missing:
        print("ERROR: missing core targets:", missing); return 2

    stamp = time.strftime("%Y%m%d-%H%M%S")
    bak = "%s.bak-fixedit-%s" % (a.app, stamp)
    shutil.copy2(a.app, bak)
    print("BACKUP:", bak)

    applied = []
    for n, o, nw in CORE:
        txt = txt.replace(o, nw, 1); applied.append(n)
    for n, o, nw in OPTIONAL:
        if o in txt:
            txt = txt.replace(o, nw, 1); applied.append(n)

    tmp = a.app + ".fixedit.tmp.js"
    with open(tmp, "w", encoding="utf-8") as f:
        f.write(txt)
    chk = subprocess.run(["node", "--check", tmp], capture_output=True, text=True)
    if chk.returncode != 0:
        os.remove(tmp); print("SYNTAX FAILED -> rolled back."); print(chk.stderr[:400]); return 3
    os.replace(tmp, a.app)
    print("PATCHED OK:", ", ".join(applied))
    print("NEXT: systemctl restart foxteam-bot")
    print("rollback: cp %s %s" % (bak, a.app))
    return 0


if __name__ == "__main__":
    sys.exit(main())
