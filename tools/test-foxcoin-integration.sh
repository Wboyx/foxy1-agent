#!/usr/bin/env bash
# ════════════════════════════════════════════════════════════════
#  تست یکپارچه فاکس کوین — جریان واقعی روی bot.js وصله‌خورده
#  نسخه: 1.0 | 2026-08-22
#
#  چرا این تست:
#    نسخه ۱.۰ پچ مدیریت، بلوک admin را داخل بلوک coin می‌گذاشت؛
#    دکمه مدیریت در ربات واقعی ظاهر می‌شد ولی هیچ‌وقت کار نمی‌کرد
#    و باگ با تست‌های ماژول (که route را مستقیم صدا می‌زنند) پیدا
#    نمی‌شد. این تست کل مسیر را شبیه‌سازی می‌کند: استاب bot.js
#    (همان ساختار بعد از patch-foxcoin.py)، اعمال پچ واقعی، و
#    اجرای onCallback با داده‌های admin/coin/ناشناخته.
#
#  استفاده:
#    bash test-foxcoin-integration.sh
# ════════════════════════════════════════════════════════════════
set -euo pipefail
cd "$(dirname "$0")"

DIR=$(mktemp -d)
trap 'rm -rf "$DIR"' EXIT

cp foxcoin.js foxcoin-ui.js foxcoin-admin.js "$DIR/"
mkdir -p "$DIR/bk"

cat > "$DIR/config.json" <<'EOF'
{ "token": "123:test", "botUsername": "TestBot", "admins": ["111"] }
EOF

# استاب bot.js — وضعیت دقیق بعد از patch-foxcoin.py (بلوک coin، بدون ادمین)
cat > "$DIR/bot.js" <<'EOF'
'use strict';
const config = require('./config.json');
const coinUI = require('./foxcoin-ui');

global.__sent = [];

async function editTelegram(config, chatId, messageId, text, markup) {
  global.__sent.push({ text: text, markup: markup });
  return { ok: true };
}

function mainMenu() {
  return {
    text: 'منوی اصلی',
    reply_markup: { inline_keyboard: [
      [{ text: L.btn_referral, callback_data: "referral" }],
      [{ text: coinUI.MENU_BUTTON.text, callback_data: "coin" }],
    ]},
  };
}

async function onCallback(cb) {
  const data = cb.data || '';
  const chatId = cb.message.chat.id;
  const userId = cb.from.id;
  if (data === "ignore") return;
    if (data === "coin" || data.startsWith("coin:")) {
      const handledByCoin = await coinUI.route({
        config: config, chatId: chatId,
        messageId: cb.message.message_id, uid: userId,
        data: data, botUsername: (config.botUsername || ""),
        editTelegram: editTelegram });
      if (handledByCoin) return;
    }
  await editTelegram(config, chatId, cb.message.message_id, 'ناشناخته', null);
}
module.exports = { onCallback };
EOF

# اعمال پچ (نسخه فعلی)
FOXCOIN_BOT="$DIR/bot.js" FOXCOIN_BACKUP_DIR="$DIR/bk" \
  python3 patch-foxcoin-admin.py --apply > "$DIR/patch.log"
node --check "$DIR/bot.js"

cat > "$DIR/run.js" <<'EOF'
const bot = require('./bot.js');
const assert = require('assert');
const cb = (data, uid) => ({ data: data, from: { id: uid },
                             message: { chat: { id: 1 }, message_id: 2 } });
const last = () => global.__sent[global.__sent.length - 1];

(async () => {
  // ادمین → منوی مدیریت باید باز شود
  await bot.onCallback(cb('admin', '111'));
  assert(last().text.includes('مدیریت فاکس کوین'), 'admin: منوی مدیریت باز نشد');
  assert(JSON.stringify(last().markup).includes('admin:stats'), 'admin: دکمه آمار نیست');

  // فاکس شاپ در پنل
  await bot.onCallback(cb('admin:products', '111'));
  assert(JSON.stringify(last().markup).includes('admin:shopstatus'),
         'admin: سوئیچ باز/بسته فروشگاه نیست');

  // غیرادمین → درِ بسته
  await bot.onCallback(cb('admin', '222'));
  assert(last().text.includes('فقط برای مدیریت'), 'admin: غیرادمین درِ بسته نگرفت');

  // مسیر coin همچنان سالم است
  await bot.onCallback(cb('coin', '111'));
  assert(last().text.includes('فاکس کوین'), 'coin: منوی کوین باز نشد');

  // مسیر ناشناخته به fallback می‌رود
  await bot.onCallback(cb('xyz', '111'));
  assert(last().text === 'ناشناخته', 'xyz: fallback اجرا نشد');

  console.log('✅ تست یکپارچه: admin / فاکس شاپ / coin / fallback همه سالم‌اند');
})().catch(e => { console.log('❌ ' + e.message); process.exit(1); });
EOF

node "$DIR/run.js"

# برگشت و اعمال دوباره هم باید سالم باشد
FOXCOIN_BOT="$DIR/bot.js" FOXCOIN_BACKUP_DIR="$DIR/bk" \
  python3 patch-foxcoin-admin.py --revert > /dev/null
node --check "$DIR/bot.js"
FOXCOIN_BOT="$DIR/bot.js" FOXCOIN_BACKUP_DIR="$DIR/bk" \
  python3 patch-foxcoin-admin.py --apply > /dev/null
node "$DIR/run.js"

echo "✅ تست یکپارچه کامل شد (اعمال + revert + اعمال دوباره)"
