#!/usr/bin/env bash
# ════════════════════════════════════════════════════════════════
#  SCAN REFERRAL — نقشه کامل بخش زیرمجموعه/دعوت در bot.js
#  نسخه: 1.0 | 2026-08-22
#
#  همه خطوط مربوط به referral/زیرمجموعه/دعوت را با شماره خط و
#  چند خط اطرافش نشان می‌دهد تا پچ حذف دقیق نوشته شود.
#
#  اجرا:
#    bash scan-referral.sh            (روی سرور، توی /root/foxteam-bot)
#    FOXCOIN_DIR=/مسیر bash scan-referral.sh
# ════════════════════════════════════════════════════════════════
set -u
BOT_DIR="${FOXCOIN_DIR:-/root/foxteam-bot}"
BOT="$BOT_DIR/bot.js"
DIM='\033[2m'; X='\033[0m'

if [ ! -f "$BOT" ]; then
  echo "bot.js پیدا نشد: $BOT"
  exit 1
fi

echo "═══════════════════════════════════════════════"
echo "  اسکن بخش زیرمجموعه/دعوت — $(wc -l < "$BOT") خط"
echo "═══════════════════════════════════════════════"

# ۱) الگوهای اصلی
echo ""
echo "── ۱) خطوط دارای referral/ref ──"
grep -niE "referral|btn_ref|start=ref|ref_|inviter|invitee" "$BOT" | head -60

echo ""
echo "── ۲) خطوط فارسی «زیرمجموعه/دعوت» ──"
grep -niE "زیرمجموعه|دعوت|رفرال" "$BOT" | head -40

echo ""
echo "── ۳) آیا دکمه referral در منوی اصلی هست؟ ──"
grep -n "callback_data: \"referral\"" "$BOT"

echo ""
echo "── ۴) آیا مدیریت referral در منوی ارشد هست؟ ──"
grep -niE "admin_referral|referral_settings|referralSettings" "$BOT" | head -20

echo ""
echo "── ۵) خطوط /start و پردازش start=ref ──"
grep -n "start\b\|startPayload\|start_param\|ref=" "$BOT" | grep -iE "ref|start" | head -20

echo ""
echo "── ۶) اندازه فایل و تاریخ ──"
stat -c "اندازه: %s بایت | آخرین تغییر: %y" "$BOT"

echo ""
echo "────────────── راهنما ──────────────"
echo "  این خروجی را کامل برای من بفرست تا پچ حذف را"
echo "  بر اساس خطوط واقعی bot.js تو بنویسم."
