#!/usr/bin/env bash
# =====================================================================
# نصب‌کننده Foxy1 Monitor — فاز صفر
#
# این نصب‌کننده:
#   - هیچ سرویس موجودی را دست نمی‌زند
#   - هیچ پورتی باز نمی‌کند
#   - فقط یک سرویس خواندنی جدید اضافه می‌کند
#   - قابل حذف کامل با یک دستور است
# =====================================================================

set -u

INSTALL_DIR="/opt/foxy1-monitor"
SERVICE_NAME="foxy1-monitor"
RAW_BASE="https://raw.githubusercontent.com/Wboyx/foxy1-agent/main"

grn() { printf "\033[32m%s\033[0m\n" "$1"; }
red() { printf "\033[31m%s\033[0m\n" "$1"; }
ylw() { printf "\033[33m%s\033[0m\n" "$1"; }

echo "======================================================"
echo " نصب Foxy1 Monitor — فاز صفر (فقط پایش)"
echo "======================================================"
echo

# ---------------------------------------------------------------
# مرحله ۱ — بررسی اولیه
# ---------------------------------------------------------------
echo "مرحله ۱ — بررسی اولیه"

if [ "$(id -u)" != "0" ]; then
  red "این نصب‌کننده باید با کاربر root اجرا شود."
  exit 1
fi

if ! command -v python3 >/dev/null 2>&1; then
  red "python3 پیدا نشد. لطفاً ابتدا نصبش کن."
  exit 1
fi
grn "python3 موجود است: $(python3 --version 2>&1)"

if systemctl is-active --quiet "$SERVICE_NAME" 2>/dev/null; then
  ylw "سرویس از قبل فعال است — برای بروزرسانی متوقفش می‌کنیم."
  systemctl stop "$SERVICE_NAME"
fi

# ---------------------------------------------------------------
# مرحله ۲ — دریافت فایل‌ها
# ---------------------------------------------------------------
echo
echo "مرحله ۲ — دریافت فایل‌ها"

mkdir -p "$INSTALL_DIR"
chmod 700 "$INSTALL_DIR"

if [ -f "$INSTALL_DIR/foxy1-monitor.py" ]; then
  STAMP="$(date +%Y%m%d-%H%M%S)"
  cp -a "$INSTALL_DIR/foxy1-monitor.py" "$INSTALL_DIR/foxy1-monitor.py.bak-$STAMP"
  grn "بکاپ نسخه قبلی گرفته شد."
fi

if ! curl -fsSL "$RAW_BASE/foxy1-monitor.py" -o "$INSTALL_DIR/foxy1-monitor.py.new"; then
  red "دریافت فایل ناموفق بود. اتصال گیت‌هاب را بررسی کن."
  exit 1
fi

if ! python3 -c "import ast,sys;ast.parse(open('$INSTALL_DIR/foxy1-monitor.py.new').read())"; then
  red "فایل دریافتی معتبر نیست. نصب متوقف شد."
  rm -f "$INSTALL_DIR/foxy1-monitor.py.new"
  exit 1
fi
grn "فایل دریافت و اعتبارسنجی شد."

mv -f "$INSTALL_DIR/foxy1-monitor.py.new" "$INSTALL_DIR/foxy1-monitor.py"
chmod 700 "$INSTALL_DIR/foxy1-monitor.py"

# ---------------------------------------------------------------
# مرحله ۳ — فایل تنظیمات
# ---------------------------------------------------------------
echo
echo "مرحله ۳ — فایل تنظیمات"

CONF="$INSTALL_DIR/foxy1-monitor.env"

if [ -f "$CONF" ]; then
  grn "فایل تنظیمات از قبل وجود دارد — دست‌نخورده باقی ماند."
else
  cat > "$CONF" <<'CONFEOF'
# =====================================================================
# تنظیمات Foxy1 Monitor
# این فایل مقدار حساس دارد — دسترسی آن باید 600 بماند
# =====================================================================

# توکن ربات جدیدی که از BotFather گرفتی
FOXY1_BOT_TOKEN=

# شناسه عددی چت خودت
# اگر نمی‌دانی: به ربات پیام بده و بعد این را اجرا کن:
#   bash /opt/foxy1-monitor/getid.sh
FOXY1_CHAT_ID=

# مسیر رله تلگرام — چون api.telegram.org از ایران بسته است
TG_API_BASE=https://tg-proxy-vercel-one.vercel.app

# بازه بررسی به ثانیه
CHECK_INTERVAL=120

# سرویس‌های تحت نظر، جدا شده با کاما
WATCH_SERVICES=foxteam-bot,x-ui,nginx,telegram-store-mvp

# آستانه هشدار
DISK_WARN_PERCENT=85
MEM_WARN_PERCENT=90

# آدرس سلامت پروکسی — همان که امشب از کار افتاد
PROXY_HEALTH_URL=https://tg-proxy-vercel-one.vercel.app/health

# پایش لاگ
LOG_GREP_SERVICE=foxteam-bot
LOG_ERROR_PATTERN=fetch failed|ECONNREFUSED|OOM|Conflict
LOG_ERROR_THRESHOLD=5

# ساعت گزارش روزانه (۲۴ ساعته، به وقت سرور)
DAILY_REPORT_HOUR=9

# فاصله حداقلی تکرار یک هشدار، به دقیقه
QUIET_REPEAT_MINUTES=60
CONFEOF
  grn "فایل تنظیمات ساخته شد."
fi

chmod 600 "$CONF"

# ---------------------------------------------------------------
# مرحله ۴ — ابزار گرفتن شناسه چت
# ---------------------------------------------------------------
cat > "$INSTALL_DIR/getid.sh" <<'IDEOF'
#!/usr/bin/env bash
# پیدا کردن شناسه چت — اول به ربات در تلگرام پیام بده، بعد این را اجرا کن
CONF="/opt/foxy1-monitor/foxy1-monitor.env"
TOKEN="$(grep -E '^FOXY1_BOT_TOKEN=' "$CONF" | cut -d= -f2-)"
BASE="$(grep -E '^TG_API_BASE=' "$CONF" | cut -d= -f2-)"
BASE="${BASE:-https://api.telegram.org}"

if [ -z "$TOKEN" ]; then
  echo "ابتدا FOXY1_BOT_TOKEN را در فایل تنظیمات وارد کن:"
  echo "  nano $CONF"
  exit 1
fi

echo "در حال خواندن آخرین پیام‌ها..."
curl -s "${BASE%/}/bot$TOKEN/getUpdates" \
  | python3 -c "
import json,sys
try:
    d = json.load(sys.stdin)
except Exception:
    print('پاسخ نامعتبر از تلگرام.'); sys.exit(1)
if not d.get('ok'):
    print('خطا:', d.get('description','نامشخص')); sys.exit(1)
ids = []
for u in d.get('result', []):
    m = u.get('message') or u.get('edited_message') or {}
    c = m.get('chat') or {}
    if c.get('id') and c['id'] not in [i[0] for i in ids]:
        ids.append((c['id'], c.get('first_name') or c.get('title') or ''))
if not ids:
    print('پیامی پیدا نشد. اول در تلگرام به ربات یک پیام بده، بعد دوباره اجرا کن.')
else:
    print()
    print('شناسه(های) پیداشده:')
    for i, name in ids:
        print(f'  {i}   {name}')
    print()
    print('این را در فایل تنظیمات وارد کن:')
    print(f'  FOXY1_CHAT_ID={ids[0][0]}')
"
IDEOF
chmod 700 "$INSTALL_DIR/getid.sh"

# ---------------------------------------------------------------
# مرحله ۵ — سرویس systemd
# ---------------------------------------------------------------
echo
echo "مرحله ۴ — ساخت سرویس"

cat > "/etc/systemd/system/$SERVICE_NAME.service" <<UNITEOF
[Unit]
Description=Foxy1 Monitor - read-only server watcher
After=network-online.target
Wants=network-online.target

[Service]
Type=simple
WorkingDirectory=$INSTALL_DIR
ExecStart=/usr/bin/python3 $INSTALL_DIR/foxy1-monitor.py
Restart=always
RestartSec=30

# سقف منابع تا هرگز به سرویس‌های اصلی فشار نیاورد
MemoryMax=80M
CPUQuota=15%

# سخت‌سازی امنیتی
NoNewPrivileges=yes
PrivateTmp=yes
ProtectHome=yes
ProtectKernelTunables=yes
ProtectControlGroups=yes
RestrictSUIDSGID=yes

StandardOutput=journal
StandardError=journal

[Install]
WantedBy=multi-user.target
UNITEOF

systemctl daemon-reload
grn "سرویس ساخته شد (هنوز روشن نشده)."

# ---------------------------------------------------------------
# پایان
# ---------------------------------------------------------------
echo
echo "======================================================"
grn " نصب کامل شد"
echo "======================================================"
echo
echo "قدم بعدی — سه کار کوتاه:"
echo
echo "۱. توکن ربات را وارد کن:"
echo "     nano $CONF"
echo
echo "۲. در تلگرام به ربات یک پیام بده، سپس:"
echo "     bash $INSTALL_DIR/getid.sh"
echo "   شناسه را در همان فایل تنظیمات بگذار."
echo
echo "۳. تست کن:"
echo "     python3 $INSTALL_DIR/foxy1-monitor.py --test"
echo
echo "اگر پیام آزمایشی رسید، سرویس را روشن کن:"
echo "     systemctl enable --now $SERVICE_NAME"
echo
echo "دستور حذف کامل در صورت نیاز:"
echo "     systemctl disable --now $SERVICE_NAME"
echo "     rm -rf $INSTALL_DIR /etc/systemd/system/$SERVICE_NAME.service"
echo "     systemctl daemon-reload"
echo
