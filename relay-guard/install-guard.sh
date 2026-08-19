#!/usr/bin/env bash
# =====================================================================
# نصب Foxy1 Relay Guard
# Fox Auto host | 2026-08-19
#
# نصب ایمن و قابل تکرار:
#   - فایل موجود relays.conf را بازنویسی نمی‌کند
#   - فایل محیط ربات را دست نمی‌زند
#   - هیچ پورتی باز نمی‌کند
#   - سرویس با محدودیت منابع اجرا می‌شود
# =====================================================================

set -eu

DIR="/opt/foxy1-relay-guard"
RAW="https://raw.githubusercontent.com/Wboyx/foxy1-agent/main/relay-guard"
APP_ENV="/root/foxteam-bot/.env"

echo "======================================================"
echo " نصب نگهبان مسیر — Foxy1 Relay Guard"
echo "======================================================"

if [ ! -f "$APP_ENV" ]; then
  echo "فایل محیط ربات پیدا نشد:"
  echo "  $APP_ENV"
  exit 1
fi

mkdir -p "$DIR"
chmod 700 "$DIR"

echo "دریافت اسکریپت نگهبان..."
curl -fsSL "$RAW/guard.sh" -o "$DIR/guard.sh"
chmod 700 "$DIR/guard.sh"

CURRENT="$(grep -E '^TG_API_BASE=' "$APP_ENV" | head -1 | cut -d= -f2- | tr -d '"'"'"' ' | sed 's:/*$::')"

if [ -f "$DIR/relays.conf" ]; then
  echo "فهرست مسیرها از قبل وجود دارد و دست‌نخورده ماند:"
  echo "  $DIR/relays.conf"
else
  cat > "$DIR/relays.conf" <<EOF
# فهرست مسیرهای Bot API به ترتیب اولویت
# هر خط یک آدرس کامل بدون اسلش پایانی
# خط با # یعنی غیرفعال
#
# ترتیب مهم است: نگهبان از بالا به پایین اولین مسیر سالم را انتخاب می‌کند.
# هرچه تعداد مسیرها بیشتر و دامنه‌ها متنوع‌تر باشند، پایداری بیشتر است.

${CURRENT:-https://tg-proxy.mahdi-wz10.workers.dev}
# مسیر دوم را بعد از ساخت اینجا اضافه کن، مثلاً:
# https://NAME.vercel.app
EOF
  chmod 600 "$DIR/relays.conf"
  echo "فهرست مسیرها ساخته شد:"
  echo "  $DIR/relays.conf"
fi

if [ ! -f "$DIR/guard.env" ]; then
  cat > "$DIR/guard.env" <<'EOF'
# شناسه عددی چت مدیر برای دریافت هشدار تعویض مسیر
# اگر خالی بماند، هشدار ارسال نمی‌شود و فقط در لاگ ثبت می‌شود
ALERT_CHAT_ID=

# مقدار long polling که هنگام تعویض تنظیم می‌شود
POLL_VALUE=12
EOF
  chmod 600 "$DIR/guard.env"
fi

echo "ساخت سرویس و زمان‌بند..."

cat > /etc/systemd/system/foxy1-relay-guard.service <<'EOF'
[Unit]
Description=Foxy1 Relay Guard - keeps the bot on a healthy Bot API path
After=network-online.target
Wants=network-online.target

[Service]
Type=oneshot
ExecStart=/opt/foxy1-relay-guard/guard.sh check
User=root
MemoryMax=64M
CPUQuota=15%
NoNewPrivileges=yes
PrivateTmp=yes
ProtectKernelTunables=yes
ProtectControlGroups=yes
RestrictSUIDSGID=yes
EOF

cat > /etc/systemd/system/foxy1-relay-guard.timer <<'EOF'
[Unit]
Description=Run Foxy1 Relay Guard every 2 minutes

[Timer]
OnBootSec=90s
OnUnitActiveSec=120s
RandomizedDelaySec=20s
AccuracySec=10s
Unit=foxy1-relay-guard.service

[Install]
WantedBy=timers.target
EOF

systemctl daemon-reload
systemctl enable --now foxy1-relay-guard.timer >/dev/null 2>&1

echo
echo "======================================================"
echo " نصب انجام شد"
echo "======================================================"
echo "مسیر فعلی ربات:"
echo "  ${CURRENT:-<unset>}"
echo
echo "دستور وضعیت:"
echo "  /opt/foxy1-relay-guard/guard.sh status"
echo
echo "افزودن مسیر دوم:"
echo "  nano /opt/foxy1-relay-guard/relays.conf"
echo
echo "لاگ نگهبان:"
echo "  tail -f /var/log/foxy1-relay-guard.log"
echo
echo "حذف کامل:"
echo "  systemctl disable --now foxy1-relay-guard.timer"
echo "  rm -rf /opt/foxy1-relay-guard /etc/systemd/system/foxy1-relay-guard.*"
echo "  systemctl daemon-reload"
