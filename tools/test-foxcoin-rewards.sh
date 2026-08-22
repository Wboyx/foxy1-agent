#!/usr/bin/env bash
# ════════════════════════════════════════════════════════════════
#  تست یکپارچه جوایز — هوک خرید در bot.js به موتور جوایز وصل می‌شود
#  نسخه: 1.0 | 2026-08-22
#
#  چه چیزی را تست می‌کند:
#    استاب bot.js با تابع fulfillOrder (قیف مرکزی خرید)، اعمال
#    patch-foxcoin-admin.py و patch-foxcoin-rewards.py، سپس جریان:
#    خرید → جایزه خرید + پاداش اولین خرید در هسته ثبت می‌شود؛
#    خرید دوم فقط جایزه عادی دارد؛ wallet_charge جایزه نمی‌دهد.
#
#  استفاده:
#    bash test-foxcoin-rewards.sh
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

# استاب bot.js — هم‌ساختار bot.js واقعی: fulfillOrder + هندلر پیام
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

async function getWallet(env, userId) { return Number((KV['wallet:' + userId]) || 0); }
async function setWallet(env, userId, v) { KV['wallet:' + userId] = String(v); }

async function fulfillOrder(env, config, targetGroup, userId, purpose, amount, meta) {
  if (purpose === "wallet_charge") {
    const balance = await getWallet(env, userId);
    await setWallet(env, userId, balance + amount);
    await sendTelegram(config, userId, `✅ کیف پول شما ${amount.toLocaleString("en-US")} تومان شارژ شد.`);
    return;
  }
  if (purpose === "purchase") {
    if (meta.discountCode) await consumeDiscount(env, meta.discountCode);
    try {
      const link = await deliverService(env, config, userId, {
        desc: meta.desc, username: meta.usernameSelected, cat: meta.cat,
        inbounds: meta.planInbounds, days: meta.planDays, gb: meta.gb, panelId: meta.planPanelId
      });
      await sendTelegram(config, targetGroup, `✅ خرید تایید شد`);
    } catch (e) {
      await sendTelegram(config, targetGroup, `⚠️ تحویل خودکار ناموفق بود`);
    }
  }
}

async function consumeDiscount(env, code) { KV['discount:' + code] = '1'; }
async function deliverService(env, config, userId, opts) { return 'https://sub/x'; }

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
  if (!state) return sendTelegram(config, chatId, "دستور نامشخص", null);
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
module.exports = { onCallback, handleMessage, getState, fulfillOrder };
EOF

# اعمال پچ‌ها به ترتیب
FOXCOIN_BOT="$DIR/bot.js" FOXCOIN_BACKUP_DIR="$DIR/bk" \
  python3 patch-foxcoin-admin.py --apply > /dev/null
FOXCOIN_BOT="$DIR/bot.js" FOXCOIN_BACKUP_DIR="$DIR/bk" \
  python3 patch-foxcoin-rewards.py --apply > "$DIR/patch.log"
node --check "$DIR/bot.js"

cat > "$DIR/run.js" <<'EOF'
const bot = require('./bot.js');
const coin = require('./foxcoin.js');
const assert = require('assert');
const env = {};
const cfg = { admins: ['111'] };

(async () => {
  // ۱) خرید اول: جایزه خرید (۱۰) + پاداش اولین خرید (۲۰)
  await bot.fulfillOrder(env, cfg, 'g', '555', 'purchase', 200000, { desc: 'سی گیگ', usernameSelected: 'u1', cat: 'volume', planInbounds: [1], planDays: 30, planGb: 30 });
  assert(coin.getBalance('555') === 30, 'خرید اول باید ۳۰ کوین می‌داد، شد: ' + coin.getBalance('555'));
  let h = coin.history('555', 5);
  assert(h.length === 2, 'دو رویداد (خرید + اولین خرید) ثبت شد');
  assert(h.some(r => r.type === 'first_purchase'), 'رویداد اولین خرید ثبت شد');
  assert(h.some(r => r.type === 'purchase'), 'رویداد خرید عادی ثبت شد');

  // ۲) خرید دوم: فقط جایزه عادی
  await bot.fulfillOrder(env, cfg, 'g', '555', 'purchase', 100000, { desc: 'ده گیگ', usernameSelected: 'u2', cat: 'volume', planInbounds: [1], planDays: 30, planGb: 10 });
  assert(coin.getBalance('555') === 40, 'خرید دوم باید ۱۰ کوین می‌داد، شد: ' + coin.getBalance('555'));
  h = coin.history('555', 5);
  assert(h.filter(r => r.type === 'first_purchase').length === 1, 'اولین خرید فقط یک بار');

  // ۳) شارژ کیف پول جایزه ندارد
  await bot.fulfillOrder(env, cfg, 'g', '555', 'wallet_charge', 500000, {});
  assert(coin.getBalance('555') === 40, 'شارژ کیف پول نباید کوین می‌داد');

  // ۴) حالت درصدی خرید: ۲٪ با سقف ۱۰۰
  coin.setRewardConfig('purchase', { mode: 'percent', percent: 2, cap: 100 });
  await bot.fulfillOrder(env, cfg, 'g', '666', 'purchase', 1000000, { desc: 'حجم بالا' });
  assert(coin.getBalance('666') === 120, 'درصدی با سقف: ۲٪ = سقف ۱۰۰ + اولین خرید ۲۰');

  // ۵) حالت نسبی: هر ۱۰٬۰۰۰ تومان یک کوین
  coin.setRewardConfig('purchase', { mode: 'per', perAmount: 10000 });
  await bot.fulfillOrder(env, cfg, 'g', '777', 'purchase', 35000, { desc: 'کوچک' });
  assert(coin.getBalance('777') === 23, 'نسبی: ۳۵٬۰۰۰ / ۱۰٬۰۰۰ = ۳ + اولین خرید ۲۰');

  // ۶) حداقل مبلغ خرید
  coin.setRewardConfig('purchase', { mode: 'fixed', coins: 10, minPurchase: 50000 });
  await bot.fulfillOrder(env, cfg, 'g', '888', 'purchase', 30000, { desc: 'زیر حداقل' });
  assert(coin.getBalance('888') === 20, 'زیر حداقل: فقط پاداش اولین خرید (۲۰)');
  const h888 = coin.history('888', 5);
  assert(h888.filter(r => r.type === 'purchase').length === 0, 'زیر حداقل، خرید عادی جایزه نداد');

  // ۷) پنل مدیریت هنوز سالم است
  const admin = require('./foxcoin-admin.js');
  let sent = null;
  await admin.route({ data: 'admin:rewards', uid: '111', config: { admins: ['111'] },
                      chatId: 1, messageId: 2,
                      editTelegram: async (c, ch, mi, t, m) => { sent = { text: t, markup: m }; } });
  assert(JSON.stringify(sent.markup).includes('خرید زیرمجموعه‌ها'), 'پنل جوایز باز شد');

  console.log('✅ تست جوایز: خرید → جایزه خرید + اولین خرید + درصدی + نسبی + حداقل مبلغ، همه سالم‌اند');
})().catch(e => { console.log('❌ ' + e.message); process.exit(1); });
EOF

node "$DIR/run.js"

# برگشت و اعمال دوباره هم باید سالم باشد
FOXCOIN_BOT="$DIR/bot.js" FOXCOIN_BACKUP_DIR="$DIR/bk" \
  python3 patch-foxcoin-rewards.py --revert > /dev/null
node --check "$DIR/bot.js"
FOXCOIN_BOT="$DIR/bot.js" FOXCOIN_BACKUP_DIR="$DIR/bk" \
  python3 patch-foxcoin-rewards.py --apply > /dev/null
rm -rf "$DIR/data"
node "$DIR/run.js"

echo "✅ تست یکپارچه جوایز کامل شد (اعمال + revert + اعمال دوباره)"
