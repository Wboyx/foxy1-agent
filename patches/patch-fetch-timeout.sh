#!/usr/bin/env bash
# =====================================================================
# Fox Auto host — وصله تایم‌اوت سراسری برای foxteam-bot
# 2026-08-19
#
# مسئله:
#   هیچ‌کدام از fetchهای bot.js تایم‌اوت ندارند.
#   یک پنل یا رله کند می‌تواند راه‌اندازی ربات را برای همیشه معلق کند.
#   امشب دو بار همین اتفاق افتاد و ربات به مرحله long polling نرسید.
#
# راه‌حل:
#   یک لایه نازک روی fetch سراسری، فقط چند خط، بدون دست‌زدن به منطق ربات.
#   - درخواست getUpdates تا 45 ثانیه مهلت دارد (long polling)
#   - بقیه درخواست‌ها تا 12 ثانیه
#   - اگر خود کد signal داده باشد، دست نمی‌خورد
#
# ایمنی:
#   بکاپ Timestampدار، بررسی Syntax، جابه‌جایی اتمی،
#   ری‌استارت کنترل‌شده، بررسی واقعی، بازگشت خودکار.
# =====================================================================
set -u

APP="/root/foxteam-bot/bot.js"
SERVICE="foxteam-bot"
STAMP="$(date +%Y%m%d-%H%M%S)"
BDIR="/root/botjs-backups/$STAMP"
MARKER="__FOXY1_FETCH_TIMEOUT__"

red() { printf "\033[31m%s\033[0m\n" "$1"; }
grn() { printf "\033[32m%s\033[0m\n" "$1"; }
ylw() { printf "\033[33m%s\033[0m\n" "$1"; }
hr()  { echo "======================================================"; }

hr; echo " مرحله ۱ — بررسی اولیه"; hr
[ -f "$APP" ] || { red "فایل ربات پیدا نشد: $APP"; exit 1; }
grn "فایل ربات پیدا شد."
echo "نسخه Node:"; node -v

if grep -q "$MARKER" "$APP"; then
  ylw "وصله از قبل نصب شده است. کاری انجام نشد."
  exit 0
fi

node --check "$APP" || { red "فایل فعلی Syntax سالمی ندارد. عملیات متوقف شد."; exit 1; }
grn "Syntax فعلی سالم است."

hr; echo " مرحله ۲ — بکاپ"; hr
mkdir -p "$BDIR"; chmod 700 "$BDIR"
cp -a "$APP" "$BDIR/bot.js.bak"
sha256sum "$BDIR/bot.js.bak" > "$BDIR/bot.sha256"
sha256sum -c "$BDIR/bot.sha256" >/dev/null 2>&1 || { red "صحت بکاپ تأیید نشد."; exit 1; }
grn "بکاپ گرفته و تأیید شد:"; echo "  $BDIR/bot.js.bak"

hr; echo " مرحله ۳ — ساخت نسخه جدید"; hr
# نکته: فایل موقت باید پسوند .js داشته باشد وگرنه node --check کار نمی‌کند
TMP="/root/.foxy1-bot-new-${STAMP}.js"

read -r -d '' PATCH_CODE <<'PATCHEOF' || true
// ===== __FOXY1_FETCH_TIMEOUT__ (Fox Auto host, 2026-08-19) =====
// هیچ درخواستی نباید برای همیشه معلق بماند.
// getUpdates مهلت بیشتری دارد چون long polling است.
(() => {
  const _origFetch = globalThis.fetch;
  if (typeof _origFetch !== "function") return;
  const LONG_MS  = parseInt(process.env.FETCH_TIMEOUT_LONG_MS  || "45000", 10);
  const SHORT_MS = parseInt(process.env.FETCH_TIMEOUT_SHORT_MS || "12000", 10);
  globalThis.fetch = function (input, init) {
    init = init || {};
    if (init.signal) return _origFetch(input, init);
    let url = "";
    try { url = typeof input === "string" ? input : (input && input.url) || ""; } catch (_) {}
    const ms = url.includes("getUpdates") ? LONG_MS : SHORT_MS;
    let signal;
    try {
      signal = AbortSignal.timeout(ms);
    } catch (_) {
      const c = new AbortController();
      setTimeout(() => c.abort(), ms);
      signal = c.signal;
    }
    return _origFetch(input, Object.assign({}, init, { signal }));
  };
})();
// ===== end __FOXY1_FETCH_TIMEOUT__ =====
PATCHEOF

FIRST="$(head -1 "$APP")"
case "$FIRST" in
  "#!"*)
    { printf '%s\n' "$FIRST"; printf '%s\n' "$PATCH_CODE"; tail -n +2 "$APP"; } > "$TMP"
    ;;
  *)
    { printf '%s\n' "$PATCH_CODE"; cat "$APP"; } > "$TMP"
    ;;
esac

node --check "$TMP" || { red "نسخه جدید Syntax سالمی ندارد. هیچ تغییری اعمال نشد."; rm -f "$TMP"; exit 1; }
grn "Syntax نسخه جدید تأیید شد."

hr; echo " مرحله ۴ — جابه‌جایی اتمی"; hr
chmod --reference="$APP" "$TMP" 2>/dev/null || chmod 644 "$TMP"
mv -f "$TMP" "$APP"
grn "وصله اعمال شد."
grep -n "$MARKER" "$APP" | head -2 | sed 's/^/  /'

hr; echo " مرحله ۵ — ری‌استارت کنترل‌شده"; hr
systemctl restart "$SERVICE"
sleep 20

rollback() {
  red "$1"
  cp -a "$BDIR/bot.js.bak" "$APP"
  systemctl restart "$SERVICE"; sleep 8
  ylw "بازگشت انجام شد. وضعیت سرویس: $(systemctl is-active $SERVICE)"
  echo "بکاپ: $BDIR/bot.js.bak"
  exit 1
}

systemctl is-active --quiet "$SERVICE" || rollback "سرویس بالا نیامد."
grn "سرویس فعال است."

hr; echo " مرحله ۶ — بررسی واقعی"; hr
LOG="$(journalctl -u "$SERVICE" --since '1 min ago' --no-pager 2>/dev/null)"
echo "$LOG" | tail -8 | sed 's/^/  /'

if echo "$LOG" | grep -q "long polling"; then
  grn "ربات به مرحله long polling رسید."
else
  rollback "ربات به مرحله long polling نرسید."
fi

E="/root/foxteam-bot/.env"
T="$(grep -E '^BOT_TOKEN=' "$E" | head -1 | cut -d= -f2- | tr -d '"'"'"' ')"
B="$(grep -E '^TG_API_BASE=' "$E" | head -1 | cut -d= -f2- | tr -d '"'"'"' ')"
sleep 10
PEND="$(timeout 20 curl -s --max-time 15 "${B%/}/bot${T}/getWebhookInfo" 2>/dev/null | grep -oE '"pending_update_count":[0-9]+' | cut -d: -f2)"
echo "  pending_update_count: ${PEND:-نامشخص}"

hr; grn " نتیجه: وصله با موفقیت نصب شد"; hr
echo "از این پس:"
echo "  getUpdates حداکثر 45 ثانیه"
echo "  بقیه درخواست‌ها حداکثر 12 ثانیه"
echo
echo "بکاپ:"; echo "  $BDIR/bot.js.bak"
echo "دستور بازگشت:"
echo "  cp $BDIR/bot.js.bak $APP && systemctl restart $SERVICE"
