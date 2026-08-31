#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
patch-coinfix3.py — رفع باگ «وارد بخش راهنما و منو نمی‌شود».

علت: previewText متن پیش‌فرض را خام می‌بُرد و تگ نیمه‌مانده (<…) می‌ساخت؛
تلگرام ویرایش پیام را رد می‌کرد و صفحه باز نمی‌شد.
فیکس: حذف تگ‌ها + escape + سپس برش.

کاربرد: python3 patch-coinfix3.py --dir /مسیر/foxteam-bot
"""
import argparse, os, shutil, subprocess, sys, time

REPL = []

REPL.append(("foxcoin-admin.js", "safe-preview",
"""function previewText(s, n) {
  s = String(s == null ? '' : s);
  return s.length > n ? s.slice(0, n) + '…' : s;
}""",
"""function previewText(s, n) {
  s = String(s == null ? '' : s).replace(/<[^>]*>/g, ' ').replace(/\\s+/g, ' ').trim();
  s = esc(s);
  return s.length > n ? s.slice(0, n) + '…' : s;
}"""))


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--dir", required=True)
    a = ap.parse_args()
    files = {}
    for name in ("foxcoin-admin.js",):
        p = os.path.join(a.dir, name)
        if not os.path.exists(p):
            print("ERROR: not found:", p); return 1
        files[name] = open(p, "r", encoding="utf-8").read()

    missing = [(f, l) for f, l, o, n in REPL if o not in files[f]]
    if missing:
        print("ERROR: missing targets:", missing); return 2

    stamp = time.strftime("%Y%m%d-%H%M%S")
    baks = []
    for name in files:
        bak = "%s.bak-coinfix3-%s" % (os.path.join(a.dir, name), stamp)
        shutil.copy2(os.path.join(a.dir, name), bak); baks.append(bak)

    applied = []
    for f, l, o, n in REPL:
        files[f] = files[f].replace(o, n, 1); applied.append("%s:%s" % (f, l))

    tmps = []
    for f, txt in files.items():
        tmp = os.path.join(a.dir, f + ".coinfix3.tmp.js")
        open(tmp, "w", encoding="utf-8").write(txt); tmps.append((f, tmp))
        chk = subprocess.run(["node", "--check", tmp], capture_output=True, text=True)
        if chk.returncode != 0:
            for _, t in tmps:
                if os.path.exists(t): os.remove(t)
            print("SYNTAX FAILED in", f); print(chk.stderr[:400]); return 3
    for f, tmp in tmps:
        os.replace(tmp, os.path.join(a.dir, f))
    print("PATCHED OK:", ", ".join(applied))
    print("backups:", ", ".join(baks))
    return 0


if __name__ == "__main__":
    sys.exit(main())
