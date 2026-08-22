#!/usr/bin/env bash
# ════════════════════════════════════════════════════════════════
#  تست انتقال دکمه مدیریت فاکس کوین به منوی مدیریت ارشد
#  نسخه: 1.0 | 2026-08-22
#
#  ساختار bot.js واقعی از مخزن for-mehti/foxteam-bot گرفته شده و
#  وضعیت «بعد از وصله‌های فاکس کوین» شبیه‌سازی می‌شود:
#    - require ماژول‌های فاکس کوین
#    - دکمه کوین و دکمه مدیریت در منوی اصلی
#    - شاخه‌های مسیریاب coin و admin
#  سپس move-foxcoin-admin.py اعمال و بررسی می‌شود.
# ════════════════════════════════════════════════════════════════
set -euo pipefail
cd "$(dirname "$0")"

SRC_BOT=""
for cand in /home/user/repos/_ref/foxteam-bot/bot.js \
            ../_ref/foxteam-bot/bot.js \
            ../../_ref/foxteam-bot/bot.js \
            ../for-mehti/foxteam-bot/bot.js \
            ../../for-mehti/foxteam-bot/bot.js; do
  [ -f "$cand" ] && SRC_BOT="$cand" && break
done
if [ -z "$SRC_BOT" ]; then
  echo "❌ bot.js مرجع پیدا نشد (for-mehti/foxteam-bot)"
  exit 1
fi

DIR=$(mktemp -d)
trap 'rm -rf "$DIR"' EXIT
cp foxcoin.js foxcoin-ui.js foxcoin-admin.js "$DIR/"
mkdir -p "$DIR/bk"

# bot.js — وضعیت بعد از patch-foxcoin.py + patch-foxcoin-admin.py
python3 - "$SRC_BOT" "$DIR/bot.js" <<'EOF'
import re, sys
src = open(sys.argv[1], encoding='utf-8').read()

# ۱) require ماژول‌ها بعد از آخرین require
last_req = src.rfind('require(')
end = src.index(';', last_req) + 1
src = src[:end] + "\nconst coinUI = require('./foxcoin-ui');\nconst coinAdmin = require('./foxcoin-admin');" + src[end:]

# ۲) دکمه‌های کوین و مدیریت در منوی اصلی (بعد از ردیف پشتیبانی)
anchor = '[{ text: L.btn_support, callback_data: "support" }]'
assert src.count(anchor) == 1, 'anchor support'
i = src.index(anchor) + len(anchor)
src = src[:i] + ",\n    [{ text: coinUI.MENU_BUTTON.text, callback_data: \"coin\" }],\n    [{ text: coinAdmin.T.title, callback_data: \"admin\" }]," + src[i:]

# ۳) شاخه‌های مسیریاب بعد از ignore
anchor2 = 'if (data === "ignore") return;'
assert src.count(anchor2) == 1, 'anchor ignore'
j = src.index(anchor2) + len(anchor2)
branch = (
  '\n    if (data === "coin" || data.startsWith("coin:")) {\n'
  '      const handledByCoin = await coinUI.route({\n'
  '        config: config, chatId: chatId,\n'
  '        messageId: cb.message.message_id, uid: userId,\n'
  '        data: data, botUsername: (config.botUsername || ""),\n'
  '        editTelegram: editTelegram });\n'
  '      if (handledByCoin) return;\n'
  '    }\n'
  '    if (data === "admin" || data.startsWith("admin:")) {\n'
  '      const handledByAdmin = await coinAdmin.route({\n'
  '        config: config, chatId: chatId,\n'
  '        messageId: cb.message.message_id, uid: userId,\n'
  '        data: data, botUsername: (config.botUsername || ""),\n'
  '        editTelegram: editTelegram });\n'
  '      if (handledByAdmin) return;\n'
  '    }'
)
src = src[:j] + branch + src[j:]
open(sys.argv[2], 'w', encoding='utf-8').write(src)
EOF

echo "── وضعیت اولیه (شبیه‌سازی سرور) ──"
grep -c "coinAdmin.T.title" "$DIR/bot.js"
node --check "$DIR/bot.js" && echo "syntax OK"

echo ""
echo "── اعمال انتقال ──"
FOXCOIN_BOT="$DIR/bot.js" FOXCOIN_BACKUP_DIR="$DIR/bk" \
  python3 move-foxcoin-admin.py --apply

echo ""
echo "── بررسی نتیجه ──"
node --check "$DIR/bot.js" && echo "syntax OK"
# دکمه در منوی اصلی نباید باشد
if grep -q "coinAdmin.T.title" <(sed -n '/^async function mainMenu/,/^}/p' "$DIR/bot.js"); then
  echo "❌ دکمه هنوز در منوی اصلی است"
  exit 1
fi
echo "✅ دکمه از منوی اصلی حذف شد"
# دکمه داخل بلاک admin_settings باشد
if grep -q "coinAdmin.T.title" <(sed -n '/if (data === "admin_settings") {/,/^  }/p' "$DIR/bot.js"); then
  echo "✅ دکمه در منوی مدیریت ارشد اضافه شد"
else
  echo "❌ دکمه در منوی مدیریت ارشد نیست"
  exit 1
fi

echo ""
echo "── اجرای دوباره (باید بگوید قبلاً منتقل شده) ──"
FOXCOIN_BOT="$DIR/bot.js" FOXCOIN_BACKUP_DIR="$DIR/bk" \
  python3 move-foxcoin-admin.py --apply | grep -E "قبلاً|منتقل"

echo ""
echo "── برگشت (revert) ──"
FOXCOIN_BOT="$DIR/bot.js" FOXCOIN_BACKUP_DIR="$DIR/bk" \
  python3 move-foxcoin-admin.py --revert
node --check "$DIR/bot.js" && echo "syntax OK"

echo ""
echo "✅ تست انتقال کامل شد"
