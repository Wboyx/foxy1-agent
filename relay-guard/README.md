# Foxy1 Relay Guard

نگهبان مسیر Bot API برای `foxteam-bot`.

## مسئله

مسیر ربات به تلگرام از داخل ایران فقط از راه یک رله ممکن است و نام دامنه رله‌ها یکی‌یکی روی SNI بسته می‌شوند:

```text
2026-08-16  workers.dev  بسته شد
2026-08-19  آدرس vercel.app ما بسته شد، ولی خود دامنه سالم بود
```

نتیجه: ربات بدون خطای واضح، بی‌پاسخ می‌شد.

## راه‌حل

چند مسیر موازی نگه می‌داریم و یک نگهبان هر دو دقیقه مسیر فعلی را با `getMe` تست می‌کند. اگر خراب بود، اولین مسیر سالم فهرست را فعال می‌کند.

```text
هر ۲ دقیقه: getMe روی مسیر فعلی
   سالم  -> کاری نمی‌کند
   خراب  -> بکاپ، تعویض یک خط، ری‌استارت، بررسی، هشدار تلگرام
```

## ویژگی‌های ایمنی

- بکاپ Timestampدار از فایل محیط با بررسی Hash
- تغییر اتمی، فقط `TG_API_BASE` و `POLL_TIMEOUT_SECONDS`
- بازگشت خودکار اگر سرویس بالا نیامد
- ضدنوسان با فاصله ۱۰ دقیقه بین دو تعویض
- اگر هیچ مسیر سالمی نبود، هیچ تغییری نمی‌دهد
- Token هیچ‌جا چاپ یا ارسال نمی‌شود
- محدودیت منابع در فایل سرویس: `MemoryMax=64M`, `CPUQuota=15%`

## قانون قرمز

جهت جریان فقط این است و ترافیک کاربر نهایی در آن نیست:

```text
Bot (سرور ایران) -> Relay -> api.telegram.org
```

هیچ پورت ورودی باز نمی‌شود و هیچ کاربری از این سرور خارج نمی‌شود.

## نصب

```bash
curl -fsSL https://raw.githubusercontent.com/Wboyx/foxy1-agent/main/relay-guard/install-guard.sh -o /root/install-guard.sh
bash /root/install-guard.sh
```

## وضعیت

```bash
/opt/foxy1-relay-guard/guard.sh status
```

## افزودن مسیر جدید

```bash
nano /opt/foxy1-relay-guard/relays.conf
```

هر خط یک آدرس، به ترتیب اولویت.

---

## قفل IP — درس 2026-08-19

یافته مهم: بعضی IPهای Vercel از ایران بسته‌اند و بعضی باز، و DNS تصادفی یکی را برمی‌گرداند.

```text
64.29.17.195  code=200  0.47s   باز
64.29.17.129  code=200  0.50s   باز
64.29.17.3    code=000          بسته
216.198.79.x  code=000          بسته
76.76.21.21   code=000          بسته
```

یعنی نام دامنه سالم است ولی مسیر قرعه‌کشی می‌شود. راه‌حل، قفل نام روی IP سالم در فایل hosts و به‌روزرسانی خودکار هر ده دقیقه است.

```bash
curl -fsSL https://raw.githubusercontent.com/Wboyx/foxy1-agent/main/relay-guard/install-pin.sh -o /root/install-pin.sh
bash /root/install-pin.sh NAME.vercel.app
```

وضعیت:

```bash
/opt/foxy1-relay-guard/vercel-pin.sh status
```

حذف:

```bash
/opt/foxy1-relay-guard/vercel-pin.sh remove
```
