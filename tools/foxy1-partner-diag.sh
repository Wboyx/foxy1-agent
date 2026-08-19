#!/usr/bin/env bash
# =====================================================================
# Foxy1 Partner Path Diagnostic — READ ONLY
# Fox Auto host | 2026-08-19
#
# هدف: پیدا کردن اینکه کندی مسیر ربات‌های همکار دقیقاً کجاست.
# مسیر همکاران چند لایه دارد و باید هر لایه جدا اندازه‌گیری شود.
#
# این اسکریپت فقط می‌خواند. هیچ فایلی عوض نمی‌شود،
# هیچ سرویسی ری‌استارت نمی‌شود، هیچ پورتی باز نمی‌شود.
# Secretها Redact می‌شوند.
# =====================================================================
set -u
TS="$(date +%Y%m%d-%H%M%S)"
LOGDIR="/root"; [ -w "$LOGDIR" ] || LOGDIR="/tmp"
LOG="${LOGDIR}/foxy1-partner-diag-${TS}.log"
APP_ENV="/root/foxteam-bot/.env"

redact() {
  sed -E \
    -e 's/[0-9]{8,12}:[A-Za-z0-9_-]{30,}/BOT_TOKEN_REDACTED/g' \
    -e 's/(secret|token|password|key)([=:"[:space:]]+)[^[:space:]",}]+/\1\2REDACTED/Ig'
}
hr()   { echo "----------------------------------------------------------------------"; }
head1(){ echo; echo "======================================================================"; echo "$1"; echo "======================================================================"; }
have() { command -v "$1" >/dev/null 2>&1; }

timeit() { # name url [extra curl args...]
  local name="$1" url="$2"; shift 2
  local out
  out=$(timeout 20 curl -s -o /dev/null --max-time 15 \
        -w "code=%{http_code} dns=%{time_namelookup} conn=%{time_connect} tls=%{time_appconnect} ttfb=%{time_starttransfer} total=%{time_total}" \
        "$@" "$url" 2>&1)
  printf '  %-38s %s\n' "$name" "$out"
}

main() {

head1 "0. IDENTITY"
echo "date_utc : $(date -u '+%Y-%m-%d %H:%M:%S UTC')"
echo "host     : $(hostname)"

head1 "1. WHICH BOT SERVICES EXIST"
systemctl list-units --type=service --all --no-pager 2>/dev/null \
  | grep -iE "bot|partner|store|panel|x-ui|foxy" | sed 's/^/  /'
echo
if have pm2; then
  echo "  PM2:"
  pm2 list 2>/dev/null | sed 's/^/    /'
fi
echo
echo "  node/python processes:"
ps -eo pid,etimes,rss,comm,args --sort=-rss 2>/dev/null \
  | grep -E "node|python" | grep -v grep | head -8 \
  | awk '{printf "    pid=%-7s up=%-8ss rss=%-7sMB %s\n",$1,$2,int($3/1024),substr($0, index($0,$5))}' | cut -c1-160

head1 "2. PARTNER CONFIG (names only, values redacted)"
if [ -f "$APP_ENV" ]; then
  echo "  env: $APP_ENV (perm $(stat -c '%a' "$APP_ENV"))"
  grep -oE '^PARTNER[A-Z0-9_]*=' "$APP_ENV" | tr -d '=' | sed 's/^/    key: /'
  PRELAY=$(grep -hoE '^PARTNER_RELAY_URL=.*' "$APP_ENV" | head -1 | cut -d= -f2- | tr -d '"'"'"' ')
  PPORT=$(grep -hoE '^PARTNER_API_PORT=.*' "$APP_ENV" | head -1 | cut -d= -f2- | tr -d '"'"'"' ')
  PBIND=$(grep -hoE '^PARTNER_API_BIND=.*' "$APP_ENV" | head -1 | cut -d= -f2- | tr -d '"'"'"' ')
  echo "    PARTNER_RELAY_URL : ${PRELAY:-not set}"
  echo "    PARTNER_API_PORT  : ${PPORT:-not set}"
  echo "    PARTNER_API_BIND  : ${PBIND:-not set}"
else
  echo "  env file not found"
  PRELAY=""; PPORT="3740"; PBIND="127.0.0.1"
fi
PPORT="${PPORT:-3740}"

head1 "3. HOP BY HOP LATENCY"
echo "  هدف: ببینیم تأخیر در کدام لایه ساخته می‌شود"
echo
echo "  لایه ۱ — اپلیکیشن محلی:"
timeit "127.0.0.1:${PPORT} health" "http://127.0.0.1:${PPORT}/partner-api/v1/health"
echo
echo "  لایه ۲ — از راه Nginx و TLS روی همان سرور:"
timeit "nip.io /partner-api health" "https://37-202-246-52.nip.io/partner-api/v1/health"
echo
echo "  لایه ۳ — از راه رله همکاران (اگر تنظیم شده باشد):"
if [ -n "${PRELAY:-}" ]; then
  timeit "partner relay health" "${PRELAY%/}/partner-api/v1/health"
  timeit "partner relay root"   "${PRELAY%/}/"
else
  echo "    PARTNER_RELAY_URL تنظیم نشده است"
fi
echo
echo "  لایه ۳ب — Workerها و پل‌های شناخته‌شده:"
timeit "fox-team-partner-worker" "https://fox-team-partner-worker.mahdi-wz10.workers.dev/partner-api/v1/health"
timeit "fox-bridge-pasar"        "https://fox-bridge-pasar.vercel.app/health"
timeit "fox-bridge"              "https://fox-bridge.vercel.app/health"

head1 "4. DNS AND IP FOR PARTNER HOSTS"
for h in fox-bridge-pasar.vercel.app fox-team-partner-worker.mahdi-wz10.workers.dev; do
  ip=$( (have dig && dig +short "$h" | grep -E '^[0-9.]+$' | tail -1) || echo "")
  printf '  %-46s -> %s\n' "$h" "${ip:-resolve-failed}"
done
echo
echo "  تست همان نام روی چند IP مختلف Vercel:"
for ip in 66.33.60.65 64.29.17.195 64.29.17.129 216.198.79.129 76.76.21.21; do
  out=$(timeout 12 curl -s -o /dev/null --max-time 8 --resolve "fox-bridge-pasar.vercel.app:443:${ip}" \
        -w "code=%{http_code} total=%{time_total}" "https://fox-bridge-pasar.vercel.app/health" 2>/dev/null)
  printf '    %-16s %s\n' "$ip" "${out:-fail}"
done

head1 "5. NGINX PARTNER PATH (read-only)"
if [ -d /etc/nginx ]; then
  grep -rlE "partner" /etc/nginx/sites-enabled/ 2>/dev/null | sed 's/^/  file: /'
  grep -rhA6 "location /partner-api" /etc/nginx/sites-enabled/ 2>/dev/null | head -20 | sed 's/^/    /'
  echo
  echo "  nginx worker/keepalive settings:"
  grep -hE "worker_connections|keepalive|proxy_http_version|proxy_read_timeout" /etc/nginx/nginx.conf /etc/nginx/sites-enabled/* 2>/dev/null | head -12 | sed 's/^/    /'
else
  echo "  nginx not installed"
fi

head1 "6. TLS CERT FOR ORIGIN"
if have openssl; then
  echo | timeout 12 openssl s_client -servername 37-202-246-52.nip.io -connect 37.202.246.52:443 2>/dev/null \
    | openssl x509 -noout -subject -dates 2>/dev/null | sed 's/^/  /'
fi

head1 "7. LOCAL RESOURCE PRESSURE RIGHT NOW"
echo "  load: $(cut -d' ' -f1-3 /proc/loadavg)"
free -m 2>/dev/null | sed 's/^/  /'
echo "  established connections per process (top 5):"
(ss -tnp state established 2>/dev/null | awk -F'"' '{print $2}' | sort | uniq -c | sort -rn | head -5 | sed 's/^/    /') || true

head1 "8. HOW TO READ THIS"
echo "  لایه ۱ کند  -> مشکل در خود کد یا دیتابیس ربات است"
echo "  لایه ۱ سریع و لایه ۲ کند -> مشکل در Nginx یا TLS است"
echo "  لایه ۱ و ۲ سریع و لایه ۳ کند -> مشکل در مسیر اینترنت و رله است"
echo "  code=000 در هر لایه -> آن دامنه یا IP بسته است"
echo
echo "log file: $LOG"
}

main 2>&1 | redact | tee "$LOG"
chmod 600 "$LOG" 2>/dev/null
echo
echo "Done. READ-ONLY. Nothing was changed."
