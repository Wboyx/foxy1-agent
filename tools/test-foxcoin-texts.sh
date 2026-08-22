#!/usr/bin/env bash
# ════════════════════════════════════════════════════════════════
#  تست یکپارچه متن‌ها — جریان کامل ویرایش متن از پنل تا ذخیره
#  نسخه: 1.0 | 2026-08-22
#
#  چه چیزی را تست می‌کند:
#    استاب bot.js با ماشین حالت پیام (الگوی واقعی bot.js)، اعمال
#    patch-foxcoin-admin.py و patch-foxcoin-texts.py، سپس جریان
#    واقعی: باز کردن متن‌ها → «✏️» → ارسال متن → ذخیره در هسته →
#    انصراف/پیش‌فرض/غیرادمین.
#
#  استفاده:
#    bash test-foxcoin-texts.sh
# ════════════════════════════════════════════════════════════════
set -euo pipefail
cd "$(dirname "$0")"

DIR=$(mktemp -d)
trap 'rm -rf "$DIR"' EXIT

cp foxcoin.js foxcoin-ui.js foxcoin-admin.js "$DIR/"
mkdir -p "$DIR/bk"

cat > "$DIR/config.json" <<'EOF'
{ "token": "123:test", "botUsername": "TestBot", "admins": ["111"] }
EOF

# استاب bot.js — هم‌ساختار bot.js واقعی: هندلر پیام با ماشین حالت
cat > "$DIR/bot.js" <<'EOF'
'use strict';
const config = require('./config.json');
const coinUI = require('./foxcoin-ui');
const L = { btn_referral: "referral_label" };

global.__sent = [];

const KV = {};
async function getState(env, chatId) { const raw = KV['state:' + chatId]; return raw ? JSON.parse(raw) : null; }
async function setState(env, chatId, state) { if (state === null) delete KV['state:' + chatId]; else KV['state:' + chatId] = JSON.stringify(state); }

function isAdmin(userId, config) {
  return (config.admins || []).map(String).includes(String(userId));
}

async function editTelegram(config, chatId, messageId, text, markup) {
  global.__sent.push({ text: text, markup: markup });
  return { ok: true };
}

async function sendTelegram(config, chatId, text, markup) {
  global.__sent.push({ text: text, markup: markup });
  return { ok: true };
}

async function tg(config, method, body) { return { ok: false }; }

function mainMenu() {
  return {
    text: 'منوی اصلی',
    reply_markup: { inline_keyboard: [
      [{ text: L.btn_referral, callback_data: "referral" }],
      [{ text: coinUI.MENU_BUTTON.text, callback_data: "coin" }],
    ]},
  };
}

async function handleMessage(message, env, config) {
  const chatId = message.chat.id;
  const userId = message.from.id;
  const text = (message.text || "").trim();
  const state = await getState(env, userId);
  const settings = {};

  if (text === "/cancel" && message.chat.type === "private") {
    await setState(env, userId, null);
    return sendTelegram(config, chatId, "لغو شد", null);
  }

  if (!state) return sendTelegram(config, chatId, "دستور نامشخص", null);

  if (state.step === "awaiting_charge_amount") {
    await setState(env, chatId, null);
    return sendTelegram(config, chatId, "مبلغ ثبت شد: " + text, null);
  }

  return sendTelegram(config, chatId, "ناشناخته", null);
}

async function onCallback(cb, env, config) {
  const data = cb.data || '';
  const chatId = cb.message.chat.id;
  const userId = cb.from.id;
  if (data === "ignore") return;
    if (data === "coin" || data.startsWith("coin:")) {
      const handledByCoin = await coinUI.route({
        config: config, chatId: chatId,
        messageId: cb.message.message_id, uid: userId,
        data: data, botUsername: (config.botUsername || ""),
        editTelegram: editTelegram });
      if (handledByCoin) return;
    }
  await editTelegram(config, chatId, cb.message.message_id, 'ناشناخته', null);
}
module.exports = { onCallback, handleMessage, getState };
EOF

# اعمال پچ‌ها به ترتیب
FOXCOIN_BOT="$DIR/bot.js" FOXCOIN_BACKUP_DIR="$DIR/bk" \
  python3 patch-foxcoin-admin.py --apply > /dev/null
FOXCOIN_BOT="$DIR/bot.js" FOXCOIN_BACKUP_DIR="$DIR/bk" \
  python3 patch-foxcoin-texts.py --apply > "$DIR/patch.log"
node --check "$DIR/bot.js"

cat > "$DIR/run.js" <<'EOF'
const bot = require('./bot.js');
const coin = require('./foxcoin.js');
const assert = require('assert');
const env = {};
const cfg = { admins: ['111'] };
const cb = (data, uid) => ({ data: data, from: { id: uid },
                             message: { chat: { id: 1 }, message_id: 2 } });
const last = () => global.__sent[global.__sent.length - 1];

(async () => {
  // ۱) منوی مدیریت باز است (پچ قبلی سالم)
  await bot.onCallback(cb('admin', '111'), env, cfg);
  assert(last().text.includes('مدیریت فاکس کوین'), 'منوی مدیریت باز نشد');

  // ۲) صفحه متن‌ها
  await bot.onCallback(cb('admin:texts', '111'), env, cfg);
  assert(JSON.stringify(last().markup).includes('admin:tedit:menu_note'),
         'دکمه ویرایش متن در صفحه متن‌ها نیست');

  // ۳) زدن «✏️» → حالت ثبت شد + پیام «متن را بفرست» آمد
  await bot.onCallback(cb('admin:tedit:menu_note', '111'), env, cfg);
  const sent = last();
  assert(String(sent.text).includes('متن جدید را بفرست'),
         'پیام درخواست متن فرستاده نشد');
  const st = await bot.getState(env, '111');
  assert(st && st.step === 'coin_admin_awaiting_text',
         'حالت دریافت متن در bot.js ثبت نشد');

  // ۴) ادمین متن می‌فرستد → ذخیره در هسته + تأیید
  await bot.handleMessage({ chat: { id: 1, type: 'private' },
                            from: { id: 111 }, text: 'متن نو من' }, env, cfg);
  assert(coin.getTexts().menu_note === 'متن نو من',
         'متن در هسته ذخیره نشد');
  assert(last().text.includes('متن ذخیره شد'), 'پیام تأیید نیامد');
  assert(await bot.getState(env, '111') === null, 'حالت پاک نشد');

  // ۵) صفحه متن‌ها حالا سفارشی را نشان می‌دهد
  await bot.onCallback(cb('admin:texts', '111'), env, cfg);
  assert(JSON.stringify(last().markup).includes('متن نو من'),
         'متن سفارشی در فهرست دیده نمی‌شود');

  // ۶) متن با < رد می‌شود
  await bot.onCallback(cb('admin:tedit:guide_what', '111'), env, cfg);
  await bot.handleMessage({ chat: { id: 1, type: 'private' },
                            from: { id: 111 }, text: '<b>x</b>' }, env, cfg);
  assert(coin.getTexts().guide_what === coin.TEXTS.guide_what,
         'متن نامعتبر نباید ذخیره می‌شد');
  assert(last().text.includes('ذخیره نشد'), 'پیام خطا برای متن نامعتبر نیامد');

  // ۷) انصراف → حالت و pending پاک شد
  await bot.onCallback(cb('admin:tcancel', '111'), env, cfg);
  await bot.handleMessage({ chat: { id: 1, type: 'private' },
                            from: { id: 111 }, text: 'پس از انصراف' }, env, cfg);
  assert(coin.getTexts().menu_note === 'متن نو من',
         'متن پس از انصراف نباید عوض می‌شد');

  // ۸) برگشت به پیش‌فرض
  await bot.onCallback(cb('admin:treset:menu_note', '111'), env, cfg);
  assert(coin.getTexts().menu_note === coin.TEXTS.menu_note,
         'برگشت به پیش‌فرض کار نکرد');

  // ۹) غیرادمین: هم درِ پنل بسته است هم routeText رد می‌کند
  await bot.onCallback(cb('admin:tedit:menu_note', '222'), env, cfg);
  assert(last().text.includes('فقط برای مدیریت'),
         'غیرادمین نباید به صفحه ویرایش برسد');
  await bot.handleMessage({ chat: { id: 1, type: 'private' },
                            from: { id: 222 }, text: 'دزدی' }, env, cfg);
  assert(coin.getTexts().menu_note === coin.TEXTS.menu_note,
         'غیرادمین نباید بتواند متن را عوض کند');

  // ۱۰) جریان‌های قبلی ربات دست‌نخورده‌اند
  await bot.handleMessage({ chat: { id: 1, type: 'private' },
                            from: { id: 333 }, text: 'سلام' }, env, cfg);
  assert(last().text === 'دستور نامشخص', 'پیام عادی ربات تغییر کرده');
  await bot.onCallback(cb('admin:tedit:menu_note', '111'), env, cfg);
  await bot.handleMessage({ chat: { id: 1, type: 'private' },
                            from: { id: 111 }, text: '/cancel' }, env, cfg);
  assert(last().text === 'لغو شد', '/cancel باید بدون ذخیره لغو کند');
  assert(coin.getTexts().menu_note === coin.TEXTS.menu_note,
         '/cancel نباید متنی ذخیره کند');

  console.log('✅ تست متن‌ها: پنل → ارسال → ذخیره → انصراف → پیش‌فرض → امنیت، همه سالم‌اند');
})().catch(e => { console.log('❌ ' + e.message); process.exit(1); });
EOF

node "$DIR/run.js"

# برگشت و اعمال دوباره هم باید سالم باشد
FOXCOIN_BOT="$DIR/bot.js" FOXCOIN_BACKUP_DIR="$DIR/bk" \
  python3 patch-foxcoin-texts.py --revert > /dev/null
node --check "$DIR/bot.js"
FOXCOIN_BOT="$DIR/bot.js" FOXCOIN_BACKUP_DIR="$DIR/bk" \
  python3 patch-foxcoin-texts.py --apply > /dev/null
node "$DIR/run.js"

echo "✅ تست یکپارچه متن‌ها کامل شد (اعمال + revert + اعمال دوباره)"
