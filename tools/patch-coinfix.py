#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
patch-coinfix.py — فیکس فاکسی‌کوین (۶ اصلاح روی bot.js / foxcoin.js / foxcoin-admin.js)

۱) سرعت: کش دفتر رویداد (readLedger) — قبلاً هر ضربه چند بار کل فایل را می‌خواند.
۲) شارژ با یوزرنیم: دکمه «🔎 یافتن با یوزرنیم» در کاربران + نگاشت uname در ربات.
۳) هوک متن ادمین: خروجی شیء routeText (مثل یافتن کاربر/پلن) حالا واقعاً ناوبری می‌کند.
۴) تمدید هم کوین می‌سازد (مثل خرید) — طبق اقتصاد مصوب.
۵) دکمه‌های مرده دیگر خاموش نیستند: کالبک ناشناخته لاگ + گزارش به ادمین.
۶) env به routeText تزریق می‌شود (برای جست‌وجوی uname).

ایمن: بکاپ + node --check هر سه فایل + rollback.
کاربرد: python3 patch-coinfix.py --dir /مسیر/foxteam-bot
"""
import argparse, os, shutil, subprocess, sys, time

REPL = []

# ─────────────── bot.js ───────────────
REPL.append(("bot.js", "admin-config",
"""    adminChatId: process.env.ADMIN_CHAT_ID || \"\",""",
"""    adminChatId: process.env.ADMIN_CHAT_ID || \"\",
    admins: [process.env.ADMIN_CHAT_ID || \"\"],"""))

REPL.append(("bot.js", "uname-cache-decl",
"""const env = { STORE_KV: db };""",
"""const env = { STORE_KV: db };
const _unameCache = new Map();"""))

REPL.append(("bot.js", "uname-record",
"""async function handleMessage(message, env, config) {
  const chatId = message.chat.id;
  const userId = message.from.id;
  const text = (message.text || "").trim();""",
"""async function handleMessage(message, env, config) {
  const chatId = message.chat.id;
  const userId = message.from.id;
  if (message.from && message.from.username) {
    const _un = String(message.from.username).toLowerCase();
    if (_unameCache.get(String(userId)) !== _un) {
      _unameCache.set(String(userId), _un);
      env.STORE_KV.put("uname:" + _un, String(userId)).catch(() => {});
    }
  }
  const text = (message.text || "").trim();"""))

REPL.append(("bot.js", "routetext-object",
"""    let saved = false;
    try { saved = await coinAdmin.routeText({ uid: userId, config: config, text: String(text || "") }); } catch (e) { saved = false; }
    await setState(env, userId, null);
    return sendTelegram(config, chatId, saved ? "✅ متن ذخیره شد." : "❌ متن ذخیره نشد. کاراکتر < یا > مجاز نیست.", { inline_keyboard: [[{ text: "📝 متن‌ها", callback_data: "admin:texts" }]] });""",
"""    let saved = false;
    try { saved = await coinAdmin.routeText({ uid: userId, config: config, env: env, text: String(text || "") }); } catch (e) { saved = false; }
    await setState(env, userId, null);
    if (saved && typeof saved === "object") {
      if (saved.next) {
        await coinAdmin.route({ env: env, getPlans: (e, cat) => getPlans(e, cat), deliverService: (e, c, uid, o) => deliverService(e, c, uid, o), config: config, chatId: chatId, messageId: message.message_id, uid: userId, data: saved.next, botUsername: (config.botUsername || ""), editTelegram: editTelegram }).catch(() => {});
        return;
      }
      return sendTelegram(config, chatId, saved.message || "❌ انجام نشد.", { inline_keyboard: [[{ text: "👥 کاربران", callback_data: "admin:users" }]] });
    }
    return sendTelegram(config, chatId, saved ? "✅ متن ذخیره شد." : "❌ متن ذخیره نشد. کاراکتر < یا > مجاز نیست.", { inline_keyboard: [[{ text: "📝 متن‌ها", callback_data: "admin:texts" }]] });"""))

REPL.append(("bot.js", "renewal-coins",
"""    const result = await executeRenewal(env, config, { ...meta, userId: String(userId) });""",
"""    const result = await executeRenewal(env, config, { ...meta, userId: String(userId) });
    try { coinCore.onReferralPurchase(String(userId), Number(meta.amount) || 0); } catch (e) {}
    try { coinCore.onPurchase(String(userId), Number(meta.amount) || 0, { desc: "تمدید" }); } catch (e) {}"""))

REPL.append(("bot.js", "unknown-cb-fallback",
"""    await setState(env, userId, { step: "admin_awaiting_plan_desc", meta: { ...st.meta, inbounds: chosenInbounds } });
    return editTelegram(config, chatId, cb.message.message_id, `📝 توضیحات (یا بنویسید ندارد):`);
  }
}""",
"""    await setState(env, userId, { step: "admin_awaiting_plan_desc", meta: { ...st.meta, inbounds: chosenInbounds } });
    return editTelegram(config, chatId, cb.message.message_id, `📝 توضیحات (یا بنویسید ندارد):`);
  }

  console.log("⚠️ UNKNOWN CB:", data);
  if (isAdmin(userId, config)) {
    return sendTelegram(config, chatId, `🔧 این دکمه هنوز وصل نیست:\\n<code>${escapeHtml(data)}</code>\\nاسکرین‌شات همین پیام را برای توسعه‌دهنده بفرست.`);
  }
}"""))

# ─────────────── foxcoin.js ───────────────
REPL.append(("foxcoin.js", "ledger-cache",
"""function appendLedger(rec) {
  ensureDir();
  fs.appendFileSync(LEDGER, JSON.stringify(rec) + '\\n', 'utf8');
}

function readLedger() {
  try {
    return fs.readFileSync(LEDGER, 'utf8')
      .split('\\n').filter(Boolean).map(l => JSON.parse(l));
  } catch (e) {
    return [];
  }
}""",
"""let _ledCache = null;
let _ledSize = -1;
let _ledCheck = 0;

function appendLedger(rec) {
  ensureDir();
  const line = JSON.stringify(rec) + '\\n';
  fs.appendFileSync(LEDGER, line, 'utf8');
  if (_ledCache) {
    _ledCache.push(rec);
    _ledSize += Buffer.byteLength(line, 'utf8');
  }
}

/** کش درحافظه + بازخوانی فقط وقتی فایل عوض شده (هر ۵ ثانیه چک سبک). */
function readLedger() {
  const now = Date.now();
  if (_ledCache && now - _ledCheck < 5000) return _ledCache;
  _ledCheck = now;
  let st = null;
  try { st = fs.statSync(LEDGER); } catch (e) { if (!_ledCache) _ledCache = []; return _ledCache; }
  if (_ledCache && st.size === _ledSize) return _ledCache;
  _ledSize = st.size;
  try {
    _ledCache = fs.readFileSync(LEDGER, 'utf8')
      .split('\\n').filter(Boolean).map(l => JSON.parse(l));
  } catch (e) {
    if (!_ledCache) _ledCache = [];
  }
  return _ledCache;
}"""))

# ─────────────── foxcoin-admin.js ───────────────
REPL.append(("foxcoin-admin.js", "ufind-button",
"""  rows.push([{ text: T.allUsers, callback_data: 'admin:allusers:0' }]);""",
"""  rows.push([{ text: '🔎 یافتن با یوزرنیم', callback_data: 'admin:ufind' }]);
  rows.push([{ text: T.allUsers, callback_data: 'admin:allusers:0' }]);"""))

REPL.append(("foxcoin-admin.js", "ufind-route",
"""  else if (d2 === 'admin:users') s = screenUsers();""",
"""  else if (d2 === 'admin:users') s = screenUsers();
  else if (d2 === 'admin:ufind') {
    pendingEdits.set(String(ctx.uid), { kind: 'uname', at: Date.now(),
      prompt: '🔎 یوزرنیم کاربر را بفرست (با @ یا بدون آن).\\n' +
              '<i>کاربر باید دست‌کم یک‌بار به ربات پیام داده باشد.</i>' });
    return true;
  }"""))

REPL.append(("foxcoin-admin.js", "uname-routetext",
"""    coin.setMission(Object.assign({}, m, { title: title }));
    clearPending(uid);
    return true;
  }""",
"""    coin.setMission(Object.assign({}, m, { title: title }));
    clearPending(uid);
    return true;
  }

  // یافتن کاربر با یوزرنیم تلگرام (نگاشت uname: که ربات نگه می‌دارد)
  if (pending.kind === 'uname') {
    const clean = text.replace(/^@/, '').trim().toLowerCase().replace(/[^a-z0-9_]/g, '');
    if (!clean) return false;
    let target = null;
    try { target = ctx.env && await ctx.env.STORE_KV.get('uname:' + clean); } catch (e) {}
    if (!target) {
      clearPending(uid);
      return { next: null, message: '❌ کاربری با یوزرنیم @' + clean + ' پیدا نشد.\\n(کاربر باید دست‌کم یک‌بار به ربات پیام داده باشد.)' };
    }
    clearPending(uid);
    return { next: 'admin:user:' + target };
  }"""))


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--dir", required=True, help="مسیر پوشه foxteam-bot")
    a = ap.parse_args()
    files = {}
    for name in ("bot.js", "foxcoin.js", "foxcoin-admin.js"):
        p = os.path.join(a.dir, name)
        if not os.path.exists(p):
            print("ERROR: not found:", p); return 1
        files[name] = open(p, "r", encoding="utf-8").read()

    stamp = time.strftime("%Y%m%d-%H%M%S")
    baks = []
    applied = []
    for fname, label, old, new in REPL:
        if old not in files[fname]:
            print("ERROR: missing target %s in %s" % (label, fname)); return 2
    for fname in files:
        bak = "%s.bak-coinfix-%s" % (os.path.join(a.dir, fname), stamp)
        shutil.copy2(os.path.join(a.dir, fname), bak)
        baks.append(bak)
    for fname, label, old, new in REPL:
        files[fname] = files[fname].replace(old, new, 1)
        applied.append("%s:%s" % (fname, label))

    tmps = []
    for fname, txt in files.items():
        tmp = os.path.join(a.dir, fname + ".coinfix.tmp.js")
        open(tmp, "w", encoding="utf-8").write(txt)
        tmps.append((fname, tmp))
        chk = subprocess.run(["node", "--check", tmp], capture_output=True, text=True)
        if chk.returncode != 0:
            for _, t in tmps:
                if os.path.exists(t): os.remove(t)
            print("SYNTAX FAILED in", fname); print(chk.stderr[:400]); return 3
    for fname, tmp in tmps:
        os.replace(tmp, os.path.join(a.dir, fname))
    print("PATCHED OK:", ", ".join(applied))
    print("backups:", ", ".join(baks))
    return 0


if __name__ == "__main__":
    sys.exit(main())
