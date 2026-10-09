"""Rebuild the library-wide music-theory index (instrumentation + chords).

Run this after importing a batch of new scores, or when chord/instrument
search results look stale:

    python scripts/build-theory-index.py            # incremental (mtime-keyed)
    python scripts/build-theory-index.py --force    # re-read every score

Facts are cached per score under .sites-runtime/theory-cache/<id>.json and
keyed by the score file's mtime, so the incremental run only re-reads what
actually changed. The AI reads the index via music_index.load_index(), which
is a fast, non-blocking cache scan.
"""
import sys
import time
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(ROOT))

import music_index  # noqa: E402


def main():
    force = '--force' in sys.argv
    started = time.time()
    print('building theory index (force=%s) ...' % force, flush=True)
    index = music_index.build_all(progress=lambda t: print(t, flush=True), force=force)
    out = ROOT / '.sites-runtime' / 'theory-index.json'
    import json
    out.write_text(json.dumps(index, ensure_ascii=False), encoding='utf-8')
    print('done in %.1f min' % ((time.time() - started) / 60))
    print('scores=%d covered=%d instruments=%d chords=%d'
          % (index['scores'], index['covered'], len(index['instruments']), len(index['chords'])))
    for label, ids in sorted(index['instruments'].items(), key=lambda kv: -len(kv[1]))[:6]:
        print('  %-8s %d 首' % (label, len(ids)))


if __name__ == '__main__':
    main()
