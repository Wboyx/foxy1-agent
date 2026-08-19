#!/usr/bin/env bash
# =====================================================================
# Foxy1 Vercel IP Pin — قفل‌کردن نام رله روی IP سالم
# Fox Auto host | version 1.0 | 2026-08-19
#
# مسئله:
#   نام رله سالم است، ولی بعضی IPهای Vercel از ایران بسته‌اند
#   و DNS هر بار یکی را تصادفی برمی‌گرداند. نتیجه: قطعی نامنظم.
#
# راه‌حل:
#   IPهای سالم را پیدا می‌کنیم و نام را در /etc/hosts روی سریع‌ترین
#   IP سالم قفل می‌کنیم. اگر آن IP بعداً بسته شد، همین اسکریپت
#   خودش IP بعدی را جایگزین می‌کند.
#
# ایمنی:
#   - فقط بلوک نشانه‌گذاری‌شده خودش را در /etc/hosts تغییر می‌دهد
#   - قبل از هر تغییر، بکاپ Timestampدار می‌گیرد
#   - تغییر اتمی است
#   - اگر هیچ IP سالمی نبود، فایل را دست نمی‌زند
#   - هیچ ترافیک کاربری از آن عبور نمی‌کند
# =====================================================================

set -u

CONF_DIR="/opt/foxy1-relay-guard"
PIN_CONF="$CONF_DIR/pin.conf"
HOSTS="/etc/hosts"
BACKUP_DIR="/root/hosts-backups"
LOGF="/var/log/foxy1-relay-guard.log"
MARK_START="# >>> foxy1-vercel-pin >>>"
MARK_END="# <<< foxy1-vercel-pin <<<"
TIMEOUT=7

log() { printf '%s | pin | %s\n' "$(date -u '+%Y-%m-%d %H:%M:%S')" "$1" >> "$LOGF"; [ "${VERBOSE:-1}" = "1" ] && echo "$1"; return 0; }

mkdir -p "$CONF_DIR" "$BACKUP_DIR"; chmod 700 "$CONF_DIR" "$BACKUP_DIR"
touch "$LOGF"; chmod 600 "$LOGF"

MODE="${1:-refresh}"

if [ ! -f "$PIN_CONF" ]; then
  cat > "$PIN_CONF" <<'EOF'
# نام‌هایی که باید روی IP سالم قفل شوند، یکی در هر خط
mehti-gw-4821.vercel.app
EOF
  chmod 600 "$PIN_CONF"
fi

# مخزن IPهای نامزد: هم لیست ثابت، هم آنچه DNS همین حالا می‌دهد
STATIC_IPS="64.29.17.195 64.29.17.129 64.29.17.65 64.29.17.1 64.29.17.3 66.33.60.65 66.33.60.129 66.33.60.193 216.198.79.1 216.198.79.65 216.198.79.129 216.198.79.193 76.76.21.21 76.76.21.61 76.76.21.98 76.76.21.142 76.76.21.164 76.76.21.241"

discover_ips() { # host
  local h="$1" out=""
  for d in 1.1.1.1 8.8.8.8 178.22.122.100 9.9.9.9; do
    out="$out $(timeout 4 dig +short +time=2 +tries=1 @"$d" "$h" 2>/dev/null | grep -E '^[0-9.]+$' | tr '\n' ' ')"
  done
  echo "$out"
}

test_ip() { # host ip -> prints time on success
  local h="$1" ip="$2" r code t
  r=$(timeout $((TIMEOUT+3)) curl -s -o /tmp/.pin_body.$$ --max-time $TIMEOUT \
      --resolve "${h}:443:${ip}" -w "%{http_code} %{time_total}" "https://${h}/health" 2>/dev/null)
  code=$(echo "$r" | awk '{print $1}'); t=$(echo "$r" | awk '{print $2}')
  if [ "$code" = "200" ] && grep -q '"ok":true' /tmp/.pin_body.$$ 2>/dev/null; then
    rm -f /tmp/.pin_body.$$; echo "$t"; return 0
  fi
  rm -f /tmp/.pin_body.$$; return 1
}

current_pin() { # host
  grep -E "^[0-9.]+[[:space:]]+$1( |$)" "$HOSTS" 2>/dev/null | head -1 | awk '{print $1}'
}

if [ "$MODE" = "status" ] || [ "$MODE" = "--status" ]; then
  echo "pinned hosts in $HOSTS:"
  sed -n "/$MARK_START/,/$MARK_END/p" "$HOSTS" | grep -vE '^#' | sed 's/^/  /'
  echo
  for h in $(grep -vE '^\s*(#|$)' "$PIN_CONF"); do
    cp="$(current_pin "$h")"
    printf '  %-32s pinned=%-16s ' "$h" "${cp:-none}"
    if [ -n "$cp" ] && t=$(test_ip "$h" "$cp"); then echo "OK ${t}s"; else echo "FAIL"; fi
  done
  exit 0
fi

if [ "$MODE" = "remove" ] || [ "$MODE" = "--remove" ]; then
  STAMP="$(date +%Y%m%d-%H%M%S)"
  cp -a "$HOSTS" "$BACKUP_DIR/hosts.$STAMP.bak"
  TMP="$(mktemp)"
  sed "/$MARK_START/,/$MARK_END/d" "$HOSTS" > "$TMP"
  chmod 644 "$TMP"; mv -f "$TMP" "$HOSTS"
  log "REMOVED pin block from hosts (backup $BACKUP_DIR/hosts.$STAMP.bak)"
  exit 0
fi

# ---------------- refresh ----------------
CHANGED=0
NEWBLOCK=""

for HOST in $(grep -vE '^\s*(#|$)' "$PIN_CONF"); do
  CUR="$(current_pin "$HOST")"

  # اگر IP فعلی هنوز سالم است، دست نزن
  if [ -n "$CUR" ] && T=$(test_ip "$HOST" "$CUR"); then
    log "OK $HOST stays on $CUR (${T}s)"
    NEWBLOCK="$NEWBLOCK$CUR $HOST"$'\n'
    continue
  fi

  [ -n "$CUR" ] && log "DOWN $HOST current pin $CUR failed — searching"

  CANDIDATES="$(echo "$STATIC_IPS $(discover_ips "$HOST")" | tr ' ' '\n' | grep -E '^[0-9.]+$' | sort -u)"
  BEST=""; BESTT="99"
  for ip in $CANDIDATES; do
    if T=$(test_ip "$HOST" "$ip"); then
      log "  healthy: $ip (${T}s)"
      if awk "BEGIN{exit !($T < $BESTT)}"; then BEST="$ip"; BESTT="$T"; fi
    fi
  done

  if [ -z "$BEST" ]; then
    log "NO healthy IP found for $HOST — hosts file untouched"
    [ -n "$CUR" ] && NEWBLOCK="$NEWBLOCK$CUR $HOST"$'\n'
    continue
  fi

  log "PICK $HOST -> $BEST (${BESTT}s)"
  NEWBLOCK="$NEWBLOCK$BEST $HOST"$'\n'
  [ "$BEST" != "$CUR" ] && CHANGED=1
done

if [ "$CHANGED" = "0" ] && sed -n "/$MARK_START/,/$MARK_END/p" "$HOSTS" | grep -q .; then
  log "no change needed"
  exit 0
fi

STAMP="$(date +%Y%m%d-%H%M%S)"
cp -a "$HOSTS" "$BACKUP_DIR/hosts.$STAMP.bak"
chmod 600 "$BACKUP_DIR/hosts.$STAMP.bak"

TMP="$(mktemp)"
sed "/$MARK_START/,/$MARK_END/d" "$HOSTS" > "$TMP"
{
  echo "$MARK_START"
  echo "# managed by foxy1 vercel-pin — updated $(date -u '+%Y-%m-%d %H:%M UTC')"
  printf '%s' "$NEWBLOCK"
  echo "$MARK_END"
} >> "$TMP"

# اعتبارسنجی: فایل نباید خالی یا بدون localhost باشد
if ! grep -qE '^127\.0\.0\.1[[:space:]]+localhost' "$TMP"; then
  log "ERROR new hosts file failed validation — aborted, nothing changed"
  rm -f "$TMP"; exit 1
fi

chmod 644 "$TMP"; mv -f "$TMP" "$HOSTS"
log "UPDATED hosts (backup $BACKUP_DIR/hosts.$STAMP.bak)"
sed -n "/$MARK_START/,/$MARK_END/p" "$HOSTS" | sed 's/^/  /'
