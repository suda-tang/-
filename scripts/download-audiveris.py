"""Download the Audiveris MSI with resumable HTTP range requests.

The GitHub release is large and some Windows proxy paths terminate long
downloads.  Range requests let setup resume individual chunks and verify the
official SHA-256 before the installer is used.
"""

from concurrent.futures import ThreadPoolExecutor, as_completed
from pathlib import Path
import hashlib
import os
import sys
import time
import urllib.request


URL = "https://github.com/Audiveris/audiveris/releases/download/5.11.0/Audiveris-5.11.0-windows-x86_64.msi"
SIZE = 85_062_430
SHA256 = "ac221b0d39a90e32b7f43dbf9f5d5a45ff8b5424076af21b65278955688dac71"
CHUNK_SIZE = 4 * 1024 * 1024
WORKERS = 8


def fetch_chunk(args):
    index, start, end, part = args
    expected = end - start + 1
    for attempt in range(1, 6):
        try:
            if part.exists() and part.stat().st_size == expected:
                return index, expected
            request = urllib.request.Request(
                URL,
                headers={
                    "Accept-Encoding": "identity",
                    "Range": f"bytes={start}-{end}",
                    "User-Agent": "Mozilla/5.0",
                },
            )
            with urllib.request.urlopen(request, timeout=180) as response:
                if response.status != 206:
                    raise RuntimeError(f"expected HTTP 206, got {response.status}")
                data = response.read()
            if len(data) != expected:
                raise RuntimeError(f"expected {expected} bytes, got {len(data)}")
            part.write_bytes(data)
            return index, expected
        except Exception:
            if attempt == 5:
                raise
            time.sleep(attempt * 2)


def main():
    output = Path(sys.argv[1]) if len(sys.argv) > 1 else Path("audiveris.msi")
    output.parent.mkdir(parents=True, exist_ok=True)
    parts_dir = output.with_name(output.name + ".parts")
    parts_dir.mkdir(parents=True, exist_ok=True)
    chunks = []
    for index, start in enumerate(range(0, SIZE, CHUNK_SIZE)):
        end = min(SIZE - 1, start + CHUNK_SIZE - 1)
        chunks.append((index, start, end, parts_dir / f"{index:03d}.part"))

    with ThreadPoolExecutor(max_workers=WORKERS) as pool:
        futures = [pool.submit(fetch_chunk, chunk) for chunk in chunks]
        for completed, future in enumerate(as_completed(futures), 1):
            index, length = future.result()
            print(f"chunk {index + 1}/{len(chunks)} ready ({length:,} bytes)", flush=True)

    with output.open("wb") as destination:
        for _, _, _, part in chunks:
            with part.open("rb") as source:
                while block := source.read(1024 * 1024):
                    destination.write(block)

    digest = hashlib.sha256(output.read_bytes()).hexdigest()
    if output.stat().st_size != SIZE or digest.lower() != SHA256:
        raise RuntimeError(f"checksum mismatch: {output.stat().st_size} bytes, {digest}")
    print(f"verified {output} ({SIZE:,} bytes, SHA256 {digest})")


if __name__ == "__main__":
    try:
        main()
    except Exception as error:
        print(f"download failed: {error}", file=sys.stderr)
        raise
