#!/usr/bin/env bash
# =====================================================================
# Foxy1 Failover Drill — تست واقعی جابه‌جایی خودکار مسیر
# Fox Auto host | 2026-08-19
#
# چه می‌کند:
#   1. از فایل محیط بکاپ می‌گیرد
#   2. مسیر را عمداً روی یک آدرس ساختگی می‌گذارد
#   3. نگهبان را صدا می‌زند تا خودش تشخیص دهد و برگرداند
#   4. نتیجه را بررسی می‌کند
#   5. اگر نگهبان موفق نبود، خودش مسیر سالم قبلی را برمی‌گرداند
#
# در هر حالت، در پایان ربات روی یک مسیر سالم خواهد بود.
# =====================================================================
set -u

APP_ENV="/root/foxteam-bot/.env"
SERVICE="foxteam-bot"
GUARD="/opt/foxy1-relay-guard/guard.sh"
STATE="/opt/foxy1-relay-guard/state"
FAKE="https://broken-path-drill-9911.vercel.app"
STAMP="$(date +%Y%m%d-%H%M%S)"
BAK="/root/drill-backups/$STAMP"

red() { printf "\033[31m%s\033[0m\n" "$1"; }
grn() { printf "\033[32m%s\033[0m\n" "$1"; }
ylw() { printf "\033[33m%s\033[0m\n" "$1"; }
hr()  { echo "======================================================"; }

[ -f "$APP_ENV" ] || { red "فایل محیط پیدا نشد."; exit 1; }
[ -x "$GUARD" ]   || { red "نگهبان نصب نیست."; exit 1; }

mkdir -p "$BAK"; chmod 700 "$BAK"
cp -a "$APP_ENV" "$BAK/.env.bak"; chmod 600 "$BAK/.env.bak"

ORIG="$(grep -E '^TG_API_BASE=' "$APP_ENV" | head -1 | cut -d= -f2- | tr -d '"'"'"' ')"

restore() {
  cp -a "$BAK/.env.bak" "$APP_ENV"; chmod 600 "$APP_ENV"
  systemctl restart "$SERVICE"; sleep 6
  ylw "مسیر اولیه برگردانده شد: $ORIG"
}

hr; echo " مرحله ۱ — وضعیت اولیه"; hr
echo "مسیر فعلی:"; echo "  $ORIG"
echo "بکاپ:"; echo "  $BAK/.env.bak"

hr; echo " مرحله ۲ — خراب‌کردن عمدی مسیر"; hr
# حذف فاصله ضدنوسان تا نگهبان بتواند همین حالا تصمیم بگیرد
rm -f "$STATE"
sed -i "s|^TG_API_BASE=.*|TG_API_BASE=$FAKE|" "$APP_ENV"
systemctl restart "$SERVICE"
sleep 5
echo "مسیر جدید (ساختگی):"
grep '^TG_API_BASE=' "$APP_ENV" | sed 's/^/  /'
ylw "ربات الان عملاً بی‌مسیر است. این وضعیت موقت و کنترل‌شده است."

hr; echo " مرحله ۳ — فراخوانی نگهبان"; hr
VERBOSE=1 "$GUARD" check
RC=$?
echo "کد خروج نگهبان: $RC"

hr; echo " مرحله ۴ — بررسی نتیجه"; hr
FINAL="$(grep -E '^TG_API_BASE=' "$APP_ENV" | head -1 | cut -d= -f2- | tr -d '"'"'"' ')"
echo "مسیر نهایی:"; echo "  $FINAL"
echo "وضعیت سرویس:"; echo "  $(systemctl is-active $SERVICE)"

if [ "$FINAL" = "$FAKE" ]; then
  red "نگهبان مسیر را برنگرداند. در حال بازگشت دستی..."
  restore
  hr; red " نتیجه تست: ناموفق"; hr
  echo "لاگ نگهبان:"
  tail -n 15 /var/log/foxy1-relay-guard.log | sed 's/^/  /'
  exit 1
fi

# تست واقعی پاسخ تلگرام روی مسیر نهایی
TOKEN="$(grep -E '^BOT_TOKEN=' "$APP_ENV" | head -1 | cut -d= -f2- | tr -d '"'"'"' ')"
OKBODY="$(timeout 20 curl -s --max-time 15 "${FINAL%/}/bot${TOKEN}/getMe" 2>/dev/null | grep -o '"ok":true')"

if [ -n "$OKBODY" ] && systemctl is-active --quiet "$SERVICE"; then
  hr; grn " نتیجه تست: موفق"; hr
  echo "نگهبان خرابی را تشخیص داد و ربات را روی مسیر سالم برگرداند."
  echo "مسیر نهایی:"; echo "  $FINAL"
  echo "بکاپ تست:"; echo "  $BAK/.env.bak"
  echo
  echo "لاگ نگهبان:"
  tail -n 8 /var/log/foxy1-relay-guard.log | sed 's/^/  /'
  exit 0
fi

red "مسیر عوض شد ولی تست نهایی پاسخ نداد. در حال بازگشت به مسیر اولیه..."
restore
exit 1
