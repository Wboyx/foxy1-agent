#!/usr/bin/env bash
# ==========================================================
# Foxy1 Bot Diagnostic  -  READ ONLY
# Fox Auto host / foxy1-agent tools
# Version: 1.0  (2026-08-19)
#
# This script ONLY READS.
# It never restarts a service, never edits a file,
# never opens a port, never routes user traffic.
# Every secret is redacted before printing.
# ==========================================================

set -u

TS="$(date +%Y%m%d-%H%M%S)"
LOGDIR="/root"
[ -w "$LOGDIR" ] || LOGDIR="/tmp"
LOG="${LOGDIR}/foxy1-diag-${TS}.log"
SERVICES_DEFAULT="foxteam-bot telegram-store-mvp x-ui nginx foxy1-monitor"
SERVICES="${SERVICES:-$SERVICES_DEFAULT}"
ENV_CANDIDATES="/root/foxteam-bot/.env /opt/telegram-store-mvp/.env /root/.env"

redact() {
  sed -E \
    -e 's/[0-9]{8,12}:[A-Za-z0-9_-]{30,}/BOT_TOKEN_REDACTED/g' \
    -e 's/(gh[pousr]_)[A-Za-z0-9]{20,}/\1REDACTED/g' \
    -e 's/[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}/UUID_REDACTED/g' \
    -e 's/(password|passwd|secret|api_key|apikey|token)([=:"[:space:]]+)[^[:space:]",}]+/\1\2REDACTED/Ig'
}

hr()   { echo "----------------------------------------------------------------------"; }
head1(){ echo; echo "======================================================================"; echo "$1"; echo "======================================================================"; }
have() { command -v "$1" >/dev/null 2>&1; }

main() {

head1 "0. IDENTITY / TIME"
echo "date_utc      : $(date -u '+%Y-%m-%d %H:%M:%S UTC')"
echo "hostname      : $(hostname)"
echo "uptime        : $(uptime -p 2>/dev/null)"
echo "kernel        : $(uname -r)"
echo "public_ip_hint:"
ip -4 -o addr show scope global 2>/dev/null | awk '{print "  "$2" "$4}'

head1 "1. SERVICE STATE"
for s in $SERVICES; do
  if systemctl list-unit-files 2>/dev/null | grep -q "^${s}\.service"; then
    state=$(systemctl is-active "$s" 2>/dev/null)
    sub=$(systemctl show -p SubState --value "$s" 2>/dev/null)
    nrs=$(systemctl show -p NRestarts --value "$s" 2>/dev/null)
    mem=$(systemctl show -p MemoryCurrent --value "$s" 2>/dev/null)
    peak=$(systemctl show -p MemoryPeak --value "$s" 2>/dev/null)
    since=$(systemctl show -p ActiveEnterTimestamp --value "$s" 2>/dev/null)
    exitc=$(systemctl show -p ExecMainStatus --value "$s" 2>/dev/null)
    pid=$(systemctl show -p MainPID --value "$s" 2>/dev/null)
    if [ "$mem" != "" ] && [ "$mem" != "[not set]" ] && [ "$mem" -eq "$mem" ] 2>/dev/null; then
      memh="$((mem/1024/1024)) MB"; else memh="$mem"; fi
    if [ "$peak" != "" ] && [ "$peak" != "[not set]" ] && [ "$peak" -eq "$peak" ] 2>/dev/null; then
      peakh="$((peak/1024/1024)) MB"; else peakh="$peak"; fi
    printf '%-22s %-9s %-10s restarts=%-4s pid=%-7s mem=%-9s peak=%-9s exit=%s\n' \
      "$s" "$state" "$sub" "$nrs" "$pid" "$memh" "$peakh" "$exitc"
    echo "  since: $since"
  else
    printf '%-22s %s\n' "$s" "unit-not-found"
  fi
done

if have pm2; then
  hr; echo "PM2 processes:"; pm2 jlist 2>/dev/null | (have jq && jq -r '.[]|"  \(.name) status=\(.pm2_env.status) restarts=\(.pm2_env.restart_time) mem=\(.monit.memory/1048576|floor)MB cpu=\(.monit.cpu)%"' || echo "  (jq missing)")
fi

head1 "2. RESOURCES"
free -h 2>/dev/null
echo
echo "load_average : $(cut -d' ' -f1-3 /proc/loadavg)"
echo "cpu_count    : $(nproc 2>/dev/null)"
echo
echo "top memory consumers:"
ps -eo pid,comm,rss,pcpu --sort=-rss 2>/dev/null | head -8 | awk 'NR==1{print "  "$0} NR>1{printf "  %-8s %-20s %6s MB  cpu %s%%\n",$1,$2,int($3/1024),$4}'
echo
echo "disk:"
df -h / 2>/dev/null | tail -n +1 | sed 's/^/  /'
if have vmstat; then
  echo
  echo "cpu steal / io wait (3 samples):"
  vmstat 1 3 2>/dev/null | sed 's/^/  /'
fi

head1 "3. OOM AND KERNEL KILLS (last 3 days)"
if have journalctl; then
  oom=$(journalctl -k --since "3 days ago" --no-pager 2>/dev/null | grep -iE "out of memory|killed process|oom-kill" | tail -10)
  if [ -n "$oom" ]; then echo "$oom" | sed 's/^/  /'; else echo "  none found"; fi
else
  echo "  journalctl not available"
fi

head1 "4. SERVICE LOG ERRORS (last 90 minutes)"
PATTERN="fetch failed|ETELEGRAM|ECONNRESET|ETIMEDOUT|EAI_AGAIN|ENOTFOUND|409|Conflict|429|Too Many Requests|timeout|timed out|socket hang up|getUpdates|polling_error|webhook|unhandled|Traceback|Error:|FATAL|OOM"
for s in $SERVICES; do
  systemctl list-unit-files 2>/dev/null | grep -q "^${s}\.service" || continue
  hr
  echo "service: $s   (top repeated errors, 90 min)"
  journalctl -u "$s" --since "90 min ago" --no-pager 2>/dev/null \
    | grep -EiI "$PATTERN" \
    | sed -E 's/^[A-Za-z]{3} [0-9 ]{2} [0-9:]{8} [^ ]+ [^:]+: //' \
    | sed -E 's/[0-9]{2}:[0-9]{2}:[0-9]{2}/HH:MM:SS/g' \
    | sort | uniq -c | sort -rn | head -8 | sed 's/^/  /'
  echo "  --- last 6 raw lines ---"
  journalctl -u "$s" --since "90 min ago" --no-pager 2>/dev/null | tail -6 | sed 's/^/  /'
  echo "  --- restart events (24h) ---"
  journalctl -u "$s" --since "24 hours ago" --no-pager 2>/dev/null \
    | grep -iE "Started|Stopped|Scheduled restart|Main process exited|Failed with result" \
    | tail -8 | sed 's/^/  /'
done

head1 "5. DNS LAYER"
for d in 1.1.1.1 8.8.8.8 178.22.122.100 9.9.9.9; do
  if have dig; then
    r=$(timeout 5 dig +short +time=2 +tries=1 @"$d" api.telegram.org 2>/dev/null | head -2 | tr '\n' ' ')
  else
    r=$(timeout 5 getent hosts api.telegram.org 2>/dev/null | head -1)
  fi
  printf '  api.telegram.org @%-16s -> %s\n' "$d" "${r:-FAIL/timeout}"
done
echo
echo "  5x local resolve stability:"
for i in 1 2 3 4 5; do
  if have dig; then out=$(timeout 4 dig +short google.com 2>&1 | head -1); else out=$(timeout 4 getent hosts google.com | head -1); fi
  echo "    try$i: ${out:-FAIL}"
done
echo
echo "  resolvectl:"
(have resolvectl && resolvectl status 2>/dev/null | grep -E "DNS Servers|Fallback|DNSOverTLS|Current DNS" | head -8 | sed 's/^/    /') || echo "    n/a"
echo
echo "  ipv6 route test:"
(timeout 6 ping6 -c 2 -W 2 2606:4700:4700::1111 2>&1 | tail -2 | sed 's/^/    /') || echo "    no ipv6"

head1 "6. TCP / TLS REACHABILITY (raw, no user traffic)"
check_url() {
  local name="$1" url="$2"
  local out
  out=$(timeout 20 curl -s -o /dev/null -w "code=%{http_code} dns=%{time_namelookup}s conn=%{time_connect}s tls=%{time_appconnect}s total=%{time_total}s" --max-time 18 "$url" 2>&1)
  printf '  %-34s %s\n' "$name" "$out"
}
check_url "api.telegram.org"        "https://api.telegram.org/"
check_url "vercel relay root"       "https://tg-proxy-vercel-one.vercel.app/"
check_url "raw.githubusercontent"   "https://raw.githubusercontent.com/"
check_url "cloudflare 1.1.1.1"      "https://1.1.1.1/"
echo "  note: code=000 means TLS did not complete (SNI filtering), not an HTTP error"

head1 "7. TCP HEALTH / RETRANSMISSION"
(have ss && ss -s 2>/dev/null | sed 's/^/  /') || echo "  ss n/a"
echo
if have nstat; then
  nstat -az 2>/dev/null | grep -E "TcpRetransSegs|TcpExtTCPLostRetransmit|TcpExtListenDrops|TcpOutRsts|TcpExtTCPTimeouts" | sed 's/^/  /'
else
  grep -E "^Tcp:" /proc/net/snmp | sed 's/^/  /'
fi
echo
echo "  conntrack:"
(cat /proc/sys/net/netfilter/nf_conntrack_count 2>/dev/null | sed 's/^/    count=/') || echo "    n/a"
(cat /proc/sys/net/netfilter/nf_conntrack_max 2>/dev/null | sed 's/^/    max=/') || true
echo
echo "  established connections per process (top 5):"
(ss -tnp state established 2>/dev/null | awk -F'"' '{print $2}' | sort | uniq -c | sort -rn | head -5 | sed 's/^/    /') || true

head1 "8. TELEGRAM API PATH HEALTH"
ENVF=""
for f in $ENV_CANDIDATES; do [ -f "$f" ] && ENVF="$ENVF $f"; done
if [ -z "$ENVF" ]; then
  echo "  no .env file found in known paths; skipping token-based checks"
else
  for f in $ENVF; do
    echo "  env file: $f  (perm $(stat -c '%a' "$f" 2>/dev/null))"
    grep -oE '^[A-Z0-9_]+=' "$f" 2>/dev/null | tr -d '=' | tr '\n' ' ' | sed 's/^/    keys: /'; echo
    base=$(grep -hoE '^[A-Z0-9_]*(API_BASE|BASE_URL|PROXY|RELAY)[A-Z0-9_]*=.*' "$f" 2>/dev/null | head -1 | cut -d= -f2- | tr -d '"'"'"' ')
    tok=$(grep -hoE '^[A-Z0-9_]*BOT_TOKEN=.*' "$f" 2>/dev/null | head -1 | cut -d= -f2- | tr -d '"'"'"' ')
    [ -n "$base" ] && echo "    relay base: $base"
    [ -n "$tok" ]  && echo "    bot token : present (length ${#tok})"
    if [ -n "$tok" ]; then
      api="${base:-https://api.telegram.org}"
      api="${api%/}"
      for i in 1 2 3; do
        r=$(timeout 25 curl -s -o /tmp/.foxy_gm.$$ -w "%{http_code} %{time_total}s" --max-time 22 "${api}/bot${tok}/getMe" 2>/dev/null)
        ok=$( (have jq && jq -r '.ok' </tmp/.foxy_gm.$$ 2>/dev/null) || grep -o '"ok":[a-z]*' /tmp/.foxy_gm.$$ 2>/dev/null | head -1)
        echo "    getMe try$i : http=$r ok=$ok"
      done
      rm -f /tmp/.foxy_gm.$$
      timeout 25 curl -s --max-time 22 "${api}/bot${tok}/getWebhookInfo" -o /tmp/.foxy_wh.$$ 2>/dev/null
      if [ -s /tmp/.foxy_wh.$$ ]; then
        if have jq; then
          jq -r '"    webhook_set=\((.result.url//"")|length>0) pending=\(.result.pending_update_count//"-") last_error=\(.result.last_error_message//"none") ip=\(.result.ip_address//"-")"' /tmp/.foxy_wh.$$ 2>/dev/null
        else
          sed -E 's/"url":"[^"]*"/"url":"REDACTED"/' /tmp/.foxy_wh.$$ | head -c 400; echo
        fi
      else
        echo "    getWebhookInfo: no response"
      fi
      rm -f /tmp/.foxy_wh.$$
    fi
  done
fi

head1 "9. QUICK VERDICT HINTS"
echo "  - restarts>0 or 'Main process exited' in section 4  -> service crash loop"
echo "  - OOM lines in section 3                            -> memory pressure, add swap first"
echo "  - code=000 in section 6                             -> SNI filtering on that domain"
echo "  - getMe slow (>3s) or failing in section 8          -> relay path is the bottleneck"
echo "  - webhook_set=true while bot uses polling           -> 409 Conflict, unstable updates"
echo "  - many dig FAIL in section 5                        -> DNS layer, fix resolver first"
echo
echo "log file: $LOG"

}

main 2>&1 | redact | tee "$LOG"
chmod 600 "$LOG" 2>/dev/null
echo
echo "Done. READ-ONLY. Nothing was changed."
echo "Send me this file content: $LOG"
