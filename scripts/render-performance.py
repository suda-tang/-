"""Run Pianist Transformer in its isolated environment; never modifies the original score."""
import json,sys,time
from pathlib import Path
base=Path(__file__).resolve().parents[1]
sys.path.insert(0,str(base));sys.path.insert(0,str(base/'.sites-runtime/PianistTransformer'))
from storage import write_json
from idle_runtime import checkpoint
def main():
 import torch
 from miditoolkit import MidiFile,Note,TempoChange,Instrument
 from src.model.pianoformer import PianoT5Gemma
 from src.model.generate import batch_performance_render
 from src.utils.midi import normalize_midi
 source_path=Path(sys.argv[1]);payload=json.loads(source_path.read_text(encoding='utf-8'));out=Path(sys.argv[2]);progress_path=out.with_suffix('.progress.json')
 last_progress=[-1,0.0]
 def progress(value):
  checkpoint()
  percentage=round(min(99,max(0,value*100)));now=time.monotonic()
  if percentage!=last_progress[0] and now-last_progress[1]>.4:
   write_json(progress_path,{'progress':percentage},optional=True);last_progress[:]=[percentage,now]
 torch.set_num_threads(2);torch.manual_seed(42)
 midi=MidiFile(ticks_per_beat=480);bpm=payload.get('bpm',80);midi.tempo_changes=[TempoChange(bpm,0)];instrument=Instrument(0);midi.instruments=[instrument]
 for event in payload['events']:
  for note in event['notes']:instrument.notes.append(Note(76,int(note['midi']),round(event['beat']*480),max(round(event['beat']*480)+1,round((event['beat']+note['duration'])*480))))
 midi.max_tick=max(n.end for n in instrument.notes)+480
 progress(0)
 checkpoint()
 model=PianoT5Gemma.from_pretrained(str(base/'.sites-runtime/PianistTransformer/models/sft'),torch_dtype=torch.float32).eval()
 with torch.inference_mode():rendered,_=batch_performance_render(model,[midi],device='cpu',max_context_length=1024,progress_callback=progress)
 original=normalize_midi(midi);performance=rendered[0];original_notes=original.instruments[0].notes;performed=performance.instruments[0].notes
 if len(original_notes)!=len(performed) or any(a.pitch!=b.pitch for a,b in zip(original_notes,performed)):raise ValueError('Model note alignment failed; original performance retained')
 original_times=original.get_tick_to_time_mapping();performed_times=performance.get_tick_to_time_mapping()
 pairs=[(a.pitch,float(original_times[a.start]),float(performed_times[b.start]),float(performed_times[b.end]),b.velocity/127) for a,b in zip(original_notes,performed)]
 if len(pairs)>1 and pairs[-1][2]>pairs[0][2]:
  scale=(pairs[-1][1]-pairs[0][1])/(pairs[-1][2]-pairs[0][2]);origin=pairs[0][2];start=pairs[0][1]
  pairs=[(pitch,nominal,start+(onset-origin)*scale,start+(end-origin)*scale,velocity) for pitch,nominal,onset,end,velocity in pairs]
 events=[]
 for event in payload['events']:
  notes=[]
  for note in event['notes']:
   possible=[p for p in pairs if p[0]==note['midi']]
   if not possible:raise ValueError('Missing aligned note')
   match=min(possible,key=lambda p:abs(p[1]-event['beat']*60/bpm));notes.append({'midi':note['midi'],'onset':match[2],'duration':match[3]-match[2],'velocity':match[4]})
  raw_onset=min(n['onset'] for n in notes)
  # Keep the model's expressive rubato musical but bounded around the written
  # grid. Unbounded generated offsets make a phrase sound drunk or lose the
  # bar line; six hundredths of a second is enough human movement at normal
  # practice tempos.
  nominal=event['beat']*60/bpm
  onset=nominal+max(-.06,min(.06,raw_onset-nominal))
  if events:
   onset=max(onset,events[-1]['onset']+.006)
  for note in notes:
   note['onset']=onset+max(-.012,min(.035,note['onset']-raw_onset))
  events.append({'beat':event['beat'],'onset':onset,'notes':notes})
 for i,event in enumerate(events):
  next_event=events[i+1] if i+1<len(events) else None
  event['tempoFactor']=max(.5,min(1.8,((next_event['beat']-event['beat'])*60/bpm)/max(.03,next_event['onset']-event['onset']))) if next_event else 1
  for note in event['notes']:note['delay']=max(0,min(.12,note['onset']-event['onset']))
 output={'engine':'Pianist Transformer','bpm':bpm,'events':events};write_json(out,output)
if __name__=='__main__':main()
