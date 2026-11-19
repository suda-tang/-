"""Stage validated V4 recordings, then publish without overwriting old media."""
from pathlib import Path
import argparse
import hashlib
import json
import re
import shutil
import subprocess
import sys
import time
import zipfile

import numpy as np
import soundfile as sf

ROOT = Path(__file__).resolve().parents[1]
SOURCE = ROOT / 'output/audio/mentor-v4-release-20261026'
STAGE = SOURCE / 'staged'
PUBLIC = ROOT / 'dist'
RELEASE = 'eleven-v4-20261027'
FF = 'C:/Users/mail/AppData/Local/Programs/nascab/libs/ffmpeg/bin/win/x64/ffmpeg.exe'
PENDING = 'mentor-learning'
sys.path.insert(0, str(ROOT / 'scripts'))
from narration_envelope import envelope


def read(path):
    return json.loads(path.read_text(encoding='utf-8'))


def write(path, value):
    path.parent.mkdir(parents=True, exist_ok=True)
    temp = path.with_name(path.name + '.pending')
    temp.write_text(json.dumps(value, ensure_ascii=False, indent=2) + '\n', encoding='utf-8')
    temp.replace(path)


def run(*args):
    subprocess.run([FF, '-v', 'error', *map(str, args)], check=True)


def encode(source, target, filters=None):
    args = ['-y', '-i', source]
    if filters:
        args += ['-filter_complex', filters, '-map', '[out]']
    args += ['-c:a', 'aac', '-b:a', '128k', '-movflags', '+faststart', target]
    run(*args)
    run('-i', target, '-f', 'null', '-')
    envelope(target)


def main(apply=False):
    STAGE.mkdir(parents=True, exist_ok=True)
    prepared = read(ROOT / '.sites-runtime/elevenlabs-mentor-20261025/preparation.json')['segments']
    texts = {s['id']: s for s in prepared}
    receipt = read(SOURCE / 'generation.json')
    if receipt.get('model') != 'Eleven v4' or receipt.get('turbo') is not False:
        raise RuntimeError('Only verified non-Turbo V4 recordings can be published')
    verified = {s['id']: s for s in receipt['items']}
    staged = []
    for segment in prepared:
        ident = segment['id']
        if ident == PENDING or ident not in verified:
            continue
        source = SOURCE / (ident + '.mp3')
        data, rate = sf.read(source, dtype='float32')
        duration = len(data) / rate
        if (not np.isfinite(data).all() or np.sqrt(np.mean(data ** 2)) < .0001
                or duration < max(2, len(segment['text']) / 11)):
            raise RuntimeError(f'{ident}: incomplete, silent or invalid audio')
        digest = hashlib.sha256(source.read_bytes()).hexdigest()
        target = STAGE / f'{ident}.{RELEASE}.m4a'
        cache = target.with_suffix('.receipt.json')
        if not (target.exists() and cache.exists() and read(cache).get('sourceSha256') == digest):
            encode(source, target)
            write(cache, {'sourceSha256': digest, 'taskId': verified[ident]['taskId'],
                          'seconds': duration, 'model': 'Eleven v4', 'turbo': False})
        staged.append({'id': ident, 'role': 'mentor', 'text': segment['text'],
                       'url': '/narration/' + target.name, 'seconds': duration,
                       'model': 'Eleven v4', 'taskId': verified[ident]['taskId']})
    first = STAGE / f'mentor-preface.{RELEASE}.m4a'
    cartoon = STAGE / f'mentor-preface.cartoon.{RELEASE}.m4a'
    if first.exists() and not cartoon.exists():
        # Word timestamps plus the PCM silence audit locate the identity sentence.
        # Both cuts lie in pauses: preserve the welcome and the following 秋鸣.
        filters = ('[0:a]asplit=2[a][b];'
                   '[a]atrim=end=3.54,asetpts=PTS-STARTPTS,afade=t=out:st=3.53:d=0.01[a0];'
                   '[b]atrim=start=5.74,asetpts=PTS-STARTPTS,afade=t=in:d=0.01[b0];'
                   '[a0][b0]concat=n=2:v=0:a=1[out]')
        encode(first, cartoon, filters)
    write(SOURCE / 'stage-report.json', {'release': RELEASE, 'staged': staged,
                                        'pending': [PENDING], 'published': False})
    if not apply:
        print(json.dumps({'staged': len(staged), 'required': 6}))
        return
    if len(staged) != 6:
        raise RuntimeError('All six authorised recordings must be staged before publishing')

    old = read(PUBLIC / 'narration/tour.json')
    fresh = {s['id']: s for s in staged}
    tracks = [fresh.get(t['id'], t) for t in old]
    if len(tracks) != 7 or next(t for t in tracks if t['id'] == PENDING) != next(t for t in old if t['id'] == PENDING):
        raise RuntimeError('The ungenerated seventh recording must remain intact')
    backup = ROOT / '.sites-runtime/backups' / ('mentor-before-v4-' + time.strftime('%Y%m%d-%H%M%S'))
    backup.mkdir(parents=True)
    metadata = ['narration/tour.json', 'narration/tour.cartoon.json',
                'narration/mentor-script.json', 'narration/mentor-script.revised.json',
                'narration/generation.json', 'mentor-track-list.js', 'mentor-identity.js',
                'mentor-preload.js', 'narration-opening.js', 'narration-avatar.js', 'mentor-classroom.js']
    media = [t['url'].split('?')[0].lstrip('/') for t in old]
    media += ['narration/mentor-preface.cartoon.m4a']
    for name in list(dict.fromkeys(metadata + media)):
        source = PUBLIC / name
        if source.exists():
            target = backup / name
            target.parent.mkdir(parents=True, exist_ok=True)
            shutil.copy2(source, target)
            mouth = source.with_suffix('.mouth.json')
            if source.suffix in ('.mp3', '.m4a', '.wav') and mouth.exists():
                shutil.copy2(mouth, target.with_suffix('.mouth.json'))
    archive = backup.with_suffix('.zip')
    with zipfile.ZipFile(archive, 'w', zipfile.ZIP_STORED) as z:
        for p in backup.rglob('*'):
            if p.is_file():
                z.write(p, p.relative_to(backup))

    # Publish new versioned media first, then switch the small manifests.
    for source in STAGE.glob('*'):
        if source.suffix == '.m4a' or source.name.endswith('.mouth.json'):
            shutil.copy2(source, PUBLIC / 'narration' / source.name)
    cartoon_tracks = []
    for t in tracks:
        item = dict(t)
        item['text'] = re.sub(r'我是苏大音乐学院的冒小[瑛英][。！]?', '', item['text'])
        if item['id'] == 'mentor-preface':
            item['url'] = '/narration/' + cartoon.name
            item['seconds'] = next(t['seconds'] for t in staged if t['id'] == 'mentor-preface') - 2.2
        cartoon_tracks.append(item)
    write(PUBLIC / 'narration/tour.json', tracks)
    write(PUBLIC / 'narration/tour.cartoon.json', cartoon_tracks)
    for name in ['mentor-script.json', 'mentor-script.revised.json']:
        path = PUBLIC / 'narration' / name
        if path.exists():
            rows = read(path)
            for row in rows:
                if row['id'] in fresh:
                    row['text'] = texts[row['id']]['text']
            write(path, rows)
    path = PUBLIC / 'mentor-track-list.js'
    code = path.read_text(encoding='utf-8')
    code, count = re.subn(r'const tracks=\[.*?\];\s*\nexport function openingTracks',
                          lambda _: 'const tracks=' + json.dumps(tracks, ensure_ascii=False, separators=(',', ':')) + ';\nexport function openingTracks',
                          code, count=1, flags=re.S)
    if count != 1:
        raise RuntimeError('Cannot update embedded mentor track list')
    path.write_text(code, encoding='utf-8')
    path = PUBLIC / 'mentor-identity.js'
    code = path.read_text(encoding='utf-8').replace('/narration/mentor-preface.voxcpm.clean.m4a',
                                                 '/narration/' + first.name)
    code = code.replace('/narration/mentor-preface.cartoon.m4a', '/narration/' + cartoon.name)
    path.write_text(code, encoding='utf-8')
    for name in metadata:
        path = PUBLIC / name
        if path.suffix != '.js' or not path.exists():
            continue
        code = path.read_text(encoding='utf-8')
        code = code.replace('mentor-track-list.js?v=132', 'mentor-track-list.js?v=' + RELEASE)
        code = code.replace('mentor-identity.js?v=132', 'mentor-identity.js?v=' + RELEASE)
        path.write_text(code, encoding='utf-8')
    state = {'status': 'partial', 'completed': 6, 'total': 7, 'published': True,
             'pending': [PENDING], 'reason': 'Available character quota; existing recording retained',
             'model': 'Eleven v4', 'turbo': False, 'release': RELEASE, 'updated': time.time()}
    write(PUBLIC / 'narration/generation.json', state)
    write(PUBLIC / 'narration/v4-release.json', state)
    write(SOURCE / 'deployment.json', {**state, 'backup': str(backup), 'archive': str(archive),
                                     'tracks': tracks, 'cartoonIdentityCut': [3.54, 5.74]})
    print(json.dumps({'published': 6, 'pending': PENDING, 'backup': str(archive)}, ensure_ascii=False))


if __name__ == '__main__':
    parser = argparse.ArgumentParser()
    parser.add_argument('--apply', action='store_true')
    main(parser.parse_args().apply)
