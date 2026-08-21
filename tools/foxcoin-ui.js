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
  else if (d === 'coin:shop') s = screenSoon(T.shop);
  else if (d === 'coin:miss') s = screenSoon(T.missions);
  else return false;

  await ctx.editTelegram(ctx.config, ctx.chatId, ctx.messageId, s.text, s.markup);
  return true;
}

/** برچسب دکمه‌ای که در منوی اصلی ربات اضافه می‌شود. */
const MENU_BUTTON = { text: T.title, callback_data: 'coin' };

module.exports = { route, MENU_BUTTON, T,
                   screenMenu, screenBalance, screenHistory, screenReferral };

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
      console.log('\nهمه تست‌ها گذشتند.');
    });
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
