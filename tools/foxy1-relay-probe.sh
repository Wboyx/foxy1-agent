#!/usr/bin/env bash
# ==========================================================
# Foxy1 Relay Probe  -  READ ONLY
# Fox Auto host / foxy1-agent tools
# Version: 1.0  (2026-08-19)
#
# Purpose: find out WHICH outbound path to Telegram still
# completes a TLS handshake from this server.
#
# It only sends test requests. It changes nothing:
# no file edit, no service restart, no port opened,
# no user traffic routed.
# ==========================================================

set -u

TS="$(date +%Y%m%d-%H%M%S)"
LOGDIR="/root"; [ -w "$LOGDIR" ] || LOGDIR="/tmp"
LOG="${LOGDIR}/foxy1-relay-probe-${TS}.log"
MAXT=8

redact() {
  sed -E \
    -e 's/[0-9]{8,12}:[A-Za-z0-9_-]{30,}/BOT_TOKEN_REDACTED/g' \
    -e 's/(password|passwd|secret|api_key|apikey|token)([=:"[:space:]]+)[^[:space:]",}]+/\1\2REDACTED/Ig'
}

probe() { # name url
  local name="$1" url="$2" out code tls total
  out=$(timeout $((MAXT+4)) curl -s -o /dev/null --max-time $MAXT \
        -w "%{http_code} %{time_appconnect} %{time_total}" "$url" 2>/dev/null)
  code=$(echo "$out" | awk '{print $1}'); tls=$(echo "$out" | awk '{print $2}'); total=$(echo "$out" | awk '{print $3}')
  [ -z "$code" ] && code="000"
  local verdict
  case "$code" in
    000) verdict="BLOCKED (no TLS)" ;;
    2*|3*|4*) verdict="OPEN" ;;
    5*) verdict="reachable, upstream error" ;;
    *) verdict="?" ;;
  esac
  printf '  %-42s code=%-4s tls=%-8s total=%-8s %s\n' "$name" "$code" "${tls:-0}" "${total:-0}" "$verdict"
}

probe_resolve() { # name host ip path
  local name="$1" host="$2" ip="$3" path="${4:-/}" out code tls total
  out=$(timeout $((MAXT+4)) curl -s -o /dev/null --max-time $MAXT \
        --resolve "${host}:443:${ip}" \
        -w "%{http_code} %{time_appconnect} %{time_total}" "https://${host}${path}" 2>/dev/null)
  code=$(echo "$out" | awk '{print $1}'); tls=$(echo "$out" | awk '{print $2}'); total=$(echo "$out" | awk '{print $3}')
  [ -z "$code" ] && code="000"
  printf '  %-42s code=%-4s tls=%-8s total=%-8s %s\n' "$name via $ip" "$code" "${tls:-0}" "${total:-0}" \
    "$([ "$code" = "000" ] && echo 'BLOCKED (no TLS)' || echo 'OPEN')"
}

main() {

echo "date_utc : $(date -u '+%Y-%m-%d %H:%M:%S UTC')"
echo "host     : $(hostname)"
echo "max-time : ${MAXT}s per request"

echo
echo "======================================================================"
echo "A. CURRENT RELAY  (the one the bot uses right now)"
echo "======================================================================"
for i in 1 2 3; do
  probe "try$i tg-proxy-vercel-one /health" "https://tg-proxy-vercel-one.vercel.app/health"
done

echo
echo "======================================================================"
echo "B. IS THE WHOLE vercel.app TLD BURNED, OR ONLY OUR HOSTNAME?"
echo "======================================================================"
probe "vercel.com (control)"            "https://vercel.com/"
probe "swr.vercel.app"                  "https://swr.vercel.app/"
probe "fox-brain (yours, if deployed)"  "https://fox-brain.vercel.app/"

echo
echo "======================================================================"
echo "C. DIRECT TELEGRAM BY RAW IP  (DNS is poisoned, IP may still work)"
echo "======================================================================"
echo "  if any line here is OPEN, the bot may not need a relay at all"
for ip in 149.154.167.220 149.154.175.50 149.154.171.5 91.108.56.130; do
  probe_resolve "api.telegram.org" "api.telegram.org" "$ip" "/"
done
echo
echo "  plain TCP reachability (port 443, no TLS):"
for ip in 149.154.167.220 149.154.175.50 91.108.56.130; do
  if timeout 5 bash -c "echo > /dev/tcp/${ip}/443" 2>/dev/null; then
    echo "    ${ip}:443  TCP-OK"
  else
    echo "    ${ip}:443  TCP-FAIL"
  fi
done

echo
echo "======================================================================"
echo "D. ALTERNATIVE HOSTING DOMAINS  (candidates for a new relay)"
echo "======================================================================"
probe "huggingface.co"        "https://huggingface.co/"
probe "hf.space"              "https://huggingface.co/spaces"
probe "deno.dev"              "https://dash.deno.com/"
probe "workers.dev (known bad)" "https://tg-proxy.mahdi-wz10.workers.dev/"
probe "pages.dev"             "https://pages.dev/"
probe "netlify.app"           "https://www.netlify.com/"
probe "onrender.com"          "https://render.com/"
probe "koyeb.app"             "https://www.koyeb.com/"
probe "fly.dev"               "https://fly.io/"
probe "railway.app"           "https://railway.app/"
probe "glitch.me"             "https://glitch.com/"
probe "github raw"            "https://raw.githubusercontent.com/"

echo
echo "======================================================================"
echo "E. BOT ENV SANITY  (names only, no values)"
echo "======================================================================"
F=/root/foxteam-bot/.env
if [ -f "$F" ]; then
  echo "  file       : $F  (perm $(stat -c '%a' "$F"))"
  base=$(grep -hoE '^TG_API_BASE=.*' "$F" | head -1 | cut -d= -f2- | tr -d '"'"'"' ')
  poll=$(grep -hoE '^POLL_TIMEOUT_SECONDS=.*' "$F" | head -1 | cut -d= -f2- | tr -d '"'"'"' ')
  echo "  TG_API_BASE: ${base:-not set}"
  echo "  POLL_TIMEOUT_SECONDS: ${poll:-not set}"
else
  echo "  env file not found at $F"
fi

echo
echo "======================================================================"
echo "F. HOW TO READ THIS"
echo "======================================================================"
echo "  code=000            -> TLS never completed: domain blocked by SNI"
echo "  code=200/301/404    -> path is OPEN and usable"
echo "  section C OPEN      -> best case: drop the relay, talk to Telegram directly by IP"
echo "  section B: vercel.com OPEN but our host 000 -> only our hostname is burned, redeploy under a new name"
echo "  section B: all vercel 000 -> the whole TLD is burned, move to an OPEN domain from section D"
echo
echo "log file: $LOG"

}

main 2>&1 | redact | tee "$LOG"
chmod 600 "$LOG" 2>/dev/null
echo
echo "Done. READ-ONLY. Nothing was changed."
