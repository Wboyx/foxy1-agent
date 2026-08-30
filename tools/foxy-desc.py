#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
foxy-desc.py (v2) — توضیحات طراحی‌شده، دسته‌بندی‌شده و قابل‌فهم برای هر محصول.

طراحی: هوک جذاب + دسته‌های ایموجی‌دار (لوکیشن/آی‌پی/پروتکل/اعتبار/حجم/دستگاه/
مناسب‌برای) + بخش «به زبان ساده» برای کاربران کم‌تجربه. بولد با <b> واقعی
(ربات با parse_mode=HTML ارسال می‌کند).

داده‌محور: لوکیشن از پرچم اینباندها، پروتکل‌ها، مدت و حداقل حجم از خود محصول
خوانده می‌شود؛ محصولاتی که بعداً اضافه شوند هم قالب زیبا می‌گیرند.

کاربرد:
    python3 foxy-desc.py --test         پیش‌نمایش (چیزی نمی‌نویسد)
    python3 foxy-desc.py --apply        بکاپ + نوشتن + تأیید   (فقط با باتِ متوقف!)
    python3 foxy-desc.py --store PATH   مسیر دیگر
"""
import argparse
import json
import os
import re
import shutil
import sys
import time

STORE = os.environ.get("FOXBOT_STORE", "/root/foxteam-bot/data/store.json")
MAXDEPTH = 6

_ISO = {
    "DE": "آلمان", "NL": "هلند", "GB": "انگلستان", "FI": "فنلاند", "US": "آمریکا",
    "FR": "فرانسه", "PL": "لهستان", "AU": "استرالیا", "SC": "سیشل", "TR": "ترکیه",
    "SE": "سوئد", "NO": "نروژ", "DK": "دانمارک", "ES": "اسپانیا", "IT": "ایتالیا",
    "CA": "کانادا", "JP": "ژاپن", "KR": "کره", "AE": "امارات", "RU": "روسیه",
    "CH": "سوئیس", "AT": "اتریش", "BE": "بلژیک", "LU": "لوکزامبورگ", "CZ": "چک",
    "HU": "مجارستان", "RO": "رومانی", "BG": "بلغارستان", "GR": "یونان", "PT": "پرتغال",
    "IE": "ایرلند", "IS": "ایسلند", "SG": "سنگاپور", "HK": "هنگ‌کنگ", "IN": "هند",
    "BR": "برزیل", "ZA": "آفریقای جنوبی", "NZ": "نیوزیلند", "UA": "اوکراین",
}

_PROTO_NAME = {
    "vless": "VLESS", "vmess": "VMess", "reality": "Reality",
    "shadowsocks": "Shadowsocks", "trojan": "Trojan", "http": "HTTP",
}
_PROTO_SHORT = {
    "shadowsocks": "سبک و سریع",
    "vless": "مدرن و پرسرعت",
    "reality": "ضدفیلتر بسیار قوی",
    "vmess": "سازگار با اکثر اپ‌ها",
    "trojan": "شبیه ترافیک عادی",
    "http": "ساده و سازگار",
}

_HOOK = {
    "xj6ht61r": "🌟 انتخاب محبوب فروشگاه — ساده، پایدار و بی‌دردسر!",
    "qlrxk5p0": "🚀 بیشترین سازگاری با اپ‌ها — حتی اپ‌های سخت‌گیر!",
    "44trir5v": "🦊 حجمی با آی‌پی ثابت — خیالت از اپ‌های حساس راحت!",
    "ejwmalek7": "👑 حجمی حرفه‌ای با چهار پروتکل قدرتمند!",
    "qnwbi8a4": "🎮 ساخته‌شده برای گیمرها — پینگ پایین از ترکیه!",
}
_SIMPLE = {
    "xj6ht61r": "فقط یک لینک را کپی می‌کنی و در اپ می‌گذاری؛ همین! اینترنت آزادت وصل می‌شود 🙂",
    "qlrxk5p0": "اگر اپ خاصی داری که با سرویس‌های معمولی وصل نمی‌شود، Ether بهترین انتخاب است.",
    "44trir5v": "حجم می‌خری و هر وقت خواستی مصرف می‌کنی؛ آی‌پی‌ات هم همیشه ثابت می‌ماند تا اپ‌های بانکی و حساس به تو شک نکنند 🙂",
    "ejwmalek7": "همان Invite ولی قوی‌تر؛ مناسب مصرف سنگین و چند دستگاه.",
    "qnwbi8a4": "اهل بازی آنلاین هستی؟ این سرویس برای پینگ پایین و بازی بدون لگ ساخته شده 🏆",
}
_HOOK_FALLBACK = {
    "gaming": "🎮 بهینه برای بازی و استریم — پینگ پایین و پایدار!",
    "pro": "👑 نسخه‌ی پرقدرت برای استفاده‌ی سنگین و چند دستگاه!",
    "invite": "🦊 حجمی با آی‌پی ثابت — مناسب اپ‌های حساس!",
    "any": "✨ اینترنت آزاد و پایدار برای همه‌ی خانواده!",
}
_SIMPLE_FALLBACK = {
    "gaming": "اهل بازی آنلاین هستی؟ این سرویس برای پینگ پایین و بازی بدون لگ ساخته شده 🏆",
    "pro": "مناسب کسی که زیاد مصرف می‌کند و چند دستگاه دارد؛ سازگاری کامل با اپ‌ها.",
    "invite": "حجم می‌خری و هر وقت خواستی مصرف می‌کنی؛ آی‌پی‌ات هم ثابت می‌ماند 🙂",
    "any": "فقط یک لینک را کپی می‌کنی و در اپ می‌گذاری؛ همین! وصل می‌شوی 🙂",
}


def fa(n):
    return str(n).translate(str.maketrans("0123456789", "۰۱۲۳۴۵۶۷۸۹"))


def deep(o, d=0):
    if d > MAXDEPTH:
        return o
    if isinstance(o, str):
        t = o.strip()
        if t[:1] in ("{", "[") and t[-1:] in ("}", "]"):
            try:
                return deep(json.loads(t), d + 1)
            except Exception:
                return o
        return o
    if isinstance(o, dict):
        return {k: deep(v, d + 1) for k, v in o.items()}
    if isinstance(o, list):
        return [deep(v, d + 1) for v in o]
    return o


def flags_to_countries(labels):
    out, seen = [], set()
    for lab in labels:
        for emoji in re.findall(r"[\U0001F1E6-\U0001F1FF]{2}", lab):
            a, b = emoji
            iso = chr(ord(a) - 0x1F1E6 + ord("A")) + chr(ord(b) - 0x1F1E6 + ord("A"))
            key = "%s %s" % (emoji, _ISO.get(iso, iso))
            if key not in seen:
                seen.add(key)
                out.append(key)
    return out


def protocols(inbounds):
    protos = []
    for ib in inbounds:
        p = (ib.get("protocol") or "").lower()
        if "reality" in (ib.get("label") or "").lower():
            p = "reality"
        if p and p not in protos:
            protos.append(p)
    return protos


def kind_of(pid, name):
    n = (name or "").lower()
    if pid in _HOOK:
        return pid
    if "gaming" in n:
        return "gaming"
    if "pro" in n:
        return "pro"
    if "invite" in n:
        return "invite"
    return "any"


def build_desc(plan, kind):
    inbounds = plan.get("inbounds") or []
    countries = flags_to_countries([ib.get("label") or "" for ib in inbounds])
    protos = protocols(inbounds)
    days = plan.get("days") or 0
    min_gb = plan.get("minGb") or 0
    name = plan.get("name") or ""
    pid = plan.get("id") or ""
    k = kind_of(pid, name)

    L = [_HOOK.get(pid) or _HOOK_FALLBACK[k], ""]

    if countries:
        shown = "، ".join(countries[:6])
        if len(countries) > 6:
            shown += " و %s لوکیشن دیگر" % fa(len(countries) - 6)
        L.append("🌍 <b>لوکیشن‌ها:</b> %s" % shown)
    else:
        L.append("🌍 <b>لوکیشن‌ها:</b> چند لوکیشن عالی — بعد از خرید هر کدام را خواستی انتخاب می‌کنی")

    if k in ("44trir5v", "invite"):
        L.append("📌 <b>آی‌پی ثابت:</b> جای تو همیشه با یک آی‌پی ثابت — عالی برای اپ‌های بانکی و حساس")

    if protos:
        pp = "، ".join("%s (%s)" % (_PROTO_NAME.get(p, p), _PROTO_SHORT.get(p, "پایدار")) for p in protos)
        L.append("🔐 <b>پروتکل‌ها:</b> %s" % pp)

    if days:
        L.append("⏳ <b>اعتبار:</b> %s روز کامل" % fa(days))

    if kind == "volume":
        L.append("⚖️ <b>حجم:</b> از %s گیگ به بالا — هر چقدر لازم داری" % fa(min_gb or 1))

    L.append("📱💻 <b>دستگاه‌ها:</b> هم گوشی هم کامپیوتر — بدون تنظیمات پیچیده")

    if k in ("qnwbi8a4", "gaming"):
        L.append("⚡ <b>مناسب برای:</b> پابجی، کال‌آف‌دیوتی، فری‌فایر، فورتنایت و همه‌ی بازی‌های آنلاین")
    else:
        L.append("⚡ <b>مناسب برای:</b> اینستاگرام، یوتیوب، واتساپ، تلگرام، وب‌گردی و فیلم")

    L.append("")
    L.append("💡 <b>به زبان ساده:</b> " + (_SIMPLE.get(pid) or _SIMPLE_FALLBACK[k]))
    return "\n".join(L)


def iter_plans(node, kind):
    if isinstance(node, dict) and "v" in node:
        node = node["v"]
    if isinstance(node, list):
        for p in node:
            if isinstance(p, dict) and "id" in p:
                yield p, kind


def main():
    ap = argparse.ArgumentParser(add_help=True)
    ap.add_argument("--store", default=STORE)
    ap.add_argument("--test", action="store_true")
    ap.add_argument("--apply", action="store_true")
    a = ap.parse_args()
    if not (a.test or a.apply):
        a.test = True

    if not os.path.exists(a.store):
        print("ERROR: store not found: %s" % a.store)
        return 1
    with open(a.store, "r", encoding="utf-8") as f:
        raw = f.read()
    outer = json.loads(raw)
    data = deep(outer)

    plans_keys = [k for k in data.keys() if k.startswith("plans:")]
    if not plans_keys:
        print("هیچ کلید plans:* پیدا نشد.")
        return 1

    desc_by_id = {}
    changes = []
    for pk in plans_keys:
        kind = pk.split(":", 1)[1]
        for plan, _ in iter_plans(data[pk], kind):
            new = build_desc(plan, kind)
            desc_by_id[plan["id"]] = new
            changes.append((pk, plan.get("id"), plan.get("name"), plan.get("desc"), new))

    print("== PREVIEW ==  %d محصول" % len(changes))
    for pk, pid, name, old, new in changes:
        print()
        print("  [%s] %s  (id=%s)" % (pk, name, pid))
        print("  جدید:")
        for line in new.splitlines():
            print("     | %s" % line)

    if a.test:
        print()
        print("RESULT: فقط پیش‌نمایش. برای نوشتن: --apply")
        return 0

    stamp = time.strftime("%Y%m%d-%H%M%S")
    bak = "%s.bak-desc-%s" % (STORE, stamp)
    shutil.copy2(STORE, bak)
    print()
    print("BACKUP: %s" % bak)

    counter = [0]

    def tr(o):
        if isinstance(o, str):
            t = o.strip()
            if t[:1] in ("{", "["):
                try:
                    p = json.loads(t)
                except Exception:
                    return o
                np = tr(p)
                if np is not p and json.dumps(np, ensure_ascii=False) != t:
                    return json.dumps(np, ensure_ascii=False)
                return o
            return o
        if isinstance(o, dict):
            if "id" in o and "desc" in o and "inbounds" in o and o["id"] in desc_by_id:
                nd = dict(o)
                if nd["desc"] != desc_by_id[o["id"]]:
                    nd["desc"] = desc_by_id[o["id"]]
                    counter[0] += 1
                return nd
            nd = {}
            for k, v in o.items():
                nd[k] = tr(v)
            return nd
        if isinstance(o, list):
            return [tr(v) for v in o]
        return o

    newouter = tr(outer)
    newtxt = json.dumps(newouter, ensure_ascii=False)
    json.loads(newtxt)
    tmp = STORE + ".tmp-desc"
    with open(tmp, "w", encoding="utf-8") as f:
        f.write(newtxt)
    os.replace(tmp, STORE)
    print("WROTE: %d desc updated." % counter[0])
    print("VERIFY: %s" % ("OK" if counter[0] == len(changes) else "MISMATCH"))
    print("rollback: cp %s %s" % (bak, STORE))
    return 0


if __name__ == "__main__":
    sys.exit(main())
