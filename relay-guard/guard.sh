#!/usr/bin/env bash
# =====================================================================
# Foxy1 Relay Guard — نگهبان مسیر Bot API
# Fox Auto host  |  version 1.0  |  2026-08-19
#
# چه می‌کند:
#   هر چند دقیقه مسیر فعلی ربات را با getMe تست می‌کند.
#   اگر مسیر خراب بود، بین مسیرهای پشتیبان اولین مسیر سالم را پیدا می‌کند،
#   از فایل محیط بکاپ می‌گیرد، فقط یک خط را عوض می‌کند،
#   سرویس را ری‌استارت می‌کند و به مدیر در تلگرام خبر می‌دهد.
#
# چه نمی‌کند:
#   هیچ پورتی باز نمی‌کند.
#   هیچ ترافیک کاربری از آن عبور نمی‌کند.
#   هیچ Tokenی چاپ یا ارسال نمی‌کند.
#   بدون مسیر سالم، هیچ تغییری نمی‌دهد.
#
# قانون قرمز:
#   جهت جریان فقط این است و ترافیک کاربر نهایی در آن نیست:
#     Bot (سرور ایران) -> Relay -> api.telegram.org
# =====================================================================

set -u

CONF_DIR="/opt/foxy1-relay-guard"
RELAYS="$CONF_DIR/relays.conf"
GUARD_ENV="$CONF_DIR/guard.env"
STATE="$CONF_DIR/state"
LOGF="/var/log/foxy1-relay-guard.log"

APP_ENV="/root/foxteam-bot/.env"
SERVICE="foxteam-bot"
BACKUP_ROOT="/root/tg-proxy-switch-backups"

TRIES=2
CURL_TIMEOUT=10
COOLDOWN_SECONDS=600
MAX_LOG_LINES=3000

[ -f "$GUARD_ENV" ] && . "$GUARD_ENV"
ALERT_CHAT_ID="${ALERT_CHAT_ID:-}"
POLL_VALUE="${POLL_VALUE:-12}"

redact() { sed -E 's/[0-9]{8,12}:[A-Za-z0-9_-]{30,}/BOT_TOKEN_REDACTED/g'; }

log() {
  printf '%s | %s\n' "$(date -u '+%Y-%m-%d %H:%M:%S')" "$1" | redact >> "$LOGF"
  [ "${VERBOSE:-0}" = "1" ] && printf '%s\n' "$1" | redact
  return 0
}

trim_log() {
  [ -f "$LOGF" ] || return 0
  local n; n=$(wc -l < "$LOGF" 2>/dev/null || echo 0)
  if [ "$n" -gt "$MAX_LOG_LINES" ]; then
    tail -n $((MAX_LOG_LINES/2)) "$LOGF" > "${LOGF}.tmp" && mv -f "${LOGF}.tmp" "$LOGF"
    chmod 600 "$LOGF"
  fi
}

read_env_value() { # key file
  grep -E "^$1=" "$2" 2>/dev/null | head -1 | cut -d= -f2- | tr -d '"'"'"' '
}

# تست یک مسیر: خروجی 0 یعنی سالم
probe_base() { # base token
  local base="$1" tok="$2" i body
  base="${base%/}"
  for i in $(seq 1 $TRIES); do
    body="$(timeout $((CURL_TIMEOUT+3)) curl -s --max-time $CURL_TIMEOUT "${base}/bot${tok}/getMe" 2>/dev/null)"
    case "$body" in
      *'"ok":true'*) return 0 ;;
    esac
    sleep 1
  done
  return 1
}

notify() { # text  (از مسیر فعلی سالم ارسال می‌شود)
  local text="$1" base="$2" tok="$3"
  [ -z "$ALERT_CHAT_ID" ] && return 0
  timeout 15 curl -s --max-time 12 -o /dev/null \
    --data-urlencode "chat_id=${ALERT_CHAT_ID}" \
    --data-urlencode "text=${text}" \
    "${base%/}/bot${tok}/sendMessage" >/dev/null 2>&1
  return 0
}

# ---------------------------------------------------------------- main

mkdir -p "$CONF_DIR"; chmod 700 "$CONF_DIR"
touch "$LOGF"; chmod 600 "$LOGF"
trim_log

MODE="${1:-check}"

if [ ! -f "$APP_ENV" ]; then log "ERROR: env file not found: $APP_ENV"; exit 1; fi
if [ ! -f "$RELAYS" ]; then log "ERROR: relay list not found: $RELAYS"; exit 1; fi

TOKEN="$(read_env_value BOT_TOKEN "$APP_ENV")"
CURRENT="$(read_env_value TG_API_BASE "$APP_ENV")"
CURRENT="${CURRENT%/}"

if [ -z "$TOKEN" ]; then log "ERROR: BOT_TOKEN not found in $APP_ENV"; exit 1; fi

CANDIDATES="$(grep -vE '^\s*(#|$)' "$RELAYS" | tr -d '\r' | sed 's:/*$::')"

# ---------- حالت وضعیت ----------
if [ "$MODE" = "status" ] || [ "$MODE" = "--status" ]; then
  echo "current base : ${CURRENT:-<unset>}"
  echo "service      : $(systemctl is-active $SERVICE 2>/dev/null)"
  echo "last switch  : $( [ -f "$STATE" ] && cat "$STATE" || echo none )"
  echo "candidates   :"
  echo "$CANDIDATES" | sed 's/^/  /'
  echo
  echo "live probe:"
  for b in $CANDIDATES; do
    if probe_base "$b" "$TOKEN"; then echo "  OK    $b"; else echo "  FAIL  $b"; fi
  done
  echo
  echo "log tail:"
  tail -n 15 "$LOGF" 2>/dev/null | sed 's/^/  /'
  exit 0
fi

# ---------- حالت بررسی ----------
if [ -n "$CURRENT" ] && probe_base "$CURRENT" "$TOKEN"; then
  log "OK current=$CURRENT"
  exit 0
fi

log "DOWN current=${CURRENT:-<unset>} — searching for a healthy relay"

# ضدنوسان: اگر همین چند دقیقه پیش سوییچ کرده‌ایم، دوباره سوییچ نکن
if [ -f "$STATE" ]; then
  LAST_TS="$(cut -d'|' -f1 "$STATE" 2>/dev/null)"
  NOW="$(date +%s)"
  case "$LAST_TS" in
    ''|*[!0-9]*) : ;;
    *) if [ $((NOW - LAST_TS)) -lt "$COOLDOWN_SECONDS" ]; then
         log "SKIP switch — cooldown active ($((COOLDOWN_SECONDS - (NOW - LAST_TS)))s left)"
         exit 0
       fi ;;
  esac
fi

NEWBASE=""
for b in $CANDIDATES; do
  [ "$b" = "$CURRENT" ] && continue
  if probe_base "$b" "$TOKEN"; then NEWBASE="$b"; break; fi
  log "  candidate failed: $b"
done

if [ -z "$NEWBASE" ]; then
  log "NO healthy relay found — no change made"
  exit 2
fi

log "FOUND healthy relay: $NEWBASE — switching"

STAMP="$(date +%Y%m%d-%H%M%S)"
BDIR="$BACKUP_ROOT/guard-$STAMP"
mkdir -p "$BDIR"; chmod 700 "$BDIR"
cp -a "$APP_ENV" "$BDIR/.env.bak"; chmod 600 "$BDIR/.env.bak"
sha256sum "$BDIR/.env.bak" > "$BDIR/env.sha256"
if ! sha256sum -c "$BDIR/env.sha256" >/dev/null 2>&1; then
  log "ERROR backup integrity failed — abort"
  exit 1
fi

TMP="$(mktemp)"; cp -a "$APP_ENV" "$TMP"
if grep -qE '^TG_API_BASE=' "$TMP"; then
  sed -i "s|^TG_API_BASE=.*|TG_API_BASE=$NEWBASE|" "$TMP"
else
  printf '\nTG_API_BASE=%s\n' "$NEWBASE" >> "$TMP"
fi
if grep -qE '^POLL_TIMEOUT_SECONDS=' "$TMP"; then
  sed -i "s|^POLL_TIMEOUT_SECONDS=.*|POLL_TIMEOUT_SECONDS=$POLL_VALUE|" "$TMP"
fi
chmod 600 "$TMP"; mv -f "$TMP" "$APP_ENV"; chmod 600 "$APP_ENV"

systemctl restart "$SERVICE"
sleep 10

if ! systemctl is-active --quiet "$SERVICE"; then
  log "ERROR service did not come up — rolling back"
  cp -a "$BDIR/.env.bak" "$APP_ENV"; chmod 600 "$APP_ENV"
  systemctl restart "$SERVICE"; sleep 5
  log "ROLLBACK done, service=$(systemctl is-active $SERVICE)"
  exit 1
fi

printf '%s|%s|%s\n' "$(date +%s)" "$(date -u '+%Y-%m-%d %H:%M:%S')" "$CURRENT -> $NEWBASE" > "$STATE"
chmod 600 "$STATE"

log "SWITCHED $CURRENT -> $NEWBASE  backup=$BDIR/.env.bak"

notify "نگهبان مسیر فاکسی ۱

مسیر قبلی از کار افتاد و مسیر جدید فعال شد.

قبلی:
${CURRENT:-نامشخص}

جدید:
$NEWBASE

زمان:
$(date -u '+%Y-%m-%d %H:%M UTC')

سرویس فعال است و بکاپ فایل محیط گرفته شده." "$NEWBASE" "$TOKEN"

exit 0
