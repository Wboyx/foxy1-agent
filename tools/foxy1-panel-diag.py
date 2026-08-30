#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
foxy1-panel-diag.py -- لایه‌به‌لایه مسیر ربات -> پنل را می‌سنجد. فقط می‌خواند.

چرا لازم شد (2026-08-30):
    پل پاسارگاد روی ورسل با 402 DEPLOYMENT_DISABLED خاموش شد و ربات دیگر
    به پنل نمی‌رسد. ولی «نرسیدن» پنج علت متفاوت دارد و هر کدام درمان جدا:
        DNS / TCP / TLS / HTTP / احراز هویت
    این ابزار دقیقاً می‌گوید کدام لایه شکسته است.

قاعده‌ی مهم: اتصال TCP را با recv اعتبارسنجی می‌کند، نه با connect.
    درس ثبت‌شده: connect در 0-2ms «موفق» می‌شود ولی recv همیشه Timeout
    می‌دهد. بدون recv، نتیجه‌ی جعلی می‌گیری.

هیچ فایلی تغییر نمی‌کند. هیچ سرویسی ری‌استارت نمی‌شود. هیچ پورتی باز نمی‌شود.
Secretها Redact می‌شوند. فقط پایتون ۳ استاندارد، بدون pip install.

کاربرد:
    python3 foxy1-panel-diag.py                    گزارش کامل
    python3 foxy1-panel-diag.py --store /path      مسیر دیگر store.json
    python3 foxy1-panel-diag.py --no-login         بدون تلاش ورود (فقط لایه‌ها)
    python3 foxy1-panel-diag.py --timeout 6        مهلت کوتاه‌تر

خروجی را کامل کپی کن و بفرست.
"""

import argparse
import json
import os
import re
import socket
import ssl
import sys
import time
import urllib.error
import urllib.parse
import urllib.request

DEFAULT_STORE = "/root/foxteam-bot/data/store.json"
MAXDEPTH = 6

# کلادفلر بدون هدرهای مرورگر، درخواست پایتون را با 403 رد می‌کند
UA = ("Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 "
      "(KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36")
HDRS = {
    "Content-Type": "application/x-www-form-urlencoded",
    "Accept": "application/json, text/plain, */*",
    "Accept-Language": "en-US,en;q=0.9",
    "User-Agent": UA,
}

BRIDGES = [
    ("fox-bridge-pasar", "https://fox-bridge-pasar.vercel.app/health"),
    ("fox-bridge", "https://fox-bridge.vercel.app/health"),
    ("partner-worker", "https://fox-team-partner-worker.mahdi-wz10.workers.dev/"),
]

VERDICT = {
    "ok": "سالم",
    "dns": "دامنه resolve نمی‌شود (DNS)",
    "tcp": "پورت بسته یا مسیر مسدود (TCP)",
    "tls": "دست‌کش TLS ناتمام = معمولاً فیلتر SNI",
    "http_bridge": "پل بالادست خاموش است (ورسل: صورتحساب/سقف مصرف)",
    "auth": "یوزرنیم/پسورد رد شد",
    "api": "مسیر API در این نسخه پنل فرق دارد",
    "unknown": "پاسخ نامشخص - خروجی خام را بفرست",
}


def out(s=""):
    print(s, flush=True)


def hr(t):
    out()
    out("=" * 72)
    out(t)
    out("=" * 72)


def mask(v):
    """رمز و توکن را ناقص نشان می‌دهد تا در paste لو نرود."""
    if v is None:
        return None
    s = str(v)
    if len(s) <= 6:
        return "***"
    return "%s***%s" % (s[:2], s[-2:])


def redact_line(s):
    """خط خام را هم برای paste امن می‌کند."""
    s = re.sub(r"[0-9]{8,12}:[A-Za-z0-9_-]{30,}", "BOT_TOKEN_REDACTED", s)
    s = re.sub(r"(?i)(secret|token|password|passwd|key)([=:\"]+)[^,\s\"}]+",
               r"\1\2REDACTED", s)
    return s


# ---------------------------------------------------------------- ذخیره‌سازی

def deep(o, d=0):
    """store.json انبار کلید-مقدار است و مقدارهایش JSON رشته‌ای تودرتو."""
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


def find_panels(o, path="", acc=None):
    """هر dict که url دارد، با مسیرش."""
    if acc is None:
        acc = []
    if isinstance(o, dict):
        if isinstance(o.get("url"), str) and o["url"].startswith("http"):
            acc.append((path or "root", o))
            return acc
        for k, v in o.items():
            find_panels(v, "%s.%s" % (path, k) if path else str(k), acc)
    elif isinstance(o, list):
        for i, v in enumerate(o):
            find_panels(v, "%s[%d]" % (path, i), acc)
    return acc


# ------------------------------------------------------------------- شبکه

def _ctx():
    c = ssl.create_default_context()
    c.check_hostname = False          # پنل‌های x-ui روی IP با گواهی خودامضا
    c.verify_mode = ssl.CERT_NONE
    return c


def dns_lookup(host, timeout):
    old = socket.getdefaulttimeout()
    socket.setdefaulttimeout(timeout)
    try:
        infos = socket.getaddrinfo(host, None, socket.AF_UNSPEC, socket.SOCK_STREAM)
        v4 = sorted({i[4][0] for i in infos if i[0] == socket.AF_INET})
        v6 = sorted({i[4][0] for i in infos if i[0] == socket.AF_INET6})
        return v4, v6, None
    except Exception as e:
        return [], [], "%s: %s" % (type(e).__name__, e)
    finally:
        socket.setdefaulttimeout(old)


def tcp_check(host, port, timeout, tls=False):
    """با recv اعتبارسنجی می‌شود؛ connect تنها کافی نیست."""
    t0 = time.time()
    try:
        s = socket.create_connection((host, port), timeout=timeout)
    except Exception as e:
        return False, int((time.time() - t0) * 1000), "%s: %s" % (type(e).__name__, e)
    ms = int((time.time() - t0) * 1000)
    if not tls:
        try:
            s.close()
        except Exception:
            pass
        return True, ms, "باز (HTTP ساده)"
    try:
        s.settimeout(timeout)
        s.sendall(b"\x16\x03\x01\x00\x01\x00")     # ClientHello ناقص، فقط برای دیدن پاسخ
        s.recv(16)
        return True, ms, "باز، به TLS پاسخ داد"
    except Exception as e:
        # حتی اگر recv جواب نداد، دست کم TCP باز بود
        return True, ms, "TCP باز ولی TLS بی‌پاسخ (نشانه‌ی فیلتر SNI)"
    finally:
        try:
            s.close()
        except Exception:
            pass


def http_req(url, data=None, timeout=15):
    """(code, ms, body) — هرگز استثنا بیرون نمی‌دهد."""
    body = urllib.parse.urlencode(data).encode() if data else None
    req = urllib.request.Request(url, data=body, method="POST" if data else "GET",
                                 headers=dict(HDRS))
    t0 = time.time()
    try:
        with urllib.request.urlopen(req, timeout=timeout, context=_ctx()) as r:
            return r.status, int((time.time() - t0) * 1000), r.read(400).decode("utf-8", "replace")
    except urllib.error.HTTPError as e:
        return e.code, int((time.time() - t0) * 1000), e.read(400).decode("utf-8", "replace")
    except Exception as e:
        return 0, int((time.time() - t0) * 1000), "%s: %s" % (type(e).__name__, e)


# ------------------------------------------------------------- لایه‌به‌لایه

def probe(base, kind, user, pw, apitoken, timeout, do_login):
    """یک پنل را از DNS تا احراز هویت می‌سنجد. dict نتیجه برمی‌گرداند."""
    p = urllib.parse.urlsplit(base.rstrip("/"))
    host = p.hostname or ""
    port = p.port or (443 if p.scheme == "https" else 80)
    r = {"url": base, "host": host, "port": port, "layer": "ok", "note": ""}

    # --- لایه ۱: DNS
    if re.match(r"^\d+\.\d+\.\d+\.\d+$", host):
        r["dns"] = [host]
        r["dns_note"] = "IP مستقیم، بدون DNS"
    else:
        v4, v6, err = dns_lookup(host, timeout)
        r["dns"] = v4 + v6
        if not (v4 or v6):
            r["layer"] = "dns"
            r["note"] = err or "هیچ رکورد A/AAAA"
            return r
        r["dns_note"] = "%d IPv4, %d IPv6" % (len(v4), len(v6))

    # --- لایه ۲ و ۳: TCP + TLS
    ok, ms, err = tcp_check(host, port, timeout, p.scheme == "https")
    r["tcp_ms"] = ms
    if not ok:
        r["layer"] = "tcp"
        r["note"] = err
        return r
    r["tcp_note"] = err or "باز"

    code, ms2, body = http_req(base + (p.path or "/"), None, timeout)
    r["http_ms"] = ms2
    r["probe_code"] = code
    if code == 0:
        # TCP باز بود ولی پاسخ HTTP نیامد = دست‌کش TLS یا فیلتر میانی
        r["layer"] = "tls"
        r["note"] = body
        return r

    # --- لایه ۴: پل بالادست خاموش؟
    if code == 402 or "DEPLOYMENT_DISABLED" in body:
        r["layer"] = "http_bridge"
        r["note"] = (body or "").strip().replace("\n", " ")[:80]
        return r

    if not do_login:
        r["note"] = "پاسخ HTTP %s رسید؛ تست ورود انجام نشد (--no-login)" % code
        return r

    # --- لایه ۵: احراز هویت
    if kind == "pasarguard":
        if not (user and pw):
            r["layer"] = "unknown"
            r["note"] = "یوزر/رمز ادمین در store.json نیست؛ تست ورود ممکن نیست"
            return r
        last = None
        for path in ("/api/admin/token", "/api/admins/token"):
            c, ms3, b = http_req(base + path,
                                 {"username": user, "password": pw, "grant_type": "password"},
                                 timeout)
            if c == 200 and "access_token" in b:
                r["endpoint"] = path
                r["login_ms"] = ms3
                r["note"] = "ورود موفق ✅"
                return r
            if c in (401, 403):
                r["layer"] = "auth"
                r["endpoint"] = path
                r["note"] = "HTTP %s" % c
                return r
            last = (path, c, b, ms3)
        r["layer"] = "api"
        r["endpoint"] = last[0]
        r["note"] = "آخرین پاسخ HTTP %s: %s" % (last[1], (last[2] or "")[:70].replace("\n", " "))
        return r

    if kind == "3xui":
        if not apitoken:
            r["layer"] = "unknown"
            r["note"] = "apiToken نیست؛ با توکن API تست نشد"
            return r
        # مسیر وب‌هوک x-ui با پیشوند وب‌بیس پنل
        root = (p.path or "").rstrip("/")
        for path in (root + "/server/status", root + "/xui/server/status"):
            req = urllib.request.Request(base + path, method="GET",
                                         headers={"X-XUI-FIDOOD": apitoken, "User-Agent": UA})
            t0 = time.time()
            try:
                with urllib.request.urlopen(req, timeout=timeout, context=_ctx()) as resp:
                    b = resp.read(200).decode("utf-8", "replace")
                    c = resp.status
            except urllib.error.HTTPError as e:
                c, b = e.code, e.read(200).decode("utf-8", "replace")
            except Exception as e:
                c, b = 0, "%s: %s" % (type(e).__name__, e)
            if c == 200:
                r["endpoint"] = path
                r["login_ms"] = int((time.time() - t0) * 1000)
                r["note"] = "توکن API پذیرفته شد ✅"
                return r
            last = (path, c, b)
        r["layer"] = "auth" if last[1] in (401, 403) else "api"
        r["endpoint"] = last[0]
        r["note"] = "HTTP %s: %s" % (last[1], (last[2] or "")[:70].replace("\n", " "))
        return r

    r["note"] = "نوع پنل «%s» شناخته نشد؛ فقط لایه‌ها سنجیده شد" % kind
    return r


# -------------------------------------------------------------------- اجرا

def main():
    ap = argparse.ArgumentParser(add_help=True)
    ap.add_argument("--store", default=os.environ.get("FOXBOT_STORE", DEFAULT_STORE))
    ap.add_argument("--no-login", action="store_true", help="بدون تلاش ورود")
    ap.add_argument("--timeout", type=float, default=12.0)
    a = ap.parse_args()

    hr("0. IDENTIFY")
    out("  تاریخ UTC : %s" % time.strftime("%Y-%m-%d %H:%M:%S", time.gmtime()))
    try:
        out("  هاست‌نیم  : %s" % socket.gethostname())
    except Exception:
        pass
    out("  store.json: %s" % a.store)

    if not os.path.exists(a.store):
        out()
        out("  ❌ فایل store پیدا نشد. مسیر درست را بده:")
        out("     python3 foxy1-panel-diag.py --store /root/foxteam-bot/data/store.json")
        return 1
    try:
        with open(a.store, "r", encoding="utf-8") as f:
            raw = f.read()
        data = deep(json.loads(raw))
    except Exception as e:
        out("  ❌ store.json خوانده/پارس نشد: %s" % e)
        return 1
    out("  اندازه    : %d بایت، JSON معتبر ✅" % len(raw))

    panels = find_panels(data)
    hr("1. PANELS IN STORE  (%d)" % len(panels))
    if not panels:
        out("  هیچ پنلی ثبت نشده. ربات بدون پنل نمی‌تواند اکانت بسازد.")
    for path, p in panels:
        out("  %-22s name=%-16s type=%s" % (path[:22], str(p.get("name"))[:16], p.get("type")))
        out("      url    = %s" % p.get("url"))
        out("      user   = %s   pass = %s   apiToken = %s" % (
            p.get("username"), mask(p.get("password")), mask(p.get("apiToken"))))
        out("      insecureTls = %s   subBaseUrl = %s" % (
            p.get("insecureTls"), (p.get("subBaseUrl") or "-")[:60]))

    hr("2. LAYER BY LAYER  (timeout=%.0fs)" % a.timeout)
    results = []
    for path, p in panels:
        base = (p.get("url") or "").rstrip("/")
        out()
        out("  ── %s  [%s]" % (base, p.get("type")))
        r = probe(base, (p.get("type") or "").lower(), p.get("username"),
                  p.get("password"), p.get("apiToken"), a.timeout, not a.no_login)
        results.append((path, p, r))
        out("     DNS      : %s  %s" % (", ".join(r.get("dns") or []) or "-", r.get("dns_note", "")))
        out("     TCP :%-5s : %s  %s" % (r.get("port"), ("%sms" % r.get("tcp_ms")) if "tcp_ms" in r else "-", r.get("tcp_note", "")))
        if "http_ms" in r:
            out("     HTTP GET : code=%s  %sms" % (r.get("probe_code"), r.get("http_ms")))
        if r.get("endpoint"):
            out("     endpoint : %s  %sms" % (r["endpoint"], r.get("login_ms", "-")))
        out("     ▸ قضاوت  : %s" % VERDICT.get(r["layer"], r["layer"]))
        if r.get("note"):
            out("     ▸ جزئیات : %s" % redact_line(r["note"]))

    hr("3. BRIDGES AND WORKERS  (از دید همین سرور)")
    for name, url in BRIDGES:
        c, ms, body = http_req(url, None, a.timeout)
        flag = "✅" if c == 200 else "❌"
        out("  %s %-16s code=%-4s %4sms  %s" % (flag, name, c, ms, redact_line(body.strip()[:60])))

    hr("4. VERDICT")
    if not results:
        out("  هیچ پنلی برای سنجش نبود.")
    for path, p, r in results:
        out("  %-16s %-12s %s" % (str(p.get("name"))[:16], p.get("type"), VERDICT.get(r["layer"], r["layer"])))

    out()
    out("  راهنمای درمان بر اساس قضاوت:")
    out("    dns         -> رکورد DNS یا hosts را درست کن")
    out("    tcp         -> فایروال/پورت/مسیر؛ اگر پنل روی همین سرور است 127.0.0.1 را امتحان کن")
    out("    tls         -> فیلتر SNI؛ باید از پل عبور کرد، نه مستقیم")
    out("    http_bridge -> پل ورسل خاموش است؛ یا صورتحساب ورسل، یا نشانی پنل را مستقیم بگذار")
    out("    auth        -> یوزرنیم/پسورد ادمین پنل را در ربات دوباره وارد کن")
    out("    api         -> نسخه پنل مسیر دیگری دارد؛ همین خروجی را بفرست تا مسیر دقیق تنظیم شود")
    out()
    out("  اگر پل مرده بود و پنل مستقیم در دسترس بود، ابزار تعمیر آماده است:")
    out("    python3 pgfix.py --test")
    out("    python3 pgfix.py --try   <نشانی-واقعی-پنل>")
    out("    python3 pgfix.py --apply <نشانی-واقعی-پنل>     # بکاپ خودکار می‌گیرد")
    out()
    out("Done. READ-ONLY. هیچ فایلی تغییر نکرد.")
    return 0


if __name__ == "__main__":
    sys.exit(main())
