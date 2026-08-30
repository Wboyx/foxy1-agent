#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
patch-buy-detail.py (v2) — UX جدید خرید + ویرایش راحت توضیح از مدیریت.

۱) کلیک روی محصول -> صفحه‌ی توضیح کامل + «در صورت تایید روی دکمه زیر کلیک کنید»
   -> دکمه ادامه -> یوزرنیم -> پرداخت. (برای همه‌ی دسته‌ها)
۲) توضیح از فهرست خرید و از فاکتور نهایی حذف می‌شود (فقط صفحه‌ی محصول).
۳) در مدیریت محصولات، دکمه «📝 توضیح» برای ویرایش مستقیم توضیح هر محصول
   (شامل محصولاتی که بعداً اضافه می‌شوند).

ایمن: بکاپ + node --check + rollback. فقط bot.js را دست می‌زند.
کاربرد:  python3 patch-buy-detail.py [--app PATH]
بعد:     systemctl restart foxteam-bot
"""
import argparse, os, re, shutil, subprocess, sys, time

DEFAULT = "/root/foxteam-bot/bot.js"

# --- (اختیاری) ساده‌سازی فهرست خرید اگر پچ قبلی shopDescText فعال باشد ---
OLD_LIST = """    let shopDescText = "";
    plans.forEach((p) => { if (p.desc && p.desc !== "ندارد") shopDescText += `\\n🛍 **${p.name}**\\n${p.desc}\\n`; });
    const shopListMsg = `👇 **محصول مورد نظر را انتخاب کنید:**` + (shopDescText ? `\\n━━━━━━━━━━━━━━${shopDescText}` : "");
    return editTelegram(config, chatId, cb.message.message_id, shopListMsg, { inline_keyboard: rows });"""
NEW_LIST = """    return editTelegram(config, chatId, cb.message.message_id, `👇 **محصول مورد نظر را انتخاب کنید:**`, { inline_keyboard: rows });"""

# --- (اختیاری) حذف توضیح از فاکتور نهایی (مسیر نامحدود) ---
OLD_INV_U = """        `${state.meta.desc && state.meta.desc !== "ندارد" ? `📝 **مشخصات:** ${state.meta.desc}\\n` : ""}` +\n"""
# --- (اختیاری) حذف توضیح از فاکتور نهایی (مسیر حجمی) ---
OLD_INV_V = """      `${state.meta.desc && state.meta.desc !== "ندارد" ? `📝 **مشخصات:** ${state.meta.desc}\\n` : ""}` +\n"""

# --- صفحه‌ی جزئیات به‌جای پرسش مستقیم یوزرنیم ---
OLD_BUY = """    // در هر دو حالت ابتدا یوزرنیم درخواستی از کاربر سوال می‌شود
    await setState(env, userId, {
      step: "awaiting_config_username",
      meta: { cat, planId, name: plan.name, price: plan.price, pricePerGb: plan.price, minGb: plan.minGb || 1, desc: plan.desc, planInbounds: plan.inbounds, planDays: plan.days || 0, planPanelId: plan.panelId || null }
    });
    return editTelegram(config, chatId, cb.message.message_id, `👤 **لطفاً یک یوزرنیم انگلیسی دلخواه برای کانفیگ خود ارسال کنید:**\\n*(مثال: ali)*`, { inline_keyboard: [[{ text: "🔙 انصراف", callback_data: `shop_cat:${cat}` }]] });"""
NEW_BUY = """    const priceLabel = cat === "volume" ? `${plan.price.toLocaleString("en-US")} تومان / گیگ` : `${plan.price.toLocaleString("en-US")} تومان`;
    const detailText = `🛍 **${plan.name}**\\n💲 ${priceLabel}\\n━━━━━━━━━━━━━━\\n${(plan.desc && plan.desc !== "ندارد") ? plan.desc : "توضیحی ثبت نشده."}\\n━━━━━━━━━━━━━━\\n✅ در صورت تایید، روی دکمه‌ی زیر کلیک کنید:`;
    return editTelegram(config, chatId, cb.message.message_id, detailText, { inline_keyboard: [
      [{ text: "✅ ادامه و انتخاب یوزرنیم", callback_data: `buycont:${cat}:${plan.id}` }],
      [{ text: "🔙 بازگشت به محصولات", callback_data: `shop_cat:${cat}` }]
    ] });"""

# --- هندلر ادامه (همان منطق قبلی یوزرنیم) ---
OLD_WALLET = """  if (data === "wallet") {"""
NEW_WALLET = """  if (data.startsWith("buycont:")) {
    const parts = data.split(":");
    const cat = parts[1]; const planId = parts[2];
    const plans = await getPlans(env, cat);
    const plan = plans.find((p) => p.id === planId);
    if (!plan) return editTelegram(config, chatId, cb.message.message_id, "❌ محصول یافت نشد.");
    await setState(env, userId, {
      step: "awaiting_config_username",
      meta: { cat, planId, name: plan.name, price: plan.price, pricePerGb: plan.price, minGb: plan.minGb || 1, desc: plan.desc, planInbounds: plan.inbounds, planDays: plan.days || 0, planPanelId: plan.panelId || null }
    });
    return editTelegram(config, chatId, cb.message.message_id, `👤 **لطفاً یک یوزرنیم انگلیسی دلخواه برای کانفیگ خود ارسال کنید:**\\n*(مثال: ali)*`, { inline_keyboard: [[{ text: "🔙 انصراف", callback_data: `shop_cat:${cat}` }]] });
  }

  if (data === "wallet") {"""

# --- هندلر ویرایش سریع توضیح (قبل از remove_plan) ---
OLD_REMOVE = """  if (data.startsWith("remove_plan:")) {"""
NEW_REMOVE = """  if (data.startsWith("edit_desc:")) {
    const parts = data.split(":");
    const cat = parts[1]; const planId = parts[2];
    const plans = await getPlans(env, cat);
    const pl = plans.find((p) => p.id === planId);
    await setState(env, userId, { step: "admin_edit_desc_only", meta: { cat, planId } });
    return editTelegram(config, chatId, cb.message.message_id, `📝 **توضیح جدید برای «${pl ? pl.name : ""}» را بفرستید:**\\n(برای پاک‌کردن بنویسید ندارد)`);
  }

  if (data.startsWith("remove_plan:")) {"""

# --- step handler ذخیره‌ی توضیح ---
OLD_STEP = """    admin_awaiting_plan_desc: async (v) => {"""
NEW_STEP = """    admin_edit_desc_only: async (v) => {
      const cat = state.meta.cat; const planId = state.meta.planId;
      const plans = await getPlans(env, cat);
      const idx = plans.findIndex((p) => p.id === planId);
      if (idx === -1) { await setState(env, chatId, null); return sendTelegram(config, chatId, "❌ محصول پیدا نشد."); }
      plans[idx].desc = v;
      await savePlans(env, cat, plans);
      await setState(env, chatId, null);
      return sendTelegram(config, chatId, `✅ توضیح «${escapeHtml(plans[idx].name)}» ذخیره شد.`, { inline_keyboard: [[{ text: "🔙 مدیریت محصولات", callback_data: `manage_cat:${cat}` }]] });
    },
    admin_awaiting_plan_desc: async (v) => {"""

CORE = [
    ("detail-screen", OLD_BUY, NEW_BUY),
    ("continue-handler", OLD_WALLET, NEW_WALLET),
    ("edit-desc-handler", OLD_REMOVE, NEW_REMOVE),
    ("desc-step", OLD_STEP, NEW_STEP),
]
OPTIONAL = [
    ("simple-list", OLD_LIST, NEW_LIST),
    ("invoice-unlimited", OLD_INV_U, ""),
    ("invoice-volume", OLD_INV_V, ""),
]


def apply_admin_button(txt):
    exact_old = """      rows.push([
        { text: `✏️ ویرایش ${p.name}`, callback_data: `edit_plan:${cat}:${p.id}` },
        { text: `❌ حذف`, callback_data: `remove_plan:${cat}:${p.id}` }
      ]);"""
    exact_new = """      rows.push([
        { text: `✏️ ویرایش ${p.name}`, callback_data: `edit_plan:${cat}:${p.id}` },
        { text: `📝 توضیح`, callback_data: `edit_desc:${cat}:${p.id}` },
        { text: `❌ حذف`, callback_data: `remove_plan:${cat}:${p.id}` }
      ]);"""
    if exact_old in txt:
        return txt.replace(exact_old, exact_new, 1), "exact"
    # fallback: هر بلوک rows.push که کالبک edit_plan را دارد (متن/ایموجی دکمه‌ها فرق کند هم مهم نیست)
    pat = re.compile(r"rows\.push\(\[(?:(?!\]\);).)*?edit_plan:\$\{cat\}:\$\{p\.id\}`(?:(?!\]\);).)*?\]\);", re.S)
    m = pat.search(txt)
    if not m:
        return None, None
    block = m.group(0)
    inner = block[: -len("]);")].rstrip()
    if inner.endswith("}"):
        inner += ","
    newblock = inner + "\n        { text: `📝 توضیح`, callback_data: `edit_desc:${cat}:${p.id}` }\n      ]);"
    return txt[: m.start()] + newblock + txt[m.end():], "regex"


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--app", default=os.environ.get("FOXBOT_APP", DEFAULT))
    a = ap.parse_args()
    if not os.path.exists(a.app):
        print("ERROR: not found:", a.app); return 1
    with open(a.app, "r", encoding="utf-8") as f:
        txt = f.read()

    if "buycont:" in txt and "admin_edit_desc_only" in txt:
        print("ALREADY PATCHED."); return 0

    missing = [n for n, o, _ in CORE if o not in txt]
    if missing:
        print("ERROR: missing core targets:", missing); return 2

    stamp = time.strftime("%Y%m%d-%H%M%S")
    bak = "%s.bak-buydetail-%s" % (a.app, stamp)
    shutil.copy2(a.app, bak)
    print("BACKUP:", bak)

    applied = []
    for n, o, nw in CORE:
        txt = txt.replace(o, nw, 1); applied.append(n)

    for n, o, nw in OPTIONAL:
        if o in txt:
            txt = txt.replace(o, nw, 1); applied.append(n)

    txt, how = apply_admin_button(txt)
    if txt is None:
        print("ERROR: manage_cat rows block not found (admin-desc-button).")
        print("rolled back automatically (backup untouched)."); return 3
    applied.append("admin-desc-button:" + how)

    tmp = a.app + ".buydetail.tmp.js"
    with open(tmp, "w", encoding="utf-8") as f:
        f.write(txt)
    chk = subprocess.run(["node", "--check", tmp], capture_output=True, text=True)
    if chk.returncode != 0:
        os.remove(tmp); print("SYNTAX FAILED -> rolled back."); print(chk.stderr[:400]); return 4
    os.replace(tmp, a.app)
    print("PATCHED OK:", ", ".join(applied))
    print("NEXT: systemctl restart foxteam-bot")
    print("rollback: cp %s %s" % (bak, a.app))
    return 0


if __name__ == "__main__":
    sys.exit(main())
