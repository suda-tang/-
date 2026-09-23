import concurrent.futures,json,re,base64
from pathlib import Path
from urllib.request import urlopen
names=['acoustic_grand_piano','bright_acoustic_piano','electric_grand_piano','honkytonk_piano','electric_piano_1','electric_piano_2','harpsichord','clavinet','celesta','glockenspiel','vibraphone','marimba','tubular_bells','church_organ','acoustic_guitar_nylon','acoustic_guitar_steel','orchestral_harp','violin','viola','cello','contrabass','flute','clarinet','oboe','bassoon','french_horn','trumpet','trombone','string_ensemble_1']
root=Path('dist/assets/instruments');root.mkdir(parents=True,exist_ok=True)
def get(name):
    folder=root/name
    if (folder/'ready.json').exists():return name+' cached'
    raw=urlopen('https://gleitz.github.io/midi-js-soundfonts/FluidR3_GM/'+name+'-mp3.js',timeout=60).read().decode()
    raw=raw[raw.index(' = {',raw.index('MIDI.Soundfont.'))+3:].strip().rstrip(';')
    data=json.loads(re.sub(r',\s*}', '}',raw))
    folder.mkdir(exist_ok=True);saved=[]
    for midi in range(21,109,3):
        note=['C','Db','D','Eb','E','F','Gb','G','Ab','A','Bb','B'][midi%12]+str(midi//12-1)
        if note not in data:raise ValueError(name+': missing '+note)
        (folder/(str(midi)+'.mp3')).write_bytes(base64.b64decode(data[note].split(',')[1]));saved.append(midi)
    (folder/'ready.json').write_text(json.dumps(saved));return name+' ready'
with concurrent.futures.ThreadPoolExecutor(max_workers=4) as pool:
    for result in pool.map(get,names):print(result,flush=True)
(root/'LICENSE.txt').write_text('FluidR3 GM by Frank Wen and contributors. CC BY 3.0.\nRendered MP3 soundfonts by Benjamin Gleitzman.\nhttps://github.com/gleitz/midi-js-soundfonts\nhttps://creativecommons.org/licenses/by/3.0/\nThree-semitone subset extracted for this application.\n')
