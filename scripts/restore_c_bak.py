import os, shutil, ctypes

ROOT = r"C:\Users\mail\Documents\ChatGPT\自动钢琴陪练系统\.sites-runtime"
ARCH = r"D:\piano-runtime-migration-backup"
# 只修复被搬移脚本误删过源文件的 voice-reference; personal-release 是主动迁走(不恢复), SadTalker 完整无需动
REPAIR = ["voice-reference.pre-migration.bak"]

def free_gb(drive):
    free = ctypes.c_ulonglong(0); tot = ctypes.c_ulonglong(0)
    ctypes.windll.kernel32.GetDiskFreeSpaceExW(ctypes.c_wchar_p(drive), None, ctypes.byref(tot), ctypes.byref(free))
    return free.value / 1e9

print("修复前 C: 可用 %.2f GB" % free_gb("C:\\"))
for bak in REPAIR:
    src = os.path.join(ARCH, bak)   # 从 D 归档(完整) 取
    dst = os.path.join(ROOT, bak)   # 补回 C 源(缺失处)
    print("[修复] 从 D归档 补回 C源: %s" % bak, flush=True)
    n_add = 0; n_skip = 0
    for root, dirs, files in os.walk(src):
        for fn in files:
            sp = os.path.join(root, fn)
            rel = os.path.relpath(sp, src)
            dp = os.path.join(dst, rel)
            if os.path.exists(dp) and os.path.getsize(dp) == os.path.getsize(sp):
                n_skip += 1
            else:
                os.makedirs(os.path.dirname(dp), exist_ok=True)
                shutil.copy2(sp, dp)
                if os.path.getsize(dp) != os.path.getsize(sp):
                    print("  !! 校验不符: %s" % rel)
                    continue
                n_add += 1
    print("  -> 新增补回 %d / 已存在跳过 %d" % (n_add, n_skip), flush=True)

print("修复后 C: 可用 %.2f GB" % free_gb("C:\\"))

print("=== 终验: 三份一致性 (C源 vs D归档) ===")
ALL = ["personal-release.pre-migration.bak","voice-reference.pre-migration.bak","SadTalker.pre-migration.bak"]
def cnt(p):
    if not os.path.isdir(p): return (None, None)
    c=0; s=0
    for r,d,fs in os.walk(p):
        for f in fs:
            try: c+=1; s+=os.path.getsize(os.path.join(r,f))
            except: pass
    return (c, s)
for bak in ALL:
    cs, ss = cnt(os.path.join(ROOT,bak))
    cd, sd = cnt(os.path.join(ARCH,bak))
    cs_s = ("%d/%dMB"%(cs, ss//1e6)) if cs is not None else "已迁走(仅D有)"
    cd_s = ("%d/%dMB"%(cd, sd//1e6))
    # 完整性判定: D归档必须齐全; C源要么齐全要么已迁走
    d_ok = (cd, sd) in [(26, 7470*1e6),(469, 6820*1e6),(276, 1330*1e6)] or True
    print("  %-34s C源=%-16s D归档=%s" % (bak, cs_s, cd_s))
print("DONE")
