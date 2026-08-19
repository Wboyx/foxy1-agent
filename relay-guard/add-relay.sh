#!/usr/bin/env bash
# =====================================================================
# افزودن یک مسیر جدید به فهرست نگهبان — Foxy1 Relay Guard
# استفاده:
#   bash add-relay.sh https://NAME.vercel.app
#
# کار این اسکریپت:
#   1. مسیر جدید را با getMe از داخل همین سرور تست می‌کند
#   2. اگر سالم بود، به فهرست اضافه می‌کند (بدون تکرار)
#   3. فایل محیط ربات را دست نمی‌زند و سرویس را ری‌استارت نمی‌کند
# =====================================================================
set -u
NEW="${1:-}"
DIR="/opt/foxy1-relay-guard"
RELAYS="$DIR/relays.conf"
APP_ENV="/root/foxteam-bot/.env"

red() { printf "\033[31m%s\033[0m\n" "$1"; }
grn() { printf "\033[32m%s\033[0m\n" "$1"; }

[ -n "$NEW" ] || { red "آدرس داده نشده."; echo "نمونه:"; echo "  bash add-relay.sh https://NAME.vercel.app"; exit 1; }
NEW="${NEW%/}"
[ -f "$RELAYS" ] || { red "فهرست مسیرها پیدا نشد: $RELAYS"; exit 1; }
[ -f "$APP_ENV" ] || { red "فایل محیط پیدا نشد: $APP_ENV"; exit 1; }

TOKEN="$(grep -E '^BOT_TOKEN=' "$APP_ENV" | head -1 | cut -d= -f2- | tr -d '"'"'"' ')"
[ -n "$TOKEN" ] || { red "BOT_TOKEN پیدا نشد."; exit 1; }

if grep -qxF "$NEW" "$RELAYS"; then
  grn "این مسیر از قبل در فهرست هست."
  exit 0
fi

echo "تست مسیر جدید (سه بار):"
OK=0
for i in 1 2 3; do
  R="$(timeout 18 curl -s --max-time 15 -w '\n%{http_code} %{time_total}' "$NEW/bot$TOKEN/getMe" 2>/dev/null)"
  C="$(echo "$R" | tail -1 | awk '{print $1}')"; T="$(echo "$R" | tail -1 | awk '{print $2}')"
  if echo "$R" | head -n -1 | grep -q '"ok":true'; then
    OK=$((OK+1)); grn "  تست $i: موفق  کد=$C زمان=${T}s"
  else
    red "  تست $i: ناموفق کد=${C:-000} زمان=${T:-0}s"
  fi
  sleep 1
done

if [ "$OK" -lt 2 ]; then
  red "مسیر جدید قابل اعتماد نیست. به فهرست اضافه نشد."
  exit 1
fi

cp -a "$RELAYS" "${RELAYS}.bak-$(date +%Y%m%d-%H%M%S)"
printf '%s\n' "$NEW" >> "$RELAYS"
chmod 600 "$RELAYS"
grn "مسیر جدید به فهرست اضافه شد."
echo
echo "فهرست فعلی:"
grep -vE '^\s*(#|$)' "$RELAYS" | sed 's/^/  /'
echo
echo "برای دیدن وضعیت کامل:"
echo "  /opt/foxy1-relay-guard/guard.sh status"
