import os, json, hashlib, time

BASE = r"C:\Users\mail\Documents\ChatGPT\自动钢琴陪练系统\.sites-runtime"
BAK = [
    "personal-release.pre-migration.bak",
    "voice-reference.pre-migration.bak",
    "SadTalker.pre-migration.bak",
]

manifest = {"generated_at": time.strftime("%Y-%m-%d %H:%M:%S"), "folders": {}}
total_bytes = 0
total_files = 0
summary = []

for name in BAK:
    p = os.path.join(BASE, name)
    files = []
    folder_bytes = 0
    folder_count = 0
    for root, dirs, fnames in os.walk(p):
        for fn in fnames:
            fp = os.path.join(root, fn)
            try:
                sz = os.path.getsize(fp)
            except OSError:
                continue
            rel = os.path.relpath(fp, p)
            files.append({"rel": rel, "size": sz})
            folder_bytes += sz
            folder_count += 1
    files.sort(key=lambda x: x["rel"])
    manifest["folders"][name] = {
        "path": p,
        "total_bytes": folder_bytes,
        "file_count": folder_count,
        "files": files,
    }
    total_bytes += folder_bytes
    total_files += folder_count
    summary.append((name, folder_bytes, folder_count))
    print("%-34s %10.2f GB  %5d 文件" % (name, folder_bytes / 1e9, folder_count))

manifest["total_bytes"] = total_bytes
manifest["total_files"] = total_files
print("-" * 60)
print("%-34s %10.2f GB  %5d 文件" % ("合计", total_bytes / 1e9, total_files))

out = os.path.join(os.path.dirname(os.path.abspath(__file__)), "bak_upload_manifest.json")
with open(out, "w", encoding="utf-8") as f:
    json.dump(manifest, f, ensure_ascii=False, indent=1)
print("\n清单已写:", out)
