#!/usr/bin/env bash
# ════════════════════════════════════════════════════════════════
#  CHECK FOXCOIN — تشخیص وضعیت واقعی فایل‌های فاکس کوین روی سرور
#  نسخه: 1.0 | 2026-08-22
#
#  چه چیزی را چک می‌کند:
#    ۱. فایل‌های فاکس کوین در پوشه ربات هستند و نسخه‌شان چیست
#    ۲. آیا محتوای سرور با گیتهاب یکی است (hash)
#    ۳. bot.js واقعی سرویس از کجا اجرا می‌شود (ExecStart)
#    ۴. آیا bot.js خودش بخش زیرمجموعه/دعوت دارد
#
#  اجرا:
#    bash check-foxcoin.sh
# ════════════════════════════════════════════════════════════════
set -u
BASE="https://raw.githubusercontent.com/Wboyx/foxy1-agent/main/tools"
BOT_DIR="${FOXCOIN_DIR:-/root/foxteam-bot}"
RED='\033[31m'; GREEN='\033[32m'; YEL='\033[33m'; DIM='\033[2m'; X='\033[0m'

ok()   { echo -e "  ${GREEN}✅${X} $1"; }
bad()  { echo -e "  ${RED}❌${X} $1"; }
warn() { echo -e "  ${YEL}⚠️${X} $1"; }
info() { echo -e "  ${DIM}•${X} $1"; }

echo "═══════════════════════════════════════════════"
echo "  چک فاکس کوین — پوشه: $BOT_DIR"
echo "═══════════════════════════════════════════════"

if [ ! -d "$BOT_DIR" ]; then
  bad "پوشه $BOT_DIR وجود ندارد"
  exit 1
fi

echo ""
echo "── ۱) فایل‌ها و نسخه‌های محلی ──"
for f in foxcoin.js foxcoin-ui.js foxcoin-admin.js; do
  p="$BOT_DIR/$f"
  if [ ! -f "$p" ]; then
    bad "$f — پیدا نشد!"
    continue
  fi
  sz=$(stat -c%s "$p" 2>/dev/null || echo "?")
  v=$(head -6 "$p" | grep -oE "نسخه: [0-9.]+" | head -1)
  echo "  $f  ($sz بایت)  $v"
done

echo ""
echo "── ۲) مقایسه با گیتهاب (hash) ──"
for f in foxcoin.js foxcoin-ui.js foxcoin-admin.js; do
  p="$BOT_DIR/$f"
  [ -f "$p" ] || continue
  if ! curl -fsSL -o "/tmp/check-$f" "$BASE/$f" 2>/dev/null; then
    bad "$f — دانلود مرجع ممکن نشد"
    continue
  fi
  if cmp -s "/tmp/check-$f" "$p"; then
    ok "$f == گیتهاب (آخرین نسخه)"
  else
    warn "$f ≠ گیتهاب (قدیمی یا دست‌خورده)"
  fi
  rm -f "/tmp/check-$f"
done

echo ""
echo "── ۳) نشانه‌های نسخه جدید در فایل‌های محلی ──"
if grep -q "screenReferral" "$BOT_DIR/foxcoin-ui.js" 2>/dev/null; then
  bad "foxcoin-ui.js هنوز بخش دعوت دارد (نسخه قدیمی)"
else
  ok "foxcoin-ui.js بدون دکمه دعوت (نسخه جدید)"
fi
if grep -q "admin:rewards" "$BOT_DIR/foxcoin-admin.js" 2>/dev/null; then
  ok "foxcoin-admin.js دارای صفحه جوایز (نسخه جدید)"
else
  bad "foxcoin-admin.js صفحه جوایز ندارد (نسخه قدیمی)"
fi
if grep -q "REWARD_DEFAULTS" "$BOT_DIR/foxcoin.js" 2>/dev/null; then
  ok "foxcoin.js دارای جوایز فعالیت (نسخه جدید)"
else
  bad "foxcoin.js جوایز ندارد (نسخه قدیمی)"
fi

echo ""
echo "── ۴) سرویس از کدام bot.js اجرا می‌شود؟ ──"
systemctl cat foxteam-bot 2>/dev/null | grep -E "ExecStart|WorkingDirectory" || warn "سرویس foxteam-bot پیدا نشد (اسمش فرق دارد؟)"

echo ""
echo "── ۵) آیا bot.js خودش بخش زیرمجموعه/دعوت دارد؟ ──"
if [ -f "$BOT_DIR/bot.js" ]; then
  hits=$(grep -nE "زیرمجموعه|دعوت دوستان|start=ref|btn_ref|callback_data: ?\"ref" "$BOT_DIR/bot.js" | head -10)
  if [ -n "$hits" ]; then
    warn "بله — بخش دعوت داخل خود bot.js است (این را پچ جدا باید حذف کند):"
    echo "$hits" | sed 's/^/     /'
  else
    ok "bot.js بخش دعوت داخلی ندارد"
  fi
else
  bad "bot.js در $BOT_DIR نیست"
fi

echo ""
echo "── ۶) پچ‌های نصب‌شده در bot.js ──"
if [ -f "$BOT_DIR/bot.js" ]; then
  grep -q "coinAdmin" "$BOT_DIR/bot.js" && ok "پچ مدیریت نصب است" || bad "پچ مدیریت نصب نیست"
  grep -q "coinUI" "$BOT_DIR/bot.js" && ok "پچ کوین نصب است" || bad "پچ کوین نصب نیست"
fi

echo ""
echo "────────────── راهنما ──────────────"
echo "  اگر فایل‌ها ≠ گیتهاب هستند، دوباره دانلود کن:"
echo "    curl -fsSL -o foxcoin.js       $BASE/foxcoin.js"
echo "    curl -fsSL -o foxcoin-ui.js    $BASE/foxcoin-ui.js"
echo "    curl -fsSL -o foxcoin-admin.js $BASE/foxcoin-admin.js"
echo "  و بعد: systemctl restart foxteam-bot"
echo ""
echo "  اگر bot.js خودش بخش دعوت دارد، خروجی بخش ۵ را برای من بفرست"
echo "  تا پچ حذف آن را دقیق بنویسم."
