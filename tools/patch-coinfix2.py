#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
patch-coinfix2.py — ویرایش متن‌ها بدون باگ + تمیزی فاکسی‌کوین.

۱) ویرایش متن‌های ربات اصلی مثل ویرایش توضیح: متن فعلی + دکمه شیشه‌ای انصراف
   + تأیید ذخیره با «ویرایش دوباره».
۲) ویرایش متن‌های کوین: بعد از ذخیره، همان صفحه‌ی ویرایش با متنِ نو باز می‌شود
   (تأیید ضمنی) و پیام دوبله حذف می‌شود (prompt/null).
۳) بلوک pending در ربات: فقط وقتی prompt دارد پیام جدا می‌فرستد (رفع ارسال undefined).

ایمن: بکاپ + node --check + rollback.
کاربرد: python3 patch-coinfix2.py --dir /مسیر/foxteam-bot
"""
import argparse, os, shutil, subprocess, sys, time

REPL = []

REPL.append(("bot.js", "main-text-editor",
"""  if (data.startsWith("edit_text:")) {
    const key = data.split(":")[1];
    await setState(env, userId, { step: "awaiting_admin_text", textKey: key });
    return editTelegram(config, chatId, cb.message.message_id, `متن جدید برای <code>${key}</code>:`, { inline_keyboard: [[{ text: "🔙 انصراف", callback_data: "admin_texts" }]] });
  }""",
"""  if (data.startsWith("edit_text:")) {
    const key = data.split(":")[1];
    const label = (EDITABLE_TEXT_KEYS.find((t) => t.key === key) || {}).label || key;
    const cur = await getCustomText(env, key);
    await setState(env, userId, { step: "awaiting_admin_text", textKey: key });
    return editTelegram(config, chatId, cb.message.message_id, `📝 <b>${label}</b>\\n━━━━━━━━━━━━━━\\n<b>متن فعلی:</b>\\n${escapeHtml(cur)}\\n━━━━━━━━━━━━━━\\n✏️ <b>متن جدید را به‌صورت پیام بفرستید:</b>\\n<i>برای بازگشت بدون تغییر، روی انصراف بزنید.</i>`, { inline_keyboard: [[{ text: "🔙 انصراف", callback_data: "admin_texts" }]] });
  }"""))

REPL.append(("bot.js", "main-text-saved",
"""  if (state.step === "awaiting_admin_text" && isAdmin(userId, config)) {
    await env.STORE_KV.put(`text:${state.textKey}`, text);
    await setState(env, chatId, null);
    return sendTelegram(config, chatId, `✅ متن ذخیره شد.`, { inline_keyboard: [[{ text: "🔙 بازگشت", callback_data: "admin_texts" }]] });
  }""",
"""  if (state.step === "awaiting_admin_text" && isAdmin(userId, config)) {
    await env.STORE_KV.put(`text:${state.textKey}`, text);
    await setState(env, chatId, null);
    return sendTelegram(config, chatId, `✅ متن ذخیره شد و از این لحظه برای مشتری‌ها نمایش داده می‌شود.`, { inline_keyboard: [[{ text: "📝 ویرایش دوباره", callback_data: `edit_text:${state.textKey}` }], [{ text: "🔙 فهرست متن‌ها", callback_data: "admin_texts" }]] });
  }"""))

REPL.append(("bot.js", "pending-prompt-guard",
"""      const _coinPending = coinAdmin.pendingText(userId);
      if (_coinPending) {
        try { await setState(env, userId, { step: "coin_admin_awaiting_text" }); } catch (e) {}
        return sendTelegram(config, chatId, _coinPending.prompt, { inline_keyboard: [[{ text: "🔙 انصراف", callback_data: "admin:tcancel" }]] });
      }""",
"""      const _coinPending = coinAdmin.pendingText(userId);
      if (_coinPending) {
        try { await setState(env, userId, { step: "coin_admin_awaiting_text" }); } catch (e) {}
        if (_coinPending.prompt) return sendTelegram(config, chatId, _coinPending.prompt, { inline_keyboard: [[{ text: "🔙 انصراف", callback_data: "admin:tcancel" }]] });
      }"""))

REPL.append(("foxcoin-admin.js", "text-reopen-editor",
"""  try {
    coin.setText(pending.key, text);
  } catch (e) {
    return false;
  }
  clearPending(uid);
  return true;""",
"""  try {
    coin.setText(pending.key, text);
  } catch (e) {
    return false;
  }
  clearPending(uid);
  return { next: 'admin:tedit:' + pending.key };"""))

REPL.append(("foxcoin-admin.js", "no-double-prompt",
"""  pendingEdits.set(String(uid), {
    key: key, at: Date.now(),
    prompt: '📝 ' + label + ' — متن جدید را بفرست.\\n' +
            '<i>فعلی: ' + previewText(cur, 80) + '</i>',
  });""",
"""  pendingEdits.set(String(uid), {
    key: key, at: Date.now(), prompt: null,
  });"""))


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
        bak = "%s.bak-coinfix2-%s" % (os.path.join(a.dir, name), stamp)
        shutil.copy2(os.path.join(a.dir, name), bak); baks.append(bak)

    applied = []
    for f, l, o, n in REPL:
        files[f] = files[f].replace(o, n, 1); applied.append("%s:%s" % (f, l))

    tmps = []
    for f, txt in files.items():
        tmp = os.path.join(a.dir, f + ".coinfix2.tmp.js")
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
