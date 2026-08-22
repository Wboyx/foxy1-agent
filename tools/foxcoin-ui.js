'use strict';
/**
 * ════════════════════════════════════════════════════════════════
 *  FOX COIN UI — رابط کاربری کوین
 *  نسخه: 1.2.0 | 2026-08-22 | فاز ۲ + سوئیچ فروشگاه + جوایز زنده (بدون دعوت)
 * ════════════════════════════════════════════════════════════════
 *
 *  چرا ماژول جدا:
 *    bot.js سه هزار و نهصد خط است و کاربر واقعی رویش است. هرچه
 *    کمتر دستش بزنیم ریسک کمتر. کل رابط کوین اینجاست و در ربات
 *    فقط سه خط اضافه می‌شود.
 *
 *  چرا توابع ارسال از بیرون تزریق می‌شوند:
 *    اگر این ماژول خودش bot.js را require کند، حلقه وابستگی
 *    درست می‌شود. پس ربات توابع خودش را به ما می‌دهد.
 *
 *  فاز ۲ فقط نمایش است. خرید و ماموریت در فازهای بعد.
 */

const coin = require('./foxcoin');

const T = {
  title: '🪙 فاکس کوین',
  balance: '💰 موجودی من',
  shop: '🛒 فروشگاه کوینی',
  missions: '🎯 ماموریت‌ها',
  history: '📜 گردش حساب',
  guide: '❓ راهنما',
  back: '⬅️ بازگشت',
  home: '🏠 منوی اصلی',
  soon: 'این بخش به‌زودی فعال می‌شود.',
};

const LINE = '➖➖➖➖➖➖➖➖➖➖';

const EVENT_FA = {
  signup: 'جایزه ثبت‌نام',
  mission: 'ماموریت',
  purchase: 'خرید',
  referral: 'دعوت دوستان',
  spend: 'خرید با کوین',
  admin: 'اصلاح ادمین',
  reset: 'صفرسازی',
  join: 'جوین کانال',
};

function fa(n) {
  return Number(n || 0).toLocaleString('en-US');
}

function when(ts) {
  const d = new Date(ts);
  const p = (x) => String(x).padStart(2, '0');
  return p(d.getMonth() + 1) + '/' + p(d.getDate()) + ' ' +
         p(d.getHours()) + ':' + p(d.getMinutes());
}

function kb(rows) {
  return { inline_keyboard: rows };
}

// ───────────────────────── صفحه‌ها ─────────────────────────

function screenMenu(uid) {
  const bal = coin.getBalance(uid);
  const items = coin.listProducts();
  const cheapest = items.length ? items[0].coins : null;
  const text =
    '<b>' + T.title + '</b>\n' +
    'سکه اختصاصی فاکس شاپ\n' + LINE + '\n\n' +
    '💰 <b>موجودی شما</b>\n' +
    '<code>' + fa(bal) + '</code> کوین\n\n' +
    (cheapest !== null
      ? (bal >= cheapest
          ? '✅ موجودی شما برای خرید کافی است.\n\n'
          : '📈 برای ارزان‌ترین سرویس <code>' + fa(cheapest - bal) +
            '</code> کوین دیگر لازم دارید.\n\n')
      : '') +
    '🎁 با فعالیت در ربات کوین جمع کنید و\n' +
    'سرویس رایگان بگیرید.\n\n' +
    '<i>برای شروع، راهنما را ببینید.</i>';
  return {
    text: text,
    markup: kb([
      [{ text: T.shop, callback_data: 'coin:shop', style: 'success' }],
      [{ text: T.balance, callback_data: 'coin:bal' },
       { text: T.history, callback_data: 'coin:hist' }],
      [{ text: T.missions, callback_data: 'coin:miss' },
       { text: T.guide, callback_data: 'coin:help', style: 'primary' }],
      [{ text: T.home, callback_data: 'back_main' }],
    ]),
  };
}

/**
 * راهنما. تمام اعداد از تنظیمات زنده خوانده می‌شوند.
 *
 * چرا: اگر نرخ‌ها را در متن ثابت بنویسیم، روزی که از پنل عوضشان کنی
 * راهنما دروغ می‌گوید. متن ثابت، بدترین نوع مستندات است.
 */
function screenGuide(uid) {
  const c = coin.getSettings();
  const rw = coin.getRewards();
  const items = coin.listProducts();
  const earn = [];
  if (rw.signup > 0) {
    earn.push('• ثبت‌نام در ربات\n   <code>' + fa(rw.signup) + '</code> کوین، یک‌بار');
  }
  if (rw.join > 0) {
    earn.push('• جوین کانال/گروه\n   <code>' + fa(rw.join) + '</code> کوین، یک‌بار');
  }
  earn.push(c.purchaseMode === 'relative'
    ? '• خرید سرویس\n   هر <code>' + fa(c.purchasePerAmount) +
      '</code> تومان، <code>1</code> کوین'
    : '• خرید سرویس\n   هر خرید <code>' + fa(c.purchaseFixed) + '</code> کوین');
  if (rw.referral > 0) {
    earn.push('• خرید دوستان دعوت‌شده\n   هر خرید <code>' +
              fa(rw.referral) + '</code> کوین');
  }
  if (rw.mission > 0) {
    earn.push('• انجام ماموریت‌ها\n   هر ماموریت <code>' +
              fa(rw.mission) + '</code> کوین');
  }

  let spend = 'هنوز محصولی تعریف نشده است.';
  if (items.length) {
    spend = items.map(p =>
      '• ' + p.label + '\n   <code>' + fa(p.coins) + '</code> کوین'
    ).join('\n');
  }

  const text =
    '<b>' + T.guide + ' فاکس کوین</b>\n' + LINE + '\n\n' +
    '<b>فاکس کوین چیست</b>\n' +
    'یک امتیاز داخلی که با فعالیت در ربات جمع می‌شود و\n' +
    'با آن بدون پرداخت پول، سرویس می‌گیرید.\n\n' +
    '<b>چطور کوین بگیرم</b>\n' + earn.join('\n') + '\n\n' +
    '<b>با کوین چه بگیرم</b>\n' + spend + '\n\n' +
    '<b>قوانین</b>\n' +
    '• سقف دریافت روزانه <code>' + fa(c.dailyCap) + '</code> کوین\n' +
    '• هر فعالیت فقط یک‌بار جایزه دارد\n' +
    '• کوین قابل انتقال به کاربر دیگر یا تبدیل به پول نیست\n\n' +
    '<i>همه رویدادها در گردش حساب ثبت می‌شود.</i>';
  return { text: text, markup: kb([
    [{ text: T.shop, callback_data: 'coin:shop', style: 'success' }],
    [{ text: T.back, callback_data: 'coin' }],
  ]) };
}

function screenBalance(uid) {
  const led = coin.readLedger().filter(r => String(r.uid) === String(uid));
  const earned = led.filter(r => r.amount > 0).reduce((a, r) => a + r.amount, 0);
  const spent = led.filter(r => r.amount < 0).reduce((a, r) => a - r.amount, 0);
  const c = coin.getSettings();
  const today = coin.readLedger().filter(r =>
    String(r.uid) === String(uid) && r.amount > 0 && r.type !== 'admin' &&
    new Date(r.ts).toDateString() === new Date().toDateString())
    .reduce((a, r) => a + r.amount, 0);
  const text =
    '<b>' + T.balance + '</b>\n' + LINE + '\n\n' +
    '💰 <b>موجودی فعلی</b>\n<code>' + fa(coin.getBalance(uid)) + '</code> کوین\n\n' +
    '📥 مجموع دریافتی\n<code>' + fa(earned) + '</code> کوین\n\n' +
    '📤 مجموع خرج‌شده\n<code>' + fa(spent) + '</code> کوین\n\n' +
    '📅 دریافتی امروز\n<code>' + fa(today) + '</code> از <code>' +
    fa(c.dailyCap) + '</code> کوین\n\n' +
    '<i>سقف روزانه هر شب صفر می‌شود.</i>';
  return { text: text, markup: kb([
    [{ text: T.guide, callback_data: 'coin:help' }],
    [{ text: T.back, callback_data: 'coin' }]]) };
}

function screenHistory(uid) {
  const rows = coin.history(uid, 15);
  let text = '<b>' + T.history + '</b>\n' + LINE + '\n\n';
  if (!rows.length) {
    text += 'هنوز رویدادی ثبت نشده است.\n\n' +
            '<i>به محض دریافت یا خرج کوین، اینجا ثبت می‌شود.</i>';
  } else {
    text += '<i>۱۵ رویداد آخر</i>\n\n';
    text += rows.map(r => {
      const sign = r.amount > 0 ? '+' : '';
      return when(r.ts) + '  ' + (EVENT_FA[r.type] || r.type) +
             '\n<code>' + sign + fa(r.amount) + '</code>  →  ' +
             '<code>' + fa(r.balance) + '</code>';
    }).join('\n\n');
  }
  return { text: text, markup: kb([[{ text: T.back, callback_data: 'coin' }]]) };
}

// ───────────────────────── فروشگاه کوینی ─────────────────────────

function screenShop(uid) {
  const items = coin.listProducts();
  const bal = coin.getBalance(uid);
  const c = coin.getSettings();
  if (!c.shopEnabled) {
    return {
      text: '<b>' + T.shop + '</b>\n' + LINE + '\n\n' +
            '⛔ فروشگاه در حال حاضر <b>بسته</b> است.\n\n' +
            '🪙 موجودی شما <code>' + fa(bal) + '</code> کوین محفوظ است.\n' +
            '<i>به‌زودی باز می‌شود.</i>',
      markup: kb([[{ text: T.back, callback_data: 'coin' }]]),
    };
  }
  let text = '<b>' + T.shop + '</b>\n' + LINE + '\n\n' +
             '💰 موجودی شما <code>' + fa(bal) + '</code> کوین\n\n' +
             '<i>پس از تأیید، سرویس بلافاصله ساخته می‌شود.</i>\n';
  if (!items.length) {
    text += '\n📭 هنوز محصولی برای خرید با کوین تعریف نشده است.\n' +
            'کوین‌هایتان محفوظ است، به‌زودی سر بزنید.';
    return { text: text, markup: kb([[{ text: T.back, callback_data: 'coin' }]]) };
  }
  const rows = items.map(p => {
    const afford = bal >= p.coins;
    return [{ text: (afford ? '' : '🔒 ') + p.label + '  —  ' + fa(p.coins) + ' کوین',
              callback_data: afford ? ('coin:buy:' + p.id) : 'coin:poor:' + p.id }];
  });
  rows.push([{ text: T.back, callback_data: 'coin' }]);
  return { text: text, markup: kb(rows) };
}

function screenConfirm(uid, pid) {
  const p = coin.getProduct(pid);
  if (!p) return screenError('این محصول دیگر موجود نیست.');
  const bal = coin.getBalance(uid);
  const text =
    '<b>🧾 تأیید خرید</b>\n' + LINE + '\n\n' +
    '📦 محصول\n' + p.label + '\n\n' +
    (p.gb ? 'حجم\n<code>' + fa(p.gb) + '</code> گیگابایت\n\n' : '') +
    (p.days ? 'مدت\n<code>' + fa(p.days) + '</code> روز\n\n' : '') +
    'هزینه\n<code>' + fa(p.coins) + '</code> کوین\n\n' +
    '💳 موجودی بعد از خرید\n<code>' + fa(bal - p.coins) + '</code> کوین\n\n' +
    '<i>این خرید قابل بازگشت نیست.</i>';
  return { text: text, markup: kb([
    [{ text: '✅ تأیید و دریافت', callback_data: 'coin:go:' + p.id, style: 'success' }],
    [{ text: '⬅️ انصراف', callback_data: 'coin:shop' }],
  ]) };
}

function screenPoor(uid, pid) {
  const p = coin.getProduct(pid);
  const need = p ? p.coins - coin.getBalance(uid) : 0;
  return { text: '<b>موجودی کافی نیست</b>\n\nبرای این محصول <code>' +
                 fa(need) + '</code> کوین دیگر لازم دارید.',
           markup: kb([[{ text: T.back, callback_data: 'coin:shop' }]]) };
}

function screenError(msg) {
  return { text: '❌ ' + msg,
           markup: kb([[{ text: T.back, callback_data: 'coin:shop' }]]) };
}

// قفل ضد دوبار زدن. کلیک سریع دوباره نباید دو سرویس بسازد.
const busy = new Set();

/**
 * اجرای خرید.
 *
 * ترتیب عمداً این است:
 *   ۱. موجودی چک شود
 *   ۲. سرویس ساخته شود
 *   ۳. تازه بعد کوین کم شود
 *
 * اگر ساخت سرویس استثنا بدهد، هیچ کوینی کم نشده است.
 * برعکسش خطرناک بود: کوین کم می‌شد و کاربر چیزی نمی‌گرفت.
 */
async function doPurchase(ctx, pid) {
  const uid = String(ctx.uid);
  const p = coin.getProduct(pid);
  if (!p) return screenError('این محصول دیگر موجود نیست.');
  if (!coin.getSettings().shopEnabled) {
    return screenError('فروشگاه در حال حاضر بسته است.');
  }

  const bal = coin.getBalance(uid);
  if (bal < p.coins) return screenPoor(uid, pid);

  if (busy.has(uid)) return screenError('یک درخواست شما در حال انجام است.');
  busy.add(uid);
  try {
    const plans = await ctx.getPlans(ctx.env, p.cat);
    const plan = (plans || []).find(x => String(x.id) === String(p.planId));
    if (!plan) return screenError('پلن این محصول پیدا نشد. به پشتیبانی بگویید.');
    if (!plan.inbounds || !plan.inbounds.length) {
      return screenError('این پلن هنوز پیکربندی نشده است.');
    }

    const username = 'fox' + Math.random().toString(36).slice(2, 8);
    let link = null;
    try {
      link = await ctx.deliverService(ctx.env, ctx.config, uid, {
        desc: p.label, username: username, cat: p.cat,
        inbounds: plan.inbounds, days: p.days || plan.days || 0,
        gb: p.gb || 0, panelId: plan.panelId || null, planId: plan.id,
      });
    } catch (e) {
      return screenError('ساخت سرویس انجام نشد. کوین شما کم نشد.\n<code>' +
                         String(e && e.message || e).slice(0, 120) + '</code>');
    }

    const r = coin.addEvent(uid, 'spend', -p.coins,
                            { product: p.id, plan: plan.id, link: link });
    if (!r.ok) {
      return screenError('سرویس ساخته شد ولی ثبت کوین انجام نشد. به پشتیبانی بگویید.');
    }
    return {
      text: '<b>✅ خرید انجام شد</b>\n' + LINE + '\n\n' +
            '📦 ' + p.label + ' برای شما صادر شد.\n\n' +
            '<code>' + fa(p.coins) + '</code> کوین کم شد.\n' +
            'موجودی جدید <code>' + fa(r.balance) + '</code> کوین\n\n' +
            '📩 مشخصات و لینک اتصال در پیام بعدی ارسال شد.',
      markup: kb([[{ text: T.back, callback_data: 'coin' }]]),
    };
  } finally {
    busy.delete(uid);
  }
}

function screenSoon(title) {
  return {
    text: '<b>' + title + '</b>\n\n' + T.soon,
    markup: kb([[{ text: T.back, callback_data: 'coin' }]]),
  };
}

// ───────────────────────── مسیریاب ─────────────────────────

/**
 * تنها نقطه ورود. ربات هرچه با coin شروع شود را به اینجا می‌دهد.
 *
 * ctx = { config, chatId, messageId, uid, data, botUsername, editTelegram }
 * اگر رویداد ناشناخته بود، false برمی‌گرداند تا ربات خودش تصمیم بگیرد.
 */
async function route(ctx) {
  const d = String(ctx.data || '');
  let s = null;

  if (d === 'coin') s = screenMenu(ctx.uid);
  else if (d === 'coin:bal') s = screenBalance(ctx.uid);
  else if (d === 'coin:hist') s = screenHistory(ctx.uid);

  else if (d === 'coin:shop') s = screenShop(ctx.uid);
  else if (d === 'coin:help') s = screenGuide(ctx.uid);
  else if (d === 'coin:miss') s = screenSoon(T.missions);
  else if (d.startsWith('coin:poor:')) s = screenPoor(ctx.uid, d.slice(10));
  else if (d.startsWith('coin:buy:')) s = screenConfirm(ctx.uid, d.slice(9));
  else if (d.startsWith('coin:go:')) s = await doPurchase(ctx, d.slice(8));
  else return false;

  await ctx.editTelegram(ctx.config, ctx.chatId, ctx.messageId, s.text, s.markup);
  return true;
}

/** برچسب دکمه‌ای که در منوی اصلی ربات اضافه می‌شود. */
const MENU_BUTTON = { text: T.title, callback_data: 'coin' };

module.exports = { route, MENU_BUTTON, T, screenMenu, screenBalance,
                   screenHistory, screenShop, screenConfirm,
                   screenGuide };

// ───────────────────────── خودآزمون ─────────────────────────

if (require.main === module) {
  const os = require('os'), fsx = require('fs'), pathx = require('path');
  const child = require('child_process');
  if (process.env.FOXCOIN_UI_CHILD) {
    const a = (c, m) => { if (!c) { console.log('❌ ' + m); process.exit(1); }
                          console.log('✅ ' + m); };
    coin.addEvent('u9', 'signup', 5);
    coin.addEvent('u9', 'join', 10);
    coin.addEvent('u9', 'spend', -3);

    const m = screenMenu('u9');
    a(m.text.includes('12'), 'موجودی در منو درست نمایش داده شد');
    a(m.markup.inline_keyboard.length === 4, 'منو چهار ردیف دارد');
    a(!JSON.stringify(m.markup).includes('coin:ref'), 'بخش دعوت حذف شد');
    a(JSON.stringify(m.markup).includes('"style":"success"'),
      'دکمه خرید سبز است');

    const b = screenBalance('u9');
    a(b.text.includes('15'), 'مجموع دریافتی ۱۵ است');
    a(b.text.includes('3'), 'مجموع خرج‌شده ۳ است');

    const h = screenHistory('u9');
    a(h.text.includes('جوین کانال'), 'نام رویداد جوین فارسی شد');
    a(h.text.includes('+10'), 'علامت مثبت گذاشته شد');

    const empty = screenHistory('nobody');
    a(empty.text.includes('هنوز'), 'تاریخچه خالی پیام درست دارد');

    let sent = null;
    const fakeEdit = async (c, ch, mid, text, markup) => { sent = { text, markup }; };
    route({ data: 'coin:bal', uid: 'u9', config: {}, chatId: 1, messageId: 2,
            editTelegram: fakeEdit }).then(ok => {
      a(ok === true, 'مسیریاب صفحه موجودی را شناخت');
      a(sent && sent.text.includes('موجودی فعلی'), 'متن درست ارسال شد');
      return route({ data: 'other', uid: 'u9', editTelegram: fakeEdit });
    }).then(ok => {
      a(ok === false, 'رویداد بیگانه رد شد و به ربات واگذار شد');
      return shopTests(a);
    }).then(() => {
      console.log('\nهمه تست‌ها گذشتند.');
    }).catch(e => { console.log('❌ ' + e.message); process.exit(1); });

    async function shopTests(a) {
      const fakePlans = async () => ([{ id: 'PL1', name: 'تست', panelId: 'PN1',
                                        days: 30, inbounds: [{ id: 7 }] }]);
      coin.addEvent('u9', 'admin', 500);

      let sh = screenShop('u9');
      a(sh.text.includes('هنوز محصولی'), 'فروشگاه خالی پیام درست دارد');

      coin.setProduct({ id: 'P30', label: 'سی گیگ', planId: 'PL1',
                        cat: 'volume', gb: 30, days: 30, coins: 100 });
      coin.setProduct({ id: 'PBIG', label: 'گران', planId: 'PL1',
                        cat: 'volume', gb: 300, days: 30, coins: 9999 });

      sh = screenShop('u9');
      a(JSON.stringify(sh.markup).includes('coin:buy:P30'), 'محصول قابل خرید دکمه خرید دارد');
      a(JSON.stringify(sh.markup).includes('coin:poor:PBIG'), 'محصول گران قفل شد');

      const cf = screenConfirm('u9', 'P30');
      a(cf.text.includes('30'), 'صفحه تأیید حجم را نشان داد');
      a(JSON.stringify(cf.markup).includes('coin:go:P30'), 'دکمه تأیید درست است');

      // سناریوی حیاتی: ساخت سرویس شکست بخورد
      const before = coin.getBalance('u9');
      const failCtx = { uid: 'u9', env: {}, config: {}, getPlans: fakePlans,
                        deliverService: async () => { throw new Error('پنل جواب نداد'); } };
      const r1 = await doPurchase(failCtx, 'P30');
      a(r1.text.includes('کوین شما کم نشد'), 'شکست سرویس پیام درست داد');
      a(coin.getBalance('u9') === before, 'در شکست سرویس، کوین دست‌نخورده ماند');

      // مسیر موفق
      let got = null;
      const okCtx = { uid: 'u9', env: {}, config: {}, getPlans: fakePlans,
                      deliverService: async (e, c, uid, o) => { got = o; return 'https://sub/x'; } };
      const r2 = await doPurchase(okCtx, 'P30');
      a(r2.text.includes('انجام شد'), 'خرید موفق پیام درست داد');
      a(coin.getBalance('u9') === before - 100, 'دقیقاً صد کوین کم شد');
      a(got && got.gb === 30 && got.days === 30, 'حجم و مدت درست فرستاده شد');
      a(got && got.inbounds.length === 1, 'اینباند پلن منتقل شد');
      a(/^fox[a-z0-9]{5,6}$/.test(got.username), 'نام‌کاربری خودکار ساخته شد');
      const last = coin.history('u9', 1)[0];
      a(last.meta && last.meta.link === 'https://sub/x', 'لینک سرویس در دفتر ثبت شد');

      // پلن ناموجود
      const noPlan = { uid: 'u9', env: {}, config: {}, getPlans: async () => ([]),
                       deliverService: async () => 'x' };
      const r3 = await doPurchase(noPlan, 'P30');
      a(r3.text.includes('پلن این محصول پیدا نشد'), 'پلن ناموجود گرفته شد');

      // موجودی ناکافی
      const r4 = await doPurchase(okCtx, 'PBIG');
      a(r4.text.includes('کوین دیگر لازم'), 'موجودی ناکافی جلوی خرید را گرفت');

      // ── فروشگاه بسته
      coin.setSetting('shopEnabled', false);
      let cs = screenShop('u9');
      a(cs.text.includes('بسته'), 'فروشگاه بسته پیام درست دارد');
      a(!JSON.stringify(cs.markup).includes('coin:buy'), 'فروشگاه بسته دکمه خرید ندارد');
      const r5 = await doPurchase(okCtx, 'P30');
      a(r5.text.includes('بسته است'), 'خرید در فروشگاه بسته متوقف شد');
      a(coin.getBalance('u9') === before - 100, 'موجودی در فروشگاه بسته دست نخورد');
      coin.setSetting('shopEnabled', true);
      cs = screenShop('u9');
      a(cs.text.includes('موجودی شما'), 'فروشگاه باز دوباره عادی شد');

      // ── راهنمای زنده (جوایز از پنل قابل تغییر)
      coin.setReward('join', 25);
      coin.setReward('signup', 17);
      coin.setSetting('dailyCap', 333);
      let g = screenGuide('u9');
      a(g.text.includes('25'), 'راهنما جایزه جوین را زنده خواند');
      a(g.text.includes('17'), 'راهنما جایزه ثبت‌نام را زنده خواند');
      a(g.text.includes('333'), 'راهنما سقف روزانه را زنده خواند');
      a(g.text.includes('سی گیگ'), 'راهنما محصولات واقعی را فهرست کرد');
      coin.setSetting('purchaseMode', 'relative');
      coin.setSetting('purchasePerAmount', 25000);
      g = screenGuide('u9');
      a(g.text.includes('25,000'), 'راهنما حالت نسبی را درست نوشت');
      coin.setSetting('purchaseMode', 'fixed');
      g = screenGuide('u9');
      a(!g.text.includes('25,000'), 'راهنما با تغییر حالت به‌روز شد');
      a(JSON.stringify(g.markup).includes('coin:shop'), 'راهنما دکمه فروشگاه دارد');

      const mm = screenMenu('u9');
      a(mm.text.includes('راهنما') || JSON.stringify(mm.markup).includes('coin:help'),
        'دکمه راهنما در منو هست');
      a(mm.markup.inline_keyboard.length === 4, 'منو چهار ردیف شد');

      let hit = null;
      await route({ data: 'coin:help', uid: 'u9', config: {}, chatId: 1, messageId: 2,
                    editTelegram: async (c, ch, mi, t) => { hit = t; } });
      a(hit && hit.includes('فاکس کوین چیست'), 'مسیریاب راهنما را شناخت');
    }
  } else {
    const tmp = fsx.mkdtempSync(pathx.join(os.tmpdir(), 'foxcoinui-'));
    const r = child.spawnSync(process.execPath, [__filename], {
      env: Object.assign({}, process.env,
        { FOXCOIN_DATA_DIR: tmp, FOXCOIN_UI_CHILD: '1' }),
      encoding: 'utf8' });
    process.stdout.write(r.stdout || '');
    process.stderr.write(r.stderr || '');
    console.log('\nپوشه آزمون: ' + tmp);
    process.exit(r.status || 0);
  }
}
