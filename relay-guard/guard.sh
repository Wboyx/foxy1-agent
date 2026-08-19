#!/usr/bin/env bash
# =====================================================================
# Foxy1 Relay Guard — نگهبان مسیر Bot API
# Fox Auto host  |  version 2.0  |  2026-08-19
#
# نسخه ۲ چه چیزی را حل می‌کند:
#   در حادثه 2026-08-19 مسیر getMe سالم بود ولی getUpdates کار نمی‌کرد.
#   ربات به مرحله long polling نمی‌رسید و پیام‌ها در صف می‌ماندند،
#   ولی نگهبان نسخه ۱ چیزی نمی‌دید چون فقط getMe را چک می‌کرد.
#
# سه نشانه‌ای که حالا بررسی می‌شود:
#   A. سلامت مسیر با getMe
#   B. صف پیام‌ها: اگر pending چند بار پشت سر هم کم نشود یعنی ربات نمی‌خواند
#   C. نرسیدن به مرحله long polling بعد از راه‌اندازی
#
# اقدام: تعویض به مسیر سالم بعدی، و اگر مسیر جایگزینی نبود،
#        ری‌استارت کنترل‌شده همان سرویس.
#
# هیچ پورتی باز نمی‌شود. هیچ ترافیک کاربری عبور نمی‌کند.
# Token هرگز چاپ یا ارسال نمی‌شود.
# =====================================================================

set -u

CONF_DIR="/opt/foxy1-relay-guard"
RELAYS="$CONF_DIR/relays.conf"
GUARD_ENV="$CONF_DIR/guard.env"
STATE="$CONF_DIR/state"
STALL="$CONF_DIR/stall"
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
# صف چند تا و چند بار پشت سر هم بماند تا خرابی اعلام شود
STALL_MIN="${STALL_MIN:-2}"
STALL_CHECKS="${STALL_CHECKS:-3}"
# چند ثانیه بعد از راه‌اندازی انتظار داریم خط long polling آمده باشد
POLL_GRACE="${POLL_GRACE:-180}"

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

read_env_value() { grep -E "^$1=" "$2" 2>/dev/null | head -1 | cut -d= -f2- | tr -d '"'"'"' '; }

probe_base() { # base token — 0 یعنی سالم
  local base="$1" tok="$2" i body
  base="${base%/}"
  for i in $(seq 1 $TRIES); do
    body="$(timeout $((CURL_TIMEOUT+3)) curl -s --max-time $CURL_TIMEOUT "${base}/bot${tok}/getMe" 2>/dev/null)"
    case "$body" in *'"ok":true'*) return 0 ;; esac
    sleep 1
  done
  return 1
}

get_pending() { # base token -> عدد یا خالی
  local base="${1%/}" tok="$2"
  timeout $((CURL_TIMEOUT+3)) curl -s --max-time $CURL_TIMEOUT "${base}/bot${tok}/getWebhookInfo" 2>/dev/null \
    | grep -oE '"pending_update_count":[0-9]+' | head -1 | cut -d: -f2
}

polling_started() { # 0 یعنی ربات به مرحله polling رسیده است
  local since
  since="$(systemctl show -p ActiveEnterTimestamp --value "$SERVICE" 2>/dev/null)"
  [ -z "$since" ] && return 0
  journalctl -u "$SERVICE" --since "$since" --no-pager 2>/dev/null | grep -q "long polling"
}

service_uptime() { # ثانیه
  local ts now
  ts="$(systemctl show -p ActiveEnterTimestampMonotonic --value "$SERVICE" 2>/dev/null)"
  now="$(awk '{print int($1*1000000)}' /proc/uptime)"
  [ -z "$ts" ] || [ "$ts" = "0" ] && { echo 99999; return; }
  echo $(( (now - ts) / 1000000 ))
}

notify() { # text base token
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

[ -f "$APP_ENV" ] || { log "ERROR: env file not found: $APP_ENV"; exit 1; }
[ -f "$RELAYS" ]  || { log "ERROR: relay list not found: $RELAYS"; exit 1; }

TOKEN="$(read_env_value BOT_TOKEN "$APP_ENV")"
CURRENT="$(read_env_value TG_API_BASE "$APP_ENV")"; CURRENT="${CURRENT%/}"
[ -n "$TOKEN" ] || { log "ERROR: BOT_TOKEN not found"; exit 1; }

CANDIDATES="$(grep -vE '^\s*(#|$)' "$RELAYS" | tr -d '\r' | sed 's:/*$::')"

if [ "$MODE" = "status" ] || [ "$MODE" = "--status" ]; then
  echo "version      : 2.0"
  echo "current base : ${CURRENT:-<unset>}"
  echo "service      : $(systemctl is-active $SERVICE 2>/dev/null)  (up $(service_uptime)s)"
  echo "polling      : $(polling_started && echo yes || echo NO)"
  echo "pending      : $(get_pending "$CURRENT" "$TOKEN")"
  echo "stall count  : $( [ -f "$STALL" ] && cat "$STALL" || echo 0 )"
  echo "last switch  : $( [ -f "$STATE" ] && cat "$STATE" || echo none )"
  echo "candidates   :"
  for b in $CANDIDATES; do
    if probe_base "$b" "$TOKEN"; then echo "  OK    $b"; else echo "  FAIL  $b"; fi
  done
  echo "log tail:"; tail -n 12 "$LOGF" 2>/dev/null | sed 's/^/  /'
  exit 0
fi

# ---------------- تشخیص خرابی ----------------
REASON=""

# نشانه A: مسیر
if [ -z "$CURRENT" ] || ! probe_base "$CURRENT" "$TOKEN"; then
  REASON="relay-down"
fi

# نشانه C: نرسیدن به long polling
if [ -z "$REASON" ]; then
  UP="$(service_uptime)"
  if systemctl is-active --quiet "$SERVICE" && [ "$UP" -gt "$POLL_GRACE" ] && ! polling_started; then
    REASON="no-polling"
  fi
fi

# نشانه B: صف پیام‌ها که کم نمی‌شود
if [ -z "$REASON" ]; then
  PEND="$(get_pending "$CURRENT" "$TOKEN")"
  PREV_P="0"; CNT="0"
  if [ -f "$STALL" ]; then
    PREV_P="$(cut -d'|' -f1 "$STALL" 2>/dev/null)"; CNT="$(cut -d'|' -f2 "$STALL" 2>/dev/null)"
  fi
  case "$PREV_P" in ''|*[!0-9]*) PREV_P=0 ;; esac
  case "$CNT"    in ''|*[!0-9]*) CNT=0 ;; esac

  if [ -n "$PEND" ] && [ "$PEND" -ge "$STALL_MIN" ] && [ "$PEND" -ge "$PREV_P" ]; then
    CNT=$((CNT+1))
  else
    CNT=0
  fi
  printf '%s|%s\n' "${PEND:-0}" "$CNT" > "$STALL"; chmod 600 "$STALL"

  if [ "$CNT" -ge "$STALL_CHECKS" ]; then
    REASON="queue-stalled pending=${PEND}"
  fi
fi

if [ -z "$REASON" ]; then
  log "OK current=$CURRENT pending=$(cut -d'|' -f1 "$STALL" 2>/dev/null || echo 0)"
  exit 0
fi

log "PROBLEM [$REASON] current=${CURRENT:-<unset>}"

# ضدنوسان
if [ -f "$STATE" ]; then
  LAST_TS="$(cut -d'|' -f1 "$STATE" 2>/dev/null)"; NOW="$(date +%s)"
  case "$LAST_TS" in
    ''|*[!0-9]*) : ;;
    *) if [ $((NOW - LAST_TS)) -lt "$COOLDOWN_SECONDS" ]; then
         log "SKIP action — cooldown ($((COOLDOWN_SECONDS - (NOW - LAST_TS)))s left)"; exit 0
       fi ;;
  esac
fi

# ---------------- انتخاب مسیر سالم ----------------
NEWBASE=""
for b in $CANDIDATES; do
  [ "$b" = "$CURRENT" ] && continue
  if probe_base "$b" "$TOKEN"; then NEWBASE="$b"; break; fi
  log "  candidate failed: $b"
done

# اگر مسیر فعلی سالم است ولی ربات گیر کرده، فقط ری‌استارت کافی است
if [ -z "$NEWBASE" ]; then
  if [ "$REASON" != "relay-down" ] && probe_base "$CURRENT" "$TOKEN"; then
    log "no alternative relay, but current path is healthy — restarting service"
    systemctl restart "$SERVICE"; sleep 15
    printf '%s|%s|%s\n' "$(date +%s)" "$(date -u '+%Y-%m-%d %H:%M:%S')" "restart-only ($REASON)" > "$STATE"; chmod 600 "$STATE"
    rm -f "$STALL"
    if systemctl is-active --quiet "$SERVICE" && polling_started; then
      log "RESTART OK — polling resumed"
      notify "نگهبان مسیر فاکسی ۱

ربات گیر کرده بود و با ری‌استارت برگشت.

علت:
$REASON

مسیر:
$CURRENT

زمان:
$(date -u '+%Y-%m-%d %H:%M UTC')" "$CURRENT" "$TOKEN"
      exit 0
    fi
    log "RESTART did not fix it — manual check needed"
    exit 2
  fi
  log "NO healthy relay found — no change made"
  exit 2
fi

# ---------------- تعویض مسیر ----------------
log "FOUND healthy relay: $NEWBASE — switching"
STAMP="$(date +%Y%m%d-%H%M%S)"; BDIR="$BACKUP_ROOT/guard-$STAMP"
mkdir -p "$BDIR"; chmod 700 "$BDIR"
cp -a "$APP_ENV" "$BDIR/.env.bak"; chmod 600 "$BDIR/.env.bak"
sha256sum "$BDIR/.env.bak" > "$BDIR/env.sha256"
sha256sum -c "$BDIR/env.sha256" >/dev/null 2>&1 || { log "ERROR backup integrity failed — abort"; exit 1; }

TMP="$(mktemp)"; cp -a "$APP_ENV" "$TMP"
if grep -qE '^TG_API_BASE=' "$TMP"; then
  sed -i "s|^TG_API_BASE=.*|TG_API_BASE=$NEWBASE|" "$TMP"
else
  printf '\nTG_API_BASE=%s\n' "$NEWBASE" >> "$TMP"
fi
grep -qE '^POLL_TIMEOUT_SECONDS=' "$TMP" && sed -i "s|^POLL_TIMEOUT_SECONDS=.*|POLL_TIMEOUT_SECONDS=$POLL_VALUE|" "$TMP"
chmod 600 "$TMP"; mv -f "$TMP" "$APP_ENV"; chmod 600 "$APP_ENV"

systemctl restart "$SERVICE"; sleep 15

if ! systemctl is-active --quiet "$SERVICE"; then
  log "ERROR service did not come up — rolling back"
  cp -a "$BDIR/.env.bak" "$APP_ENV"; chmod 600 "$APP_ENV"
  systemctl restart "$SERVICE"; sleep 6
  log "ROLLBACK done, service=$(systemctl is-active $SERVICE)"
  exit 1
fi

if ! polling_started; then
  log "WARN service is active but polling line not seen yet"
fi

printf '%s|%s|%s\n' "$(date +%s)" "$(date -u '+%Y-%m-%d %H:%M:%S')" "$CURRENT -> $NEWBASE ($REASON)" > "$STATE"
chmod 600 "$STATE"; rm -f "$STALL"

log "SWITCHED $CURRENT -> $NEWBASE  reason=$REASON  backup=$BDIR/.env.bak"

notify "نگهبان مسیر فاکسی ۱

مسیر قبلی مشکل داشت و مسیر جدید فعال شد.

علت:
$REASON

قبلی:
${CURRENT:-نامشخص}

جدید:
$NEWBASE

زمان:
$(date -u '+%Y-%m-%d %H:%M UTC')" "$NEWBASE" "$TOKEN"

exit 0
