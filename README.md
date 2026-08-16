# Foxy1 Agent — فاز صفر

پایش خواندنی سرور با هشدار در تلگرام.

## این نسخه چه می‌کند

- وضعیت سرویس‌ها را می‌بیند و اگر یکی خوابید خبر می‌دهد
- مصرف حافظه، Swap و دیسک را می‌پاید
- کشته‌شدن پروسه به‌علت کمبود حافظه را تشخیص می‌دهد
- لاگ را برای خطاهای تکرارشونده می‌خواند
- سلامت پروکسی تلگرام را چک می‌کند
- تاریخ انقضای گواهی TLS را بررسی می‌کند
- هر روز صبح یک گزارش کوتاه می‌فرستد

## این نسخه چه نمی‌کند

- هیچ فایلی را تغییر نمی‌دهد
- هیچ سرویسی را ری‌استارت نمی‌کند
- هیچ پورت ورودی باز نمی‌کند
- هیچ ترافیک کاربری از آن عبور نمی‌کند

## نصب

```bash
curl -fsSL https://raw.githubusercontent.com/Wboyx/foxy1-agent/main/install.sh -o /root/install-foxy1.sh
bash /root/install-foxy1.sh
```

سپس سه کار کوتاه:

```bash
nano /opt/foxy1-monitor/foxy1-monitor.env
bash /opt/foxy1-monitor/getid.sh
python3 /opt/foxy1-monitor/foxy1-monitor.py --test
```

و در پایان:

```bash
systemctl enable --now foxy1-monitor
```

## دستورهای مفید

گزارش فوری بدون ارسال:

```bash
python3 /opt/foxy1-monitor/foxy1-monitor.py --report
```

یک دور بررسی دستی:

```bash
python3 /opt/foxy1-monitor/foxy1-monitor.py --once
```

## مصرف منابع

سقف سخت در فایل سرویس تعریف شده است:

```text
MemoryMax: 80M
CPUQuota: 15%
```

## امنیت

- مقدارهای حساس قبل از ارسال به تلگرام Redact می‌شوند
- فایل تنظیمات با دسترسی 600 نگهداری می‌شود
- سرویس با محدودیت‌های سخت‌سازی systemd اجرا می‌شود

## حذف کامل

```bash
systemctl disable --now foxy1-monitor
rm -rf /opt/foxy1-monitor /etc/systemd/system/foxy1-monitor.service
systemctl daemon-reload
```

## فازهای بعدی

- فاز یک: اتصال روتر مدل و دیباگ گفت‌وگومحور
- فاز دو: اجرای دستور با تأیید دستی در تلگرام
- فاز سه: مشورت چندمدلی برای تصمیم‌های پرریسک
