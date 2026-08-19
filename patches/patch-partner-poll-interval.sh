#!/usr/bin/env bash
# =====================================================================
# Fox Auto host — کاهش مصرف حلقه همکاران
# 2026-08-19
#
# مسئله:
#   حلقه internal/relay/next وقتی کاری نیست، فقط نیم ثانیه صبر می‌کند.
#   نتیجه: حدود ۸۰ هزار درخواست در روز به Worker کلادفلر و رسیدن به
#   ۹۵ درصد سقف رایگان روزانه.
#
# راه‌حل:
#   فاصله انتظار قابل تنظیم می‌شود و پیش‌فرضش چهار ثانیه است.
#   مصرف حدود ۸۷ درصد کم می‌شود و تأخیر فرمان‌ها حداکثر چهار ثانیه.
#
# ایمنی:
#   بکاپ، بررسی Syntax، جابه‌جایی اتمی، ری‌استارت کنترل‌شده،
#   بررسی واقعی long polling، بازگشت خودکار در صورت شکست.
# =====================================================================
set -u

APP="/root/foxteam-bot/bot.js"
ENVF="/root/foxteam-bot/.env"
SERVICE="foxteam-bot"
STAMP="$(date +%Y%m%d-%H%M%S)"
BDIR="/root/botjs-backups/$STAMP"
INTERVAL="${1:-4000}"

red() { printf "\033[31m%s\033[0m\n" "$1"; }
grn() { printf "\033[32m%s\033[0m\n" "$1"; }
ylw() { printf "\033[33m%s\033[0m\n" "$1"; }
hr()  { echo "======================================================"; }

hr; echo " مرحله ۱ — بررسی اولیه"; hr
[ -f "$APP" ] || { red "فایل ربات پیدا نشد"; exit 1; }
node --check "$APP" || { red "Syntax فعلی سالم نیست، عملیات متوقف شد"; exit 1; }
grn "Syntax فعلی سالم است."

FOUND="$(grep -c 'sleep(500)' "$APP" || true)"
echo "تعداد انتظار نیم‌ثانیه‌ای پیدا شده: $FOUND"
if [ "$FOUND" = "0" ]; then
  if grep -q 'PARTNER_IDLE_MS' "$APP"; then
    ylw "وصله از قبل نصب شده است."
    grep -n 'PARTNER_IDLE_MS' "$APP" | head -2
    exit 0
  fi
  red "الگوی مورد انتظار پیدا نشد. دستی بررسی کن:"
  grep -n 'sleep(' "$APP" | head -10
  exit 1
fi

hr; echo " مرحله ۲ — بکاپ"; hr
mkdir -p "$BDIR"; chmod 700 "$BDIR"
cp -a "$APP" "$BDIR/bot.js.bak"
sha256sum "$BDIR/bot.js.bak" > "$BDIR/bot.sha256"
sha256sum -c "$BDIR/bot.sha256" >/dev/null 2>&1 || { red "بکاپ تأیید نشد"; exit 1; }
grn "بکاپ گرفته شد: $BDIR/bot.js.bak"

hr; echo " مرحله ۳ — ساخت نسخه جدید"; hr
TMP="/root/.foxy1-poll-${STAMP}.js"
sed 's|sleep(500)|sleep(Number(process.env.PARTNER_IDLE_MS \|\| 4000))|g' "$APP" > "$TMP"
node --check "$TMP" || { red "نسخه جدید Syntax سالمی ندارد، چیزی تغییر نکرد"; rm -f "$TMP"; exit 1; }
grn "Syntax نسخه جدید تأیید شد."
grep -n 'PARTNER_IDLE_MS' "$TMP" | head -3

hr; echo " مرحله ۴ — اعمال"; hr
chmod --reference="$APP" "$TMP" 2>/dev/null || chmod 644 "$TMP"
mv -f "$TMP" "$APP"
if grep -q '^PARTNER_IDLE_MS=' "$ENVF"; then
  sed -i "s|^PARTNER_IDLE_MS=.*|PARTNER_IDLE_MS=$INTERVAL|" "$ENVF"
else
  printf 'PARTNER_IDLE_MS=%s\n' "$INTERVAL" >> "$ENVF"
fi
chmod 600 "$ENVF"
grn "اعمال شد. فاصله انتظار: $INTERVAL میلی‌ثانیه"

hr; echo " مرحله ۵ — ری‌استارت کنترل‌شده"; hr
systemctl restart "$SERVICE"; sleep 20

rollback() {
  red "$1"
  cp -a "$BDIR/bot.js.bak" "$APP"
  systemctl restart "$SERVICE"; sleep 8
  ylw "بازگشت انجام شد. وضعیت: $(systemctl is-active $SERVICE)"
  echo "بکاپ: $BDIR/bot.js.bak"
  exit 1
}

systemctl is-active --quiet "$SERVICE" || rollback "سرویس بالا نیامد."
LOG="$(journalctl -u "$SERVICE" --since '1 min ago' --no-pager 2>/dev/null)"
echo "$LOG" | tail -6 | sed 's/^/  /'
echo "$LOG" | grep -q "long polling" || rollback "به مرحله long polling نرسید."
grn "ربات سالم بالا آمد."

hr; grn " نتیجه: وصله نصب شد"; hr
echo "مصرف تخمینی جدید:"
python3 - "$INTERVAL" <<'PY' 2>/dev/null || echo "  حدود $((86400000 / INTERVAL)) درخواست در روز"
import sys
ms = int(sys.argv[1])
print("  حدود %d درخواست در روز به‌جای حدود ۸۰ هزار" % (86400000 // ms))
PY
echo
echo "برای تغییر بعدی فقط این خط را در فایل محیط عوض کن:"
echo "  PARTNER_IDLE_MS=8000"
echo "و بعد:  systemctl restart $SERVICE"
echo
echo "دستور بازگشت:"
echo "  cp $BDIR/bot.js.bak $APP && systemctl restart $SERVICE"
