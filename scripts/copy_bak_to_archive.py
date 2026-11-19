import os, shutil, ctypes, time

ROOT = r"C:\Users\mail\Documents\ChatGPT\自动钢琴陪练系统\.sites-runtime"
ARCH = r"D:\piano-runtime-migration-backup"
BAK = [
    "personal-release.pre-migration.bak",
    "voice-reference.pre-migration.bak",
    "SadTalker.pre-migration.bak",
]
os.makedirs(ARCH, exist_ok=True)

def free_gb(drive):
    free = ctypes.c_ulonglong(0); tot = ctypes.c_ulonglong(0)
    ctypes.windll.kernel32.GetDiskFreeSpaceExW(ctypes.c_wchar_p(drive), None, ctypes.byref(tot), ctypes.byref(free))
    return free.value / 1e9

print("开始 C: 可用 %.2f GB | D: 可用 %.2f GB" % (free_gb("C:\\"), free_gb("D:\\")))
t0 = time.time()
for bak in BAK:
    src = os.path.join(ROOT, bak)
    dst = os.path.join(ARCH, bak)
    if not os.path.isdir(src):
        print("[跳过] %s 源不在 C 盘(可能已迁走)" % bak)
        continue
    print("[复制] %s (仅复制, 不动 C 盘源)" % bak, flush=True)
    n_skip = 0; n_copy = 0; sz = 0
    for root, dirs, files in os.walk(src):
        for fn in files:
            sp = os.path.join(root, fn)
            rel = os.path.relpath(sp, src)
            dp = os.path.join(dst, rel)
            try:
                if os.path.exists(dp) and os.path.getsize(dp) == os.path.getsize(sp):
                    n_skip += 1
                else:
                    os.makedirs(os.path.dirname(dp), exist_ok=True)
                    shutil.copy2(sp, dp)
                    if os.path.getsize(dp) != os.path.getsize(sp):
                        print("  !! 校验不符重来: %s" % rel)
                        continue
                    n_copy += 1
                sz += os.path.getsize(os.path.join(dst, rel))
            except Exception as e:
                print("  !! 异常: %s : %s" % (rel, str(e)[:60]))
    print("  -> %s: 新增 %d / 跳过已存在 %d / 累计 %.2f GB" % (bak, n_copy, n_skip, sz/1e9), flush=True)

print("总耗时 %.1f 秒" % (time.time() - t0))
print("结束 C: 可用 %.2f GB | D: 可用 %.2f GB" % (free_gb("C:\\"), free_gb("D:\\")))

print("=== 校验: D 盘归档 vs C 盘源 文件数/大小一致性 ===")
for bak in BAK:
    src = os.path.join(ROOT, bak)
    dst = os.path.join(ARCH, bak)
    def cnt(p):
        if not os.path.isdir(p): return (0, 0)
        c = 0; s = 0
        for r, d, fs in os.walk(p):
            for f in fs:
                try: c += 1; s += os.path.getsize(os.path.join(r, f))
                except: pass
        return (c, s)
    if not os.path.isdir(src):
        dc, ds = cnt(dst)
        print("  %-34s C源=已迁走 | D归档=%d文件/%.2fGB" % (bak, dc, ds/1e9))
    else:
        sc, ss = cnt(src); dc, ds = cnt(dst)
        ok = (sc == dc and ss == ds)
        print("  %-34s C源=%d/%.2fGB D归档=%d/%.2fGB %s" % (bak, sc, ss/1e9, dc, ds/1e9, "一致" if ok else "!!不一致"))
print("DONE")
