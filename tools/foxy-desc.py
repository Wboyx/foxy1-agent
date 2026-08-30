#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
foxy-desc.py — توضیحات کامل و قابل‌فهم برای هر محصول در بخش خرید. فقط store.json.

چرا: مشتریان نمی‌دانند هر سرویس چه لوکیشن‌هایی دارد یا چه ویژگی‌ای.
این ابزار از داده‌ی واقعی هر محصول (پرچم اینباندها = لوکیشن، پروتکل، مدت،
حداقل حجم) یک توضیح دوستانه می‌سازد و در فیلد desc می‌نویسد.

قالب رشته‌ای تودرتوی store دقیقاً حفظ می‌شود: فقط همان رشته‌ی JSON که descِ
یک محصول در آن است دوباره رشته می‌شود؛ بقیه‌ی فایل دست‌نخورده می‌ماند.
بکاپ خودکار + تأیید. فقط پایتون۳ استاندارد.

کاربرد:
    python3 foxy-desc.py --test         پیش‌نمایش (چیزی نمی‌نویسد)
    python3 foxy-desc.py --apply        بکاپ + نوشتن + تأیید
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

_PROTO = {
    "shadowsocks": "اتصال سبک و سریع با مصرف منابع کم — مناسب موبایل و استفاده‌ی روزمره.",
    "vless": "پروتکل مدرن و سبک با سرعت بالا و سربار کم.",
    "reality": "لایه‌ی امنیتی قوی شبیه ترافیک عادی HTTPS — پایداری بالا حتی در شرایط فیلترینگ.",
    "vmess": "سازگاری گسترده با اکثر اپ‌ها.",
    "trojan": "ترافیک کاملاً شبیه HTTPS معمولی — تشخیص‌پذیری بسیار کم.",
    "http": "مناسب عبور ساده و سازگار.",
}


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


def build_desc(plan, kind):
    inbounds = plan.get("inbounds") or []
    countries = flags_to_countries([ib.get("label") or "" for ib in inbounds])
    protos = protocols(inbounds)
    days = plan.get("days") or 0
    min_gb = plan.get("minGb") or 0
    L = ["🌍 لوکیشن‌ها: %s" % ("، ".join(countries) if countries else "چندلوکیشنه — پس از خرید قابل انتخاب")]
    if protos:
        L.append("🔐 پروتکل: %s" % "، ".join(protos))
    if days:
        L.append("⏳ مدت اعتبار: %d روز" % days)
    if kind == "volume":
        L.append("📊 نوع: حجمی — حداقل خرید %d گیگابایت" % (min_gb or 1))
    else:
        L.append("♾️ نوع: نامحدود / زمان‌دار")
    L.append("💡 %s" % _PROTO.get(protos[0] if protos else "", "اتصال پایدار با چند لوکیشن قابل انتخاب."))
    if len(countries) > 3:
        L.append("✨ با تنوع لوکیشن بالا، مناسب استریم، وب‌گردی و دورزدن محدودیت‌های منطقه‌ای.")
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
        print("  قبلی: %s" % (old or "-"))
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
        """بازگشتی؛ فقط رشته‌ی JSONِ حاوی descِ یک محصول را دوباره رشته می‌کند."""
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
