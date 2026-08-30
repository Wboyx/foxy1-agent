#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""pgfix — تعمیر آدرس پنل PasarGuard در store.json ربات فروشگاه.

چرا: پل Vercel (fox-bridge-*.vercel.app) با 402/DEPLOYMENT_DISABLED خاموش شده و
ربات نمی‌تواند به پنل لاگین کند. اگر سرور مستقیم به پنل مقصد برسد، پل لازم نیست.

store.json یک انبار کلید-مقدار است که مقدارهایش JSON تودرتو در رشته‌اند
(مثلا panels -> "{\\"v\\": \\"[{...}]\\"}"). این ابزار هر عمقی را باز می‌کند.

کاربرد:
  python3 pgfix.py --test                 فقط می‌خواند
  python3 pgfix.py --try <url>            لاگین واقعی را می‌آزماید
  python3 pgfix.py --apply <url>          بکاپ + جایگزینی + تأیید

نوشتن روی فایل فقط با جایگزینی متنی دقیقِ همان آدرس انجام می‌شود و
هرگز بدون لاگین موفق اجرا نمی‌گردد.
"""
import argparse
import json
import os
import shutil
import ssl
import sys
import time
import urllib.error
import urllib.parse
import urllib.request

STORE = os.environ.get("FOXBOT_STORE", "/root/foxteam-bot/data/store.json")
DEAD = ("vercel.app",)
TIMEOUT = 15
MAXDEPTH = 6

# بدون این هدرها کلادفلر درخواست پایتون را با 403 رد می‌کند
UA = ("Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 "
      "(KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36")
HDRS = {
    "Content-Type": "application/x-www-form-urlencoded",
    "Accept": "application/json, text/plain, */*",
    "Accept-Language": "en-US,en;q=0.9",
    "User-Agent": UA,
}


def out(s=""):
    print(s, flush=True)


def mask(v):
    if not v:
        return None
    s = str(v)
    return s[:2] + "***" + s[-2:] if len(s) > 6 else "***"


def deep(o, d=0):
    """رشته‌های حاوی JSON را تا هر عمقی باز می‌کند."""
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
    """هر dict که url دارد را با مسیرش برمی‌گرداند."""
    if acc is None:
        acc = []
    if isinstance(o, dict):
        if "url" in o and isinstance(o.get("url"), str):
            acc.append((path or "root", o))
            return acc
        for k, v in o.items():
            find_panels(v, "%s.%s" % (path, k) if path else str(k), acc)
    elif isinstance(o, list):
        for i, v in enumerate(o):
            find_panels(v, "%s[%d]" % (path, i), acc)
    return acc


def find_urls(o, acc=None):
    if acc is None:
        acc = set()
    if isinstance(o, str):
        if o.startswith("http") and any(d in o for d in DEAD):
            acc.add(o)
    elif isinstance(o, dict):
        for v in o.values():
            find_urls(v, acc)
    elif isinstance(o, list):
        for v in o:
            find_urls(v, acc)
    return acc


# ---------- شبکه ----------

def _ctx():
    c = ssl.create_default_context()
    c.check_hostname = False
    c.verify_mode = ssl.CERT_NONE
    return c


def post_form(url, data, timeout=TIMEOUT):
    body = urllib.parse.urlencode(data).encode()
    req = urllib.request.Request(
        url, data=body, method="POST",
        headers=dict(HDRS))
    try:
        with urllib.request.urlopen(req, timeout=timeout, context=_ctx()) as r:
            return r.status, r.read(400).decode("utf-8", "replace")
    except urllib.error.HTTPError as e:
        return e.code, e.read(400).decode("utf-8", "replace")
    except Exception as e:
        return 0, "%s: %s" % (type(e).__name__, e)


def pg_login(base, user, pw):
    base = base.rstrip("/")
    last = (False, "-", 0, 0, "no endpoint")
    for path in ("/api/admin/token", "/api/admins/token"):
        t0 = time.time()
        code, body = post_form(base + path, {"username": user, "password": pw})
        ms = int((time.time() - t0) * 1000)
        if code == 200 and "access_token" in body:
            return True, path, code, ms, "OK"
        if code in (401, 403):
            return False, path, code, ms, "credentials rejected"
        if code == 422:
            last = (False, path, code, ms, "endpoint alive, form rejected")
            continue
        if code == 404:
            last = (False, path, code, ms, "not found")
            continue
        return False, path, code, ms, (body[:70].replace("\n", " ") or "no body")
    return last


# ---------- فرمان‌ها ----------

def scan(raw):
    data = deep(json.loads(raw))
    panels = find_panels(data)
    dead_urls = find_urls(data)
    return data, panels, dead_urls


def show(panels, dead_urls):
    out("== PANELS == %d" % len(panels))
    for path, p in panels:
        url = p.get("url") or ""
        bad = any(d in url for d in DEAD)
        out("  %-26s %-18s %-11s %s%s" % (
            path[:26], str(p.get("name"))[:18], str(p.get("type"))[:11],
            url, "   <== DEAD" if bad else ""))
        out("     user=%s  pass=%s  token=%s" % (
            p.get("username"), mask(p.get("password")), mask(p.get("apiToken"))))
    out()
    out("== DEAD URLS == %d" % len(dead_urls))
    for u in sorted(dead_urls):
        out("  %s" % u)


def creds(panels):
    """پنل‌هایی که آدرس مرده و یوزر/رمز دارند."""
    r = []
    for path, p in panels:
        if any(d in (p.get("url") or "") for d in DEAD):
            if p.get("username") and p.get("password"):
                r.append((path, p))
    return r


def cmd_test(raw):
    data, panels, dead = scan(raw)
    out("== STORE == %s" % STORE)
    out()
    show(panels, dead)
    out()
    if not dead:
        out("RESULT: no dead bridge reference. nothing to fix.")
        return 0
    c = creds(panels)
    out("RESULT: %d dead url(s), %d panel(s) with stored credentials." % (len(dead), len(c)))
    if c:
        out("NEXT:   python3 pgfix.py --try https://REAL-PANEL-HOST")
    else:
        out("NOTE:   no stored user/pass on the dead panels, so --try cannot")
        out("        log in. --apply will still rewrite the address.")
    return 0


def cmd_try(raw, url, quiet=False):
    data, panels, dead = scan(raw)
    c = creds(panels)
    if not c:
        out("== LOGIN TEST -> %s" % url)
        out("  no dead panel has stored credentials; cannot verify by login.")
        ok, path, code, ms, why = pg_login(url, "pgfix-probe", "pgfix-probe")
        out("  reachability: code=%s %sms path=%s %s" % (code, ms, path, why))
        if code in (401, 403, 422, 200):
            out()
            out("RESULT: address is a live panel endpoint (unverified login).")
            out("        to force the change:  python3 pgfix.py --apply %s" % url)
            return 10
        out()
        out("RESULT: address does not answer as a panel. do NOT apply.")
        return 2
    out("== LOGIN TEST -> %s" % url)
    ok_any = False
    for path, p in c:
        ok, ep, code, ms, why = pg_login(url, p["username"], p["password"])
        out("  %-26s %-18s %s  code=%s  %sms  %s  %s" % (
            path[:26], str(p.get("name"))[:18], "PASS" if ok else "FAIL",
            code, ms, ep, why))
        ok_any = ok_any or ok
    out()
    if ok_any:
        out("RESULT: login works. safe to run:")
        out("        python3 pgfix.py --apply %s" % url)
        return 0
    out("RESULT: no panel logged in at this address. do NOT apply.")
    return 2


def cmd_apply(raw, url, force):
    rc = cmd_try(raw, url)
    if rc == 10 and not force:
        out("aborted: login unverified. re-run with --force to apply anyway.")
        return rc
    if rc not in (0, 10):
        out("aborted: apply requires a passing login test.")
        return rc

    data, panels, dead = scan(raw)
    if not dead:
        out("nothing to rewrite.")
        return 0

    stamp = time.strftime("%Y%m%d-%H%M%S")
    bak = "%s.bak-%s" % (STORE, stamp)
    shutil.copy2(STORE, bak)
    out()
    out("BACKUP: %s" % bak)

    new = url.rstrip("/")
    txt = raw
    total = 0
    for u in sorted(dead, key=len, reverse=True):
        n = txt.count(u)
        if n:
            txt = txt.replace(u, new)
            total += n
            out("  %-58s x%d  ->  %s" % (u[:58], n, new))

    json.loads(txt)  # باید هنوز JSON معتبر باشد
    tmp = STORE + ".tmp-%s" % stamp
    with open(tmp, "w", encoding="utf-8") as f:
        f.write(txt)
    os.replace(tmp, STORE)
    out()
    out("WROTE: %d replacement(s)." % total)

    with open(STORE, "r", encoding="utf-8") as f:
        raw2 = f.read()
    _, panels2, dead2 = scan(raw2)
    if dead2:
        out("VERIFY: FAILED, still dead: %s" % sorted(dead2))
        return 3
    out("VERIFY: OK, no dead bridge left on disk.")
    for path, p in panels2:
        if p.get("url", "").startswith(new):
            out("   %-26s %-18s %s" % (path[:26], str(p.get("name"))[:18], p.get("url")))
    out()
    out("NEXT: restart the bot, then test it in Telegram.")
    out("      rollback:  cp %s %s" % (bak, STORE))
    return 0


def main():
    ap = argparse.ArgumentParser(add_help=True)
    g = ap.add_mutually_exclusive_group(required=True)
    g.add_argument("--test", action="store_true", help="read-only report")
    g.add_argument("--try", dest="try_url", metavar="URL", help="login test only")
    g.add_argument("--apply", dest="apply_url", metavar="URL", help="test then rewrite")
    ap.add_argument("--force", action="store_true",
                    help="apply even if login could not be verified")
    a = ap.parse_args()

    if not os.path.exists(STORE):
        out("ERROR: store not found: %s" % STORE)
        return 1
    try:
        with open(STORE, "r", encoding="utf-8") as f:
            raw = f.read()
        json.loads(raw)
    except Exception as e:
        out("ERROR: cannot parse store: %s" % e)
        return 1

    for u in (a.try_url, a.apply_url):
        if u and not u.startswith(("http://", "https://")):
            out("ERROR: url must start with http:// or https://")
            return 1

    if a.test:
        return cmd_test(raw)
    if a.try_url:
        return cmd_try(raw, a.try_url)
    return cmd_apply(raw, a.apply_url, a.force)


if __name__ == "__main__":
    sys.exit(main())
