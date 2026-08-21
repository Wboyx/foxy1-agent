'use strict';
/**
 * ════════════════════════════════════════════════════════════════
 *  FOX COIN UI — رابط کاربری کوین
 *  نسخه: 1.0.0 | 2026-08-21 | فاز ۲
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
  shop: '🛒 خرید با کوین',
  missions: '🎯 ماموریت‌ها',
  referral: '👥 زیرمجموعه‌های من',
  history: '📜 تاریخچه',
  back: '⬅️ بازگشت',
  soon: 'این بخش در مرحله بعد فعال می‌شود.',
};

const EVENT_FA = {
  signup: 'جایزه ثبت‌نام',
  mission: 'ماموریت',
  purchase: 'خرید',
  referral: 'زیرمجموعه',
  spend: 'خرید با کوین',
  admin: 'اصلاح ادمین',
  reset: 'صفرسازی',
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
  const text =
    '<b>' + T.title + '</b>\n\n' +
    'موجودی فعلی شما\n' +
    '<code>' + fa(bal) + '</code> کوین\n\n' +
    'با کوین می‌توانید اشتراک رایگان بگیرید.';
  return {
    text: text,
    markup: kb([
      [{ text: T.balance, callback_data: 'coin:bal' },
       { text: T.shop, callback_data: 'coin:shop', style: 'success' }],
      [{ text: T.missions, callback_data: 'coin:miss' },
       { text: T.referral, callback_data: 'coin:ref' }],
      [{ text: T.history, callback_data: 'coin:hist' }],
      [{ text: T.back, callback_data: 'back_main' }],
    ]),
  };
}

function screenBalance(uid) {
  const led = coin.readLedger().filter(r => String(r.uid) === String(uid));
  const earned = led.filter(r => r.amount > 0).reduce((a, r) => a + r.amount, 0);
  const spent = led.filter(r => r.amount < 0).reduce((a, r) => a - r.amount, 0);
  const text =
    '<b>' + T.balance + '</b>\n\n' +
    'موجودی فعلی\n<code>' + fa(coin.getBalance(uid)) + '</code> کوین\n\n' +
    'مجموع دریافتی\n<code>' + fa(earned) + '</code> کوین\n\n' +
    'مجموع خرج‌شده\n<code>' + fa(spent) + '</code> کوین';
  return { text: text, markup: kb([[{ text: T.back, callback_data: 'coin' }]]) };
}

function screenHistory(uid) {
  const rows = coin.history(uid, 15);
  let text = '<b>' + T.history + '</b>\n\n';
  if (!rows.length) {
    text += 'هنوز هیچ رویدادی ثبت نشده است.';
  } else {
    text += rows.map(r => {
      const sign = r.amount > 0 ? '+' : '';
      return when(r.ts) + '  ' + (EVENT_FA[r.type] || r.type) +
             '\n<code>' + sign + fa(r.amount) + '</code>  →  ' +
             '<code>' + fa(r.balance) + '</code>';
    }).join('\n\n');
  }
  return { text: text, markup: kb([[{ text: T.back, callback_data: 'coin' }]]) };
}

function screenReferral(uid, botUsername) {
  const c = coin.getSettings();
  const led = coin.readLedger()
    .filter(r => String(r.uid) === String(uid) && r.type === 'referral');
  const total = led.reduce((a, r) => a + r.amount, 0);
  const link = botUsername
    ? 'https://t.me/' + botUsername + '?start=ref' + uid
    : 'ref' + uid;
  const text =
    '<b>' + T.referral + '</b>\n\n' +
    'به ازای هر خرید زیرمجموعه\n<code>' + fa(c.referralReward) + '</code> کوین می‌گیرید.\n\n' +
    'تعداد خرید زیرمجموعه‌ها\n<code>' + fa(led.length) + '</code>\n\n' +
    'کوین دریافتی از این راه\n<code>' + fa(total) + '</code>\n\n' +
    'لینک دعوت شما\n<code>' + link + '</code>';
  return { text: text, markup: kb([[{ text: T.back, callback_data: 'coin' }]]) };
}

// ───────────────────────── فروشگاه کوینی ─────────────────────────

function screenShop(uid) {
  const items = coin.listProducts();
  const bal = coin.getBalance(uid);
  let text = '<b>' + T.shop + '</b>\n\nموجودی شما <code>' + fa(bal) + '</code> کوین\n';
  if (!items.length) {
    text += '\nهنوز محصولی برای خرید با کوین تعریف نشده است.';
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
    '<b>تأیید خرید</b>\n\n' +
    'محصول\n' + p.label + '\n\n' +
    (p.gb ? 'حجم\n<code>' + fa(p.gb) + '</code> گیگابایت\n\n' : '') +
    (p.days ? 'مدت\n<code>' + fa(p.days) + '</code> روز\n\n' : '') +
    'هزینه\n<code>' + fa(p.coins) + '</code> کوین\n\n' +
    'موجودی بعد از خرید\n<code>' + fa(bal - p.coins) + '</code> کوین';
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
      text: '<b>✅ انجام شد</b>\n\n' + p.label + ' برای شما صادر شد.\n\n' +
            '<code>' + fa(p.coins) + '</code> کوین کم شد.\n' +
            'موجودی جدید <code>' + fa(r.balance) + '</code> کوین\n\n' +
            'مشخصات سرویس در پیام بعدی ارسال شد.',
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
  else if (d === 'coin:ref') s = screenReferral(ctx.uid, ctx.botUsername);
  else if (d === 'coin:shop') s = screenShop(ctx.uid);
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
                   screenHistory, screenReferral, screenShop, screenConfirm };

// ───────────────────────── خودآزمون ─────────────────────────

if (require.main === module) {
  const os = require('os'), fsx = require('fs'), pathx = require('path');
  const child = require('child_process');
  if (process.env.FOXCOIN_UI_CHILD) {
    const a = (c, m) => { if (!c) { console.log('❌ ' + m); process.exit(1); }
                          console.log('✅ ' + m); };
    coin.addEvent('u9', 'signup', 5);
    coin.addEvent('u9', 'referral', 10);
    coin.addEvent('u9', 'spend', -3);

    const m = screenMenu('u9');
    a(m.text.includes('12'), 'موجودی در منو درست نمایش داده شد');
    a(m.markup.inline_keyboard.length === 4, 'منو چهار ردیف دارد');
    a(JSON.stringify(m.markup).includes('"style":"success"'),
      'دکمه خرید سبز است');

    const b = screenBalance('u9');
    a(b.text.includes('15'), 'مجموع دریافتی ۱۵ است');
    a(b.text.includes('3'), 'مجموع خرج‌شده ۳ است');

    const h = screenHistory('u9');
    a(h.text.includes('زیرمجموعه'), 'نام رویداد فارسی شد');
    a(h.text.includes('+10'), 'علامت مثبت گذاشته شد');

    const r = screenReferral('u9', 'FoxWboyx_bot');
    a(r.text.includes('t.me/FoxWboyx_bot?start=refu9'), 'لینک دعوت ساخته شد');
    a(r.text.includes('10'), 'کوین زیرمجموعه شمرده شد');

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
