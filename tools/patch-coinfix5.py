#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
patch-coinfix5.py — همگام‌سازی خودآزمون foxcoin-admin با رفتار جدید routeText.

routeText پس از ذخیره‌ی متن، به‌جای true شیء {next:'admin:tedit:KEY'} برمی‌گرداند
تا ویرایشگر با متنِ نو باز شود؛ تست داخلی هم همین را تأیید می‌کند.

کاربرد: python3 patch-coinfix5.py --dir /مسیر/foxteam-bot
"""
import argparse, os, shutil, subprocess, sys, time

REPL = []

REPL.append(("foxcoin-admin.js", "selftest-reopen",
"""      a(await routeText({ uid: 'u9', config: { admins: ['u9'] },
                          text: 'متن جدید من' }) === true, 'متن دریافتی ذخیره شد');""",
"""      const _rtSave = await routeText({ uid: 'u9', config: { admins: ['u9'] },
                          text: 'متن جدید من' });
      a(_rtSave && _rtSave.next === 'admin:tedit:menu_note', 'متن دریافتی ذخیره شد و ویرایشگر بازگشت');"""))


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--dir", required=True)
    a = ap.parse_args()
    p = os.path.join(a.dir, "foxcoin-admin.js")
    if not os.path.exists(p):
        print("ERROR: not found:", p); return 1
    src = open(p, "r", encoding="utf-8").read()

    missing = [(f, l) for f, l, o, n in REPL if o not in src]
    if missing:
        print("ERROR: missing targets:", missing); return 2

    stamp = time.strftime("%Y%m%d-%H%M%S")
    bak = "%s.bak-coinfix5-%s" % (p, stamp)
    shutil.copy2(p, bak)

    for f, l, o, n in REPL:
        src = src.replace(o, n, 1)

    tmp = p + ".coinfix5.tmp.js"
    open(tmp, "w", encoding="utf-8").write(src)
    chk = subprocess.run(["node", "--check", tmp], capture_output=True, text=True)
    if chk.returncode != 0:
        os.remove(tmp); print("SYNTAX FAILED"); print(chk.stderr[:400]); return 3
    os.replace(tmp, p)
    print("PATCHED OK: foxcoin-admin.js:selftest-reopen")
    print("backups:", bak)
    return 0


if __name__ == "__main__":
    sys.exit(main())
