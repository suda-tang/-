# -*- coding: utf-8 -*-
"""把 .sites-runtime 下的冷目录迁到 D 盘，并在原位建 junction（路径对程序透明）。

安全设计（对应唐老师确认的「零删除」方案）：
  1. robocopy 复制 SRC -> DST（不删源）
  2. 逐项校验：文件数 / 目录数 / 总字节数完全一致，否则立即停止
  3. 原目录**改名保留**为 <name>.pre-migration.bak（不删除、不进回收站，可回滚）
  4. 在原路径建 junction 指向 DST
  5. 回读验证：通过原 C 盘路径能读到 D 盘内容，且 is_reparse=True
  任一步失败即停止并打印回滚指引；绝不删任何数据。

用法：
  python scripts/migrate_runtime_dir.py personal-release
  python scripts/migrate_runtime_dir.py --verify-only voice-reference
"""
import argparse
import os
import pathlib
import shutil
import stat
import subprocess
import sys
import time
import _winapi

ROOT = pathlib.Path(r"C:\Users\mail\Documents\ChatGPT\自动钢琴陪练系统")
RT = ROOT / '.sites-runtime'
MIRROR = pathlib.Path(r"D:\piano-runtime-mirror")
ALLOWED = {'personal-release', 'voice-reference', 'SadTalker',
           'score-cache', 'avatar-env', 'performance-env'}
LOG = RT / 'migration.log'


def say(msg):
    line = '[%s] %s' % (time.strftime('%Y-%m-%d %H:%M:%S'), msg)
    print(line, flush=True)
    try:
        with LOG.open('a', encoding='utf-8') as f:
            f.write(line + '\n')
    except OSError:
        pass


def human(n):
    for u in ('B', 'KB', 'MB', 'GB', 'TB'):
        if n < 1024 or u == 'TB':
            return '%.2f %s' % (n, u)
        n /= 1024.0


def is_reparse(p):
    try:
        return bool(p.lstat().st_file_attributes & stat.FILE_ATTRIBUTE_REPARSE_POINT)
    except (AttributeError, OSError):
        return False


def scan(d):
    """返回 (文件数, 目录数, 总字节数, {相对路径: 大小})，用 os.scandir 手写递归。"""
    files = dirs = total = 0
    sizes = {}
    base = str(d)
    stack = [('', base)]
    while stack:
        rel, cur = stack.pop()
        try:
            with os.scandir(cur) as it:
                for e in it:
                    child_rel = (rel + '/' + e.name) if rel else e.name
                    try:
                        if e.is_dir(follow_symlinks=False):
                            dirs += 1
                            stack.append((child_rel, e.path))
                        else:
                            st = e.stat(follow_symlinks=False)
                            files += 1
                            total += st.st_size
                            sizes[child_rel] = st.st_size
                    except OSError:
                        pass
        except OSError:
            pass
    return files, dirs, total, sizes


def robocopy(src, dst):
    """返回 (ok, returncode, tail)。robocopy 退出码 0-7 均视为成功，>=8 才是错误。"""
    cmd = ['robocopy', str(src), str(dst), '/E', '/COPY:DAT', '/DCOPY:DAT',
           '/R:1', '/W:1', '/NFL', '/NDL', '/NJH', '/NJS', '/NP']
    try:
        r = subprocess.run(cmd, capture_output=True, timeout=3600)
    except subprocess.TimeoutExpired:
        return False, -1, 'robocopy 超时 1 小时'
    out = (r.stdout or b'').decode('utf-8', errors='ignore') + \
          (r.stderr or b'').decode('utf-8', errors='ignore')
    ok = r.returncode < 8
    return ok, r.returncode, out.strip()[-800:]


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument('name', help='要迁移的目录名')
    ap.add_argument('--verify-only', action='store_true', help='只校验不改动')
    args = ap.parse_args()

    name = args.name
    if name not in ALLOWED:
        say('拒绝：%s 不在允许清单内' % name)
        return 2
    src = RT / name
    dst = MIRROR / name
    bak = RT / (name + '.pre-migration.bak')

    say('=== 开始处理 %s ===' % name)
    say('源 %s' % src)
    say('目标 %s' % dst)

    if not src.exists():
        say('源不存在，停止')
        return 2
    if is_reparse(src):
        say('源已经是 junction/reparse，可能已迁移过，停止')
        return 2
    if bak.exists():
        say('备份目录 %s 已存在，为避免覆盖，停止' % bak)
        return 2

    f0, d0, s0, sizes0 = scan(src)
    say('源体检：%d 文件 / %d 目录 / %s' % (f0, d0, human(s0)))
    if not f0:
        say('源为空，停止')
        return 2

    if args.verify_only:
        if dst.exists():
            f1, d1, s1, sizes1 = scan(dst)
            say('目标体检：%d 文件 / %d 目录 / %s' % (f1, d1, human(s1)))
            say('一致性：%s' % ('一致' if (f0, d0, s0, sizes0) == (f1, d1, s1, sizes1) else '不一致'))
        else:
            say('目标不存在')
        return 0

    # --- 1) 复制 ---
    MIRROR.mkdir(parents=True, exist_ok=True)
    say('robocopy 复制中…')
    ok, rc, tail = robocopy(src, dst)
    say('robocopy 返回码 %d（0-7 为成功）' % rc)
    if not ok:
        say('复制失败，停止。输出尾部：%s' % tail)
        return 1

    # --- 2) 校验 ---
    f1, d1, s1, sizes1 = scan(dst)
    say('目标体检：%d 文件 / %d 目录 / %s' % (f1, d1, human(s1)))
    if (f0, d0, s0) != (f1, d1, s1):
        say('数量/字节数不一致，停止（目标副本保留，源未动）')
        say('  src=(%d,%d,%d) dst=(%d,%d,%d)' % (f0, d0, s0, f1, d1, s1))
        return 1
    diff = [k for k in sizes0 if sizes0.get(k) != sizes1.get(k)]
    missing = [k for k in sizes0 if k not in sizes1]
    if diff or missing:
        say('逐文件校验不一致：%d 个大小不符、%d 个缺失，停止' % (len(diff), len(missing)))
        say('  示例 %s' % (diff[:3] or missing[:3]))
        return 1
    say('逐文件校验通过（%d 个文件大小逐一吻合）' % len(sizes0))

    # --- 3) 原目录改名保留 ---
    say('把原目录改名为 %s（不删除）' % bak.name)
    try:
        src.rename(bak)
    except OSError as e:
        say('改名失败（多半是被进程占用），停止。目标副本完好，源未动：%s' % e)
        return 1

    # --- 4) 建 junction ---
    say('在原路径建 junction 指向 %s' % dst)
    try:
        _winapi.CreateJunction(str(dst), str(src))
    except OSError as e:
        say('建 junction 失败，立即回滚改名：%s' % e)
        try:
            bak.rename(src)
            say('已回滚：%s -> %s' % (bak.name, src.name))
        except OSError as e2:
            say('!! 回滚失败，需手动把 %s 改回 %s：%s' % (bak, src, e2))
        return 1

    # --- 5) 回读验证 ---
    if not is_reparse(src):
        say('!! 原路径不是 reparse point，需人工检查')
        return 1
    f2, d2, s2, sizes2 = scan(src)
    if (f2, d2, s2, sizes2) != (f0, d0, s0, sizes0):
        say('!! 通过 junction 回读内容与源不一致，需人工检查')
        say('  link=(%d,%d,%d) src=(%d,%d,%d)' % (f2, d2, s2, f0, d0, s0))
        return 1
    probe = next(iter(sizes0))
    if not (src / probe).exists():
        say('!! 抽样文件不可达：%s' % probe)
        return 1

    say('验证通过：通过 %s 可完整读到 %d 文件 / %s' % (src, f2, human(s2)))
    say('备份保留在 %s（确认无误后可自行清理）' % bak)
    say('=== %s 迁移完成 ===' % name)
    return 0


if __name__ == '__main__':
    sys.exit(main())
