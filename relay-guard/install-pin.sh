#!/usr/bin/env bash
# نصب Foxy1 Vercel IP Pin + زمان‌بند ۱۰ دقیقه‌ای
set -eu
DIR="/opt/foxy1-relay-guard"
RAW="https://raw.githubusercontent.com/Wboyx/foxy1-agent/main/relay-guard"
HOSTNAME_TO_PIN="${1:-mehti-gw-4821.vercel.app}"

echo "======================================================"
echo " نصب قفل IP — Foxy1 Vercel Pin"
echo "======================================================"

mkdir -p "$DIR"; chmod 700 "$DIR"
curl -fsSL "$RAW/vercel-pin.sh" -o "$DIR/vercel-pin.sh"
chmod 700 "$DIR/vercel-pin.sh"

if [ -f "$DIR/pin.conf" ]; then
  grep -qxF "$HOSTNAME_TO_PIN" "$DIR/pin.conf" || printf '%s\n' "$HOSTNAME_TO_PIN" >> "$DIR/pin.conf"
else
  printf '# نام‌هایی که باید روی IP سالم قفل شوند\n%s\n' "$HOSTNAME_TO_PIN" > "$DIR/pin.conf"
fi
chmod 600 "$DIR/pin.conf"

cat > /etc/systemd/system/foxy1-vercel-pin.service <<'UNIT'
[Unit]
Description=Foxy1 Vercel IP Pin - keep relay hostname on a reachable IP
After=network-online.target
Wants=network-online.target

[Service]
Type=oneshot
Environment=VERBOSE=0
ExecStart=/opt/foxy1-relay-guard/vercel-pin.sh refresh
User=root
MemoryMax=64M
CPUQuota=15%
NoNewPrivileges=yes
UNIT

cat > /etc/systemd/system/foxy1-vercel-pin.timer <<'UNIT'
[Unit]
Description=Run Foxy1 Vercel IP Pin every 10 minutes

[Timer]
OnBootSec=120s
OnUnitActiveSec=600s
RandomizedDelaySec=60s
Unit=foxy1-vercel-pin.service

[Install]
WantedBy=timers.target
UNIT

systemctl daemon-reload
systemctl enable --now foxy1-vercel-pin.timer >/dev/null 2>&1

echo "نصب شد. اجرای اولین قفل:"
echo
"$DIR/vercel-pin.sh" refresh
echo
echo "وضعیت:"
"$DIR/vercel-pin.sh" status
echo
echo "حذف قفل در صورت نیاز:"
echo "  /opt/foxy1-relay-guard/vercel-pin.sh remove"
