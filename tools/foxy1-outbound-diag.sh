#!/usr/bin/env bash
# foxy1 — عیب‌یابی اوت‌باند
# فقط می‌خواند. هیچ قانونی را عوض نمی‌کند، هیچ سرویسی را ری‌استارت نمی‌کند.

echo "══════ ۱) قانون‌های فایروال ══════"
if command -v ufw >/dev/null 2>&1; then
  echo "── ufw ──"
  ufw status verbose 2>&1 | head -40
else
  echo "ufw نصب نیست"
fi

echo
echo "── سیاست پیش‌فرض iptables ──"
iptables -S 2>/dev/null | grep -E '^-P' || echo "خوانده نشد"

echo
echo "── قانون‌های OUTPUT ──"
iptables -S OUTPUT 2>/dev/null | head -30 || echo "خوانده نشد"

echo
echo "── تعداد قانون در هر زنجیره ──"
for c in INPUT OUTPUT FORWARD; do
  printf '%-8s %s\n' "$c" "$(iptables -S "$c" 2>/dev/null | wc -l)"
done

if command -v nft >/dev/null 2>&1; then
  echo
  echo "── nftables ──"
  nft list ruleset 2>/dev/null | head -40 || echo "خالی یا بی‌دسترسی"
fi

echo
echo "══════ ۲) آیا اصلا بیرون می‌رود ══════"
echo "── DNS ──"
timeout 8 getent hosts serveo.net    >/dev/null 2>&1 && echo "serveo.net    ✅ حل شد" || echo "serveo.net    ❌ حل نشد"
timeout 8 getent hosts google.com    >/dev/null 2>&1 && echo "google.com    ✅ حل شد" || echo "google.com    ❌ حل نشد"
timeout 8 getent hosts vercel.app    >/dev/null 2>&1 && echo "vercel.app    ✅ حل شد" || echo "vercel.app    ❌ حل نشد"

echo
echo "── TCP خروجی ──"
probe() {  # میزبان پورت برچسب
  if timeout 8 bash -c "exec 3<>/dev/tcp/$1/$2" 2>/dev/null; then
    echo "$3 ($1:$2) ✅ باز"
  else
    echo "$3 ($1:$2) ❌ بسته یا فیلتر"
  fi
}
probe serveo.net 22 "تونل SSH   "
probe 1.1.1.1 53 "DNS تی‌سی‌پی"
probe 93.184.216.34 80 "HTTP خام  "
probe api.github.com 443 "گیت‌هاب   "

echo
echo "── HTTPS واقعی ──"
for u in https://foxy-relay.vercel.app/ https://fox-brain-six.vercel.app/ https://api.telegram.org/; do
  code=$(timeout 15 curl -sS -o /dev/null -w '%{http_code}' "$u" 2>/dev/null)
  [ -n "$code" ] && [ "$code" != "000" ] && echo "$u → $code ✅" || echo "$u → بی‌جواب ❌"
done

echo
echo "══════ ۳) سرویس‌های فاکسی ══════"
for s in foxy foxy-tunnel foxteam-bot foxy1-monitor; do
  st=$(systemctl is-active "$s" 2>/dev/null || echo "-")
  en=$(systemctl is-enabled "$s" 2>/dev/null || echo "-")
  printf '%-16s %-10s %s\n' "$s" "$st" "$en"
done

echo
echo "── پورت‌های شنونده ──"
ss -tlnp 2>/dev/null | head -15 || netstat -tlnp 2>/dev/null | head -15

echo
echo "══════ ۴) تونل ══════"
if [ -f /var/log/foxy-tunnel.log ]; then
  echo "آخرین آدرس: $(grep -oE 'https://[a-z0-9-]+\.serveousercontent\.com' /var/log/foxy-tunnel.log | tail -1)"
  echo "── ۱۵ خط آخر لاگ ──"
  tail -15 /var/log/foxy-tunnel.log
else
  echo "لاگ تونل نیست"
fi

echo
echo "══════ ۵) خود فاکسی از داخل ══════"
timeout 10 curl -sS -m 8 -o /dev/null -w 'health → %{http_code}\n' http://127.0.0.1:8080/health 2>&1 \
  || echo "فاکسی از داخل هم جواب نمی‌دهد"

echo
echo "══════ تمام ══════"
