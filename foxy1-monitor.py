#!/usr/bin/env python3
# =====================================================================
# Foxy1 Monitor — فاز صفر
# پایش خواندنی سرور و هشدار در تلگرام
#
# اصول:
#   - فقط می‌خواند، هرگز چیزی را تغییر نمی‌دهد
#   - هیچ پورت ورودی باز نمی‌کند
#   - هیچ ترافیک کاربری از آن عبور نمی‌کند
#   - Token و مقدار حساس را قبل از ارسال Redact می‌کند
#   - اگر تلگرام در دسترس نبود، خودش سالم می‌ماند
#
# اجرا: python3 foxy1-monitor.py
# =====================================================================

import json
import os
import re
import subprocess
import sys
import time
import urllib.error
import urllib.parse
import urllib.request
from datetime import datetime

BASE_DIR = os.path.dirname(os.path.abspath(__file__))
CONFIG_FILE = os.path.join(BASE_DIR, "foxy1-monitor.env")
STATE_FILE = os.path.join(BASE_DIR, "state.json")
LOG_FILE = os.path.join(BASE_DIR, "foxy1-monitor.log")

VERSION = "0.1.0"


# ---------------------------------------------------------------------
# پیکربندی
# ---------------------------------------------------------------------
def load_config():
    cfg = {}
    if os.path.exists(CONFIG_FILE):
        with open(CONFIG_FILE, "r", encoding="utf-8") as fh:
            for line in fh:
                line = line.strip()
                if not line or line.startswith("#") or "=" not in line:
                    continue
                k, v = line.split("=", 1)
                cfg[k.strip()] = v.strip().strip('"').strip("'")

    def g(key, default=None):
        return os.environ.get(key) or cfg.get(key) or default

    return {
        "bot_token": g("FOXY1_BOT_TOKEN", ""),
        "chat_id": g("FOXY1_CHAT_ID", ""),
        "tg_api_base": (g("TG_API_BASE", "https://api.telegram.org")).rstrip("/"),
        "interval": int(g("CHECK_INTERVAL", "120")),
        "services": [s.strip() for s in g("WATCH_SERVICES", "foxteam-bot,x-ui,nginx").split(",") if s.strip()],
        "disk_warn": int(g("DISK_WARN_PERCENT", "85")),
        "mem_warn": int(g("MEM_WARN_PERCENT", "90")),
        "proxy_health": g("PROXY_HEALTH_URL", ""),
        "log_grep_service": g("LOG_GREP_SERVICE", "foxteam-bot"),
        "log_error_pattern": g("LOG_ERROR_PATTERN", "fetch failed|ECONNREFUSED|OOM|Conflict"),
        "log_error_threshold": int(g("LOG_ERROR_THRESHOLD", "5")),
        "daily_report_hour": int(g("DAILY_REPORT_HOUR", "9")),
        "quiet_repeat_minutes": int(g("QUIET_REPEAT_MINUTES", "60")),
    }


# ---------------------------------------------------------------------
# ابزارهای پایه
# ---------------------------------------------------------------------
SECRET_PATTERNS = [
    re.compile(r"\b\d{8,12}:[A-Za-z0-9_\-]{30,}\b"),            # Bot Token
    re.compile(r"(?i)(token|password|passwd|secret|api[_-]?key)\s*[=:]\s*\S+"),
    re.compile(r"\b[A-Fa-f0-9]{32,}\b"),                          # Hash/Key بلند
    re.compile(r"(?i)\b[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\b"),  # UUID
]


def redact(text):
    """حذف مقدارهای حساس قبل از ارسال به تلگرام."""
    if not text:
        return text
    out = text
    for pat in SECRET_PATTERNS:
        out = pat.sub("[REDACTED]", out)
    return out


def run(cmd, timeout=15):
    """اجرای دستور خواندنی. خروجی متنی برمی‌گرداند."""
    try:
        res = subprocess.run(
            cmd, shell=True, capture_output=True, text=True, timeout=timeout
        )
        return (res.stdout or "") + (res.stderr or "")
    except Exception as exc:
        return f"ERROR: {exc}"


def log(msg):
    line = f"{datetime.now().strftime('%Y-%m-%d %H:%M:%S')} | {msg}"
    print(line, flush=True)
    try:
        with open(LOG_FILE, "a", encoding="utf-8") as fh:
            fh.write(line + "\n")
    except Exception:
        pass


def load_state():
    if os.path.exists(STATE_FILE):
        try:
            with open(STATE_FILE, "r", encoding="utf-8") as fh:
                return json.load(fh)
        except Exception:
            pass
    return {"alerts": {}, "last_daily": ""}


def save_state(state):
    try:
        tmp = STATE_FILE + ".tmp"
        with open(tmp, "w", encoding="utf-8") as fh:
            json.dump(state, fh)
        os.replace(tmp, STATE_FILE)
    except Exception as exc:
        log(f"خطا در ذخیره وضعیت: {exc}")


# ---------------------------------------------------------------------
# تلگرام
# ---------------------------------------------------------------------
def send_telegram(cfg, text):
    if not cfg["bot_token"] or not cfg["chat_id"]:
        log("توکن یا شناسه چت تنظیم نشده — پیام ارسال نشد.")
        return False

    url = f"{cfg['tg_api_base']}/bot{cfg['bot_token']}/sendMessage"
    payload = json.dumps({
        "chat_id": cfg["chat_id"],
        "text": redact(text)[:4000],
        "parse_mode": "HTML",
        "disable_web_page_preview": True,
    }).encode("utf-8")

    req = urllib.request.Request(
        url, data=payload, headers={"Content-Type": "application/json"}
    )
    try:
        with urllib.request.urlopen(req, timeout=25) as resp:
            body = json.loads(resp.read().decode("utf-8"))
            return bool(body.get("ok"))
    except Exception as exc:
        log(f"ارسال تلگرام ناموفق: {exc}")
        return False


def alert(cfg, state, key, title, body, severity="warn"):
    """هشدار با ضد تکرار — همان هشدار زودتر از بازه تعیین‌شده دوباره فرستاده نمی‌شود."""
    now = time.time()
    last = state["alerts"].get(key, 0)
    gap = cfg["quiet_repeat_minutes"] * 60

    if now - last < gap:
        return False

    icon = {"crit": "🔴", "warn": "🟠", "ok": "🟢"}.get(severity, "🔵")
    msg = f"{icon} <b>{title}</b>\n\n{body}\n\n<code>{socket_host()}</code>"
    if send_telegram(cfg, msg):
        state["alerts"][key] = now
        log(f"هشدار ارسال شد: {key}")
        return True
    return False


def clear_alert(cfg, state, key, title, body):
    """وقتی مشکل رفع شد، یک بار پیام بازگشت به حالت عادی بفرست."""
    if key in state["alerts"]:
        send_telegram(cfg, f"🟢 <b>{title}</b>\n\n{body}")
        del state["alerts"][key]
        log(f"وضعیت عادی شد: {key}")


def socket_host():
    try:
        import socket as _s
        return _s.gethostname()
    except Exception:
        return "server"


# ---------------------------------------------------------------------
# بررسی‌ها — همه فقط خواندنی
# ---------------------------------------------------------------------
def check_services(cfg, state):
    for svc in cfg["services"]:
        active = run(f"systemctl is-active {svc} 2>/dev/null").strip()
        key = f"service:{svc}"

        if active == "active":
            clear_alert(cfg, state, key, "سرویس برگشت", f"سرویس زیر دوباره فعال شد:\n\n<code>{svc}</code>")
            continue

        if active in ("inactive", "failed", "activating", "deactivating"):
            detail = run(f"systemctl status {svc} --no-pager -l 2>/dev/null | head -n 12")
            alert(
                cfg, state, key,
                "سرویس فعال نیست",
                f"سرویس:\n<code>{svc}</code>\n\nوضعیت:\n<code>{active}</code>\n\n"
                f"<pre>{detail[:900]}</pre>",
                severity="crit",
            )


def check_memory(cfg, state):
    out = run("free -m | awk '/^Mem:/{print $2, $3} /^Swap:/{print $2, $3}'")
    lines = [l.split() for l in out.strip().split("\n") if l.strip()]
    if not lines or len(lines[0]) < 2:
        return

    total, used = int(lines[0][0]), int(lines[0][1])
    pct = round(used * 100 / total) if total else 0

    swap_total = int(lines[1][0]) if len(lines) > 1 and len(lines[1]) >= 2 else 0

    key = "memory"
    if pct >= cfg["mem_warn"]:
        extra = "\n\n⚠️ Swap صفر است — خطر OOM بالاست." if swap_total == 0 else ""
        top = run("ps -eo comm,rss --sort=-rss | head -n 6")
        alert(
            cfg, state, key,
            "مصرف حافظه بالا",
            f"مصرف:\n<code>{pct}% ({used} از {total} MB)</code>{extra}\n\n"
            f"پرمصرف‌ترین‌ها:\n<pre>{top[:600]}</pre>",
            severity="crit" if pct >= 95 else "warn",
        )
    else:
        clear_alert(cfg, state, key, "حافظه عادی شد", f"مصرف فعلی:\n<code>{pct}%</code>")


def check_oom(cfg, state):
    """بررسی کشته‌شدن پروسه توسط کمبود حافظه در ۱۰ دقیقه اخیر."""
    out = run("journalctl --since '10 min ago' --no-pager 2>/dev/null | grep -i 'killed process\\|out of memory' | tail -n 3")
    if out.strip() and "ERROR:" not in out:
        alert(
            cfg, state, "oom",
            "پروسه‌ای به‌علت کمبود حافظه بسته شد",
            f"<pre>{out[:800]}</pre>",
            severity="crit",
        )


def check_disk(cfg, state):
    out = run("df -h / | tail -n 1 | awk '{print $5, $4}'")
    parts = out.strip().split()
    if len(parts) < 2:
        return
    try:
        pct = int(parts[0].replace("%", ""))
    except ValueError:
        return

    key = "disk"
    if pct >= cfg["disk_warn"]:
        alert(
            cfg, state, key,
            "فضای دیسک کم است",
            f"مصرف:\n<code>{pct}%</code>\n\nفضای آزاد:\n<code>{parts[1]}</code>",
            severity="crit" if pct >= 93 else "warn",
        )
    else:
        clear_alert(cfg, state, key, "فضای دیسک عادی شد", f"مصرف فعلی:\n<code>{pct}%</code>")


def check_logs(cfg, state):
    """شمارش خطاهای مهم در لاگ سرویس در ۱۰ دقیقه اخیر."""
    svc = cfg["log_grep_service"]
    pattern = cfg["log_error_pattern"]
    out = run(
        f"journalctl -u {svc} --since '10 min ago' --no-pager 2>/dev/null "
        f"| grep -Ec '{pattern}'"
    )
    try:
        count = int(out.strip().split("\n")[0])
    except (ValueError, IndexError):
        return

    key = f"logerr:{svc}"
    if count >= cfg["log_error_threshold"]:
        sample = run(
            f"journalctl -u {svc} --since '10 min ago' --no-pager 2>/dev/null "
            f"| grep -E '{pattern}' | tail -n 3"
        )
        alert(
            cfg, state, key,
            "خطای تکرارشونده در لاگ",
            f"سرویس:\n<code>{svc}</code>\n\nتعداد در ۱۰ دقیقه اخیر:\n<code>{count}</code>\n\n"
            f"نمونه:\n<pre>{sample[:700]}</pre>",
            severity="crit",
        )
    else:
        clear_alert(cfg, state, key, "خطاهای لاگ متوقف شد", f"سرویس:\n<code>{svc}</code>")


def check_proxy(cfg, state):
    """بررسی سلامت پروکسی تلگرام — همان چیزی که امشب از کار افتاد."""
    url = cfg["proxy_health"]
    if not url:
        return

    key = "proxy"
    try:
        req = urllib.request.Request(url, headers={"Accept": "application/json"})
        with urllib.request.urlopen(req, timeout=15) as resp:
            code = resp.status
        if code == 200:
            clear_alert(cfg, state, key, "پروکسی تلگرام برگشت", "مسیر رله دوباره سالم است.")
            return
        raise RuntimeError(f"HTTP {code}")
    except Exception as exc:
        alert(
            cfg, state, key,
            "پروکسی تلگرام در دسترس نیست",
            f"خطا:\n<code>{str(exc)[:200]}</code>\n\n"
            "احتمال فیلترشدن دامنه رله. جدول دامنه‌های جایگزین را بررسی کن.",
            severity="crit",
        )


def check_cert(cfg, state):
    """بررسی تاریخ انقضای گواهی TLS اگر مسیر استاندارد وجود داشت."""
    for path in ("/root/cert/ip/fullchain.pem",):
        if not os.path.exists(path):
            continue
        out = run(f"openssl x509 -enddate -noout -in {path} 2>/dev/null")
        if "notAfter=" not in out:
            continue
        try:
            date_str = out.split("notAfter=")[1].strip()
            days = int(run(
                f"echo $(( ( $(date -d '{date_str}' +%s) - $(date +%s) ) / 86400 ))"
            ).strip())
        except Exception:
            continue

        key = f"cert:{path}"
        if days <= 14:
            alert(
                cfg, state, key,
                "گواهی TLS نزدیک انقضاست",
                f"مسیر:\n<code>{path}</code>\n\nروز باقی‌مانده:\n<code>{days}</code>",
                severity="crit" if days <= 5 else "warn",
            )
        else:
            clear_alert(cfg, state, key, "گواهی تمدید شد", f"روز باقی‌مانده:\n<code>{days}</code>")


# ---------------------------------------------------------------------
# گزارش روزانه
# ---------------------------------------------------------------------
def build_report(cfg):
    svc_lines = []
    for svc in cfg["services"]:
        st = run(f"systemctl is-active {svc} 2>/dev/null").strip()
        mark = "✅" if st == "active" else "❌"
        svc_lines.append(f"{mark} {svc} — {st}")

    mem = run("free -m | awk '/^Mem:/{printf \"%d/%d MB\", $3, $2} /^Swap:/{printf \"  Swap: %d MB\", $2}'")
    disk = run("df -h / | tail -n1 | awk '{print $3\" از \"$2\"  (\"$5\")\"}'").strip()
    up = run("uptime -p 2>/dev/null").strip()
    load = run("cat /proc/loadavg | awk '{print $1, $2, $3}'").strip()

    proxy_state = "تنظیم نشده"
    if cfg["proxy_health"]:
        try:
            with urllib.request.urlopen(cfg["proxy_health"], timeout=12) as r:
                proxy_state = "سالم" if r.status == 200 else f"کد {r.status}"
        except Exception:
            proxy_state = "در دسترس نیست"

    return (
        "📋 <b>گزارش روزانه Foxy1</b>\n\n"
        "<b>سرویس‌ها</b>\n<pre>" + "\n".join(svc_lines) + "</pre>\n"
        f"<b>حافظه</b>\n<code>{mem.strip()}</code>\n\n"
        f"<b>دیسک</b>\n<code>{disk}</code>\n\n"
        f"<b>بار سیستم</b>\n<code>{load}</code>\n\n"
        f"<b>پروکسی تلگرام</b>\n<code>{proxy_state}</code>\n\n"
        f"<b>روشن بودن</b>\n<code>{up}</code>"
    )


def maybe_daily(cfg, state):
    now = datetime.now()
    today = now.strftime("%Y-%m-%d")
    if now.hour == cfg["daily_report_hour"] and state.get("last_daily") != today:
        if send_telegram(cfg, build_report(cfg)):
            state["last_daily"] = today


# ---------------------------------------------------------------------
# اجرا
# ---------------------------------------------------------------------
def one_pass(cfg, state):
    for fn in (check_services, check_memory, check_oom, check_disk,
               check_logs, check_proxy, check_cert):
        try:
            fn(cfg, state)
        except Exception as exc:
            log(f"خطا در {fn.__name__}: {exc}")
    maybe_daily(cfg, state)
    save_state(state)


def main():
    cfg = load_config()

    if "--report" in sys.argv:
        print(build_report(cfg))
        return

    if "--test" in sys.argv:
        print("در حال ارسال پیام آزمایشی...")
        ok = send_telegram(
            cfg,
            f"🦊 <b>Foxy1 Monitor</b>\n\nنسخه: <code>{VERSION}</code>\n"
            f"سرور: <code>{socket_host()}</code>\n\nاتصال برقرار است."
        )
        print("موفق" if ok else "ناموفق — تنظیمات را بررسی کن.")
        if ok:
            print("\nگزارش فعلی:\n")
            print(build_report(cfg))
        return

    if "--once" in sys.argv:
        state = load_state()
        one_pass(cfg, state)
        print("یک دور بررسی انجام شد.")
        return

    log(f"Foxy1 Monitor {VERSION} شروع شد — بازه {cfg['interval']} ثانیه")
    send_telegram(
        cfg,
        f"🦊 <b>Foxy1 Monitor فعال شد</b>\n\nسرور: <code>{socket_host()}</code>\n"
        f"بازه بررسی: <code>{cfg['interval']}s</code>\n"
        f"سرویس‌های تحت نظر: <code>{', '.join(cfg['services'])}</code>"
    )

    state = load_state()
    while True:
        try:
            one_pass(cfg, state)
        except Exception as exc:
            log(f"خطای کلی: {exc}")
        time.sleep(cfg["interval"])


if __name__ == "__main__":
    main()
