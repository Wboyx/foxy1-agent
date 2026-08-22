# ⚙️ پنل مدیریت فاکس کوین — فاز ۳

پنل مدیریت فاکس کوین، بخش باقی‌مانده پروژه است که در این نسخه کامل شد:
آمار، تنظیمات، **فاکس شاپ**، کاربران، قیمت پلن‌ها و دفتر کل — همه با دکمه،
بدون نیاز به تایپ متن.

## فایل‌ها

| فایل | نقش |
|---|---|
| `foxcoin.js` | هسته (نسخه ۱.۲.۰): محصول کوینی + مدیریت + سوئیچ فروشگاه |
| `foxcoin-ui.js` | رابط کاربری کاربر عادی (۱.۱.۰): احترام به بسته/باز بودن فروشگاه |
| `foxcoin-admin.js` | **پنل مدیریت (۱.۱.۰) + مدیریت کامل فاکس شاپ** |
| `patch-foxcoin-admin.py` | وصله اتصال پنل به `bot.js` |
| `upgrade-foxcoin.py` | ارتقای هسته قدیمی سرور به نسخه کامل (نسخه ۲.۱) |
| `patch-foxcoin.py` | وصله فاز ۲ (بدون تغییر) |

## چه کسی ادمین است؟

درِ واقعی پنل در خود ماژول بسته می‌شود — نه با مخفی‌بودن دکمه.
اگر ادمین نباشی، فقط پیام «⛔ این بخش فقط برای مدیریت است» می‌گیری.

دو راه تعیین ادمین:

1. **متغیر محیطی** (پیشنهادی):
   ```bash
   # در فایل سرویس ربات
   Environment=FOXCOIN_ADMINS=123456789,987654321
   ```
2. **کانفیگ ربات**: `config.admins` (آرایه)، یا `config.adminIds`،
   یا `config.ownerId`، یا `config.owner`.

> اگر هیچ‌کدام تنظیم نشود، پنل برای همه قفل است. قفل پیش‌فرض
> امن‌تر از باز پیش‌فرض است.

## منوها

| دکمه | چه می‌کند |
|---|---|
| 📊 آمار کامل | صادرشده، خرج‌شده، در گردش، دارندگان، آمار امروز |
| ⚙️ تنظیمات | سقف روزانه، جایزه‌ها، نرخ خرید، روشن/خاموش — با دکمه +/− و اعمال فوری |
| 🛍 فاکس شاپ | **کنترل کامل فروشگاه** — باز/بسته، ساخت محصول، ویرایش، حذف |
| 👥 کاربران | دارندگان برتر + کاربران اخیر؛ صفحه هر کاربر: موجودی، تاریخچه، افزودن/کسر کوین |
| 💵 قیمت پلن‌ها | تعیین کوین به ازای هر پلن؛ رسیدن به صفر = حذف قیمت |
| 📜 دفتر کل | ۲۰ رویداد آخر همه کاربران |
| ❓ راهنما | راهنمای پنل و دستورهای خط فرمان |

## 🛍 مدیریت فاکس شاپ

صفحه «فاکس شاپ» در پنل:

- **⛔ بستن / ✅ باز کردن فروشگاه** — با یک دکمه. وقتی بسته است،
  کاربر عادی در فروشگاه فقط پیام «فروشگاه بسته است» می‌بیند و
  خریدش حتی با زدن دکمه تأیید هم متوقف است. موجودی همه محفوظ است.
- **➕ محصول جدید** — ساخت مرحله‌ای بدون تایپ متن:
  ۱. انتخاب دسته (حجمی / زمانی)
  ۲. انتخاب پلن از **لیست زنده پلن‌های ربات**
  ۳. تنظیم حجم، مدت و قیمت با دکمه‌های +/−
  ۴. ثبت — برچسب خودکار از نام پلن ساخته می‌شود
- روی هر محصول بزنید تا صفحه جزئیات باز شود:
  ویرایش حجم، ویرایش مدت، ویرایش قیمت کوینی، فعال/غیرفعال، حذف با تأیید.

تنظیم مربوطه: `shopEnabled` (در تنظیمات پنل هم قابل تغییر است؛
از خط فرمان: `node foxcoin.js set shopEnabled false`).

قواعد ایمنی:

- هر تغییر موجودی یک رویداد «اصلاح ادمین» در دفتر کل ثبت می‌شود
  و در گردش حساب کاربر دیده می‌شود.
- کسر بیش از موجودی ممکن نیست.
- حذف محصول و پرداخت/کسر کوین قفل ضد دوبار-کلیک دارند.
- دکمه‌های +/− همان لحظه اعمال می‌شوند؛ هیچ حالتی در حافظه نمی‌ماند
  (بعد از ری‌استارت ربات هم صفحه‌ها درست‌اند).

## به‌روزرسانی سرور به نسخه فاکس شاپ

اگر پنل مدیریت قبلاً نصب است، فقط سه فایل را جایگزین کن و ری‌استارت کن
(وصله bot.js دست نمی‌خورد):

```bash
cd /root/foxteam-bot
curl -fsSL -o foxcoin.js       https://raw.githubusercontent.com/Wboyx/foxy1-agent/main/tools/foxcoin.js
curl -fsSL -o foxcoin-ui.js    https://raw.githubusercontent.com/Wboyx/foxy1-agent/main/tools/foxcoin-ui.js
curl -fsSL -o foxcoin-admin.js https://raw.githubusercontent.com/Wboyx/foxy1-agent/main/tools/foxcoin-admin.js

node foxcoin.js selftest | tail -3
node foxcoin-ui.js | tail -3
node foxcoin-admin.js | tail -3
systemctl restart foxteam-bot
```

## نصب اولیه روی سرور

```bash
cd /root/foxteam-bot

# ۱) فایل‌های جدید را جایگزین/اضافه کن:
#    foxcoin.js (نسخه جدید)، foxcoin-ui.js، foxcoin-admin.js

# ۲) اگر هسته سرور هنوز نسخه قدیمی است:
python3 upgrade-foxcoin.py --apply

# ۳) تست:
node foxcoin.js selftest | tail -3
node foxcoin-ui.js | tail -3
node foxcoin-admin.js | tail -3

# ۴) اتصال پنل به ربات (بعد از وصله فاز ۲):
python3 patch-foxcoin-admin.py --apply

# ۵) ادمین‌ها را تعیین کن (یا در کانفیگ ربات):
#    Environment=FOXCOIN_ADMINS=<شناسه عددی تو>

# ۶) ری‌استارت:
systemctl restart foxteam-bot
```

اگر چیزی خراب شد:

```bash
python3 patch-foxcoin-admin.py --revert     # برگرداندن bot.js
cp -a foxcoin.js.bak-* foxcoin.js          # برگرداندن هسته
```

## خط فرمان (کارهای پیشرفته)

```bash
node foxcoin.js products                          # فهرست محصولات
node foxcoin.js product-add '{"id":"P1","label":"سی گیگ","planId":"44trir5v","cat":"volume","gb":30,"days":30,"coins":100}'
node foxcoin.js product-del P1                    # حذف محصول
node foxcoin.js price <plan> <coins>              # قیمت کوینی پلن
node foxcoin.js prices                            # همه قیمت‌ها
node foxcoin.js top 10                            # دارندگان برتر
node foxcoin.js recent 5                          # کاربران اخیر
node foxcoin.js ledger 20                         # دفتر کل
node foxcoin.js grant <uid> <amount> <دلیل>       # افزودن/کسر کوین
node foxcoin.js set reportChatId <گروه>           # گروه گزارش
```

## تست

هر سه ماژول خودآزمون دارند (روی پوشه موقت، به داده واقعی دست نمی‌زنند):

```bash
node foxcoin.js selftest     # ۳۳ تست هسته
node foxcoin-ui.js           # ۴۲ تست رابط کاربری
node foxcoin-admin.js        # ۵۲ تست پنل مدیریت (شامل فاکس شاپ)
```
