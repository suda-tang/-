"""CPU inference adapters; generated notes are persisted before the client opens them."""
import sys,json,math
from pathlib import Path
ROOT=Path(__file__).resolve().parents[1];sys.path.insert(0,str(ROOT))
from storage import write_json
from arrangement_music import PRESETS,PROGRAMS,meter_bars,model_score,warp,voice_leading,drum_pattern
from arrangement_source import original_xml
from arrangement_notation import write_notation
from idle_runtime import checkpoint
import numpy as np
import torch
import pretty_midi
torch.set_num_threads(2)

def generate(request,target):
 data=json.loads(Path(request).read_text(encoding='utf-8'));score=data['score'];params=data['params'];tempo=score.get('tempo') or 80
 source_xml=original_xml(data,request)
 original_score=score;bars=meter_bars(source_xml);score=model_score(score,bars)
 torch.manual_seed(137);np.random.seed(137)
 total=max(e['beat']+n['duration'] for e in score['events'] for n in e['notes']);segments=max(1,math.ceil(total/8))
 def progress(value,detail):write_json(Path(target).with_suffix('.progress.json'),{'progress':value,'detail':detail},optional=True)
 midi=pretty_midi.PrettyMIDI(initial_tempo=tempo);source=pretty_midi.Instrument(0,name='Piano')
 for e in score['events']:
  notes=e['notes']
  for n in notes:source.notes.append(pretty_midi.Note(84,int(n['midi']),e['beat']*60/tempo,(e['beat']+n['duration'])*60/tempo))
 midi.instruments.append(source);models=[]
 if params['style']!='original':
  progress(4,'载入多声部配器模型');repo=ROOT/'.sites-runtime/Structured-Arrangement';sys.path.insert(0,str(repo))
  from orchestrator.prior_model import Prior
  from orchestrator.utils import pr2grid,grid2pr
  from orchestrator.autoencoder_dataset import EMBED_PROGRAM_MAPPING
  from orchestrator.prior_dataset import TOTAL_LEN_BIN
  model=Prior.init_inference_model(str(repo/'data_file_dir/params_prior.pt'),str(repo/'data_file_dir/params_autoencoder.pt'),DEVICE='cpu').eval()
  # Program 73 is the Flute. 72 is the Piccolo, whose name was written into the
  # part list while the client played a flute sample for it.
  programs=params.get('programs') or PRESETS[params['style']]
  tracks=[pretty_midi.Instrument(p,name=pretty_midi.program_to_instrument_name(p)) for p in programs]
  rolls=np.zeros((segments,32,128),dtype=np.int64)
  for e in score['events']:
   start=max(0,round(e['beat']*4));segment,step=divmod(start,32)
   if segment<segments:
    for n in e['notes']:rolls[segment,step,int(n['midi'])]=max(1,min(32,round(n['duration']*4)))
  for begin in range(0,segments,1):
   checkpoint()
   end=min(segments,begin+1);mix=torch.from_numpy(np.array([pr2grid(r,max_note_count=32) for r in rolls[begin:end]]));positions=np.arange(begin,end)
   prog=torch.tensor([EMBED_PROGRAM_MAPPING[p] for p in programs]).long()[None]
   rel=torch.tensor(np.round(positions/max(1,segments-1)*127)).long()[None];absolute=torch.tensor(np.minimum(positions,128)).long()[None]
   length=torch.full((1,end-begin),int(np.argmin(abs(TOTAL_LEN_BIN-segments))),dtype=torch.long)
   with torch.inference_mode():pitch,dur=model.inference(mix[None],prog,None,length,absolute,rel,.25,.05,6)
   grid=torch.cat([pitch.argmax(-1)[...,None],dur.argmax(-1)],dim=-1)
   _,count,voices,steps,maxnotes,dim=grid.shape;grid=grid.permute(0,2,1,3,4,5).reshape(1,voices,-1,maxnotes,dim)[0].numpy()
   for track,g in zip(tracks,grid):
    roll=grid2pr(g)
    for step,pitch in zip(*np.nonzero(roll)):
     beat=begin*8+step/4
     if beat>=total:continue
     duration=min(float(roll[step,pitch])/4,total-beat)
     track.notes.append(pretty_midi.Note(65,int(pitch),beat*60/tempo,(beat+duration)*60/tempo))
   progress(8+65*end/segments,f'配器 {end} / {segments} 段')
  midi.instruments.extend(tracks);models.append('Structured Arrangement');del model
 if params['drums']:
  progress(76,'生成鼓伴奏');repo=ROOT/'.sites-runtime/GrooveTransformer';sys.path.insert(0,str(repo))
  from model.Base.BasicGrooveTransformer import GrooveTransformerEncoder
  saved=torch.load(repo/'model/Base/saved/monotonic_groove_transformer_v1/latest/hopeful_gorge_252.pth',map_location='cpu',weights_only=True)
  model=GrooveTransformerEncoder(**{**saved['params'],'device':'cpu'});model.load_state_dict(saved['model_state_dict']);model.eval()
  drums=pretty_midi.Instrument(0,is_drum=True,name='Drums');pitches=[36,38,42,46,43,47,50,49,51]
  # The 27 input channels are [hits, velocity, offset] over 9 voices, so a voice
  # owns indices voice, 9+voice and 18+voice. Offsets stay on the grid: this is
  # an accompaniment for practice, not a humanisable take.
  bar_count=max(1,math.ceil(total/4))
  onsets={}
  for e in score['events']:
   for note in e['notes']:
    if note.get('percussion'):continue
    index=int(math.floor(e['beat']+1e-6));onsets[index]=onsets.get(index,0)+1
  density=[sum(onsets.get(bar*4+step,0) for step in range(4)) for bar in range(bar_count)]
  # Four-bar phrases: the opening bar pushes, the closing bar relaxes, so the
  # groove breathes with the melody instead of repeating one two-bar cell.
  phrase_weight=(1.0,.9,.86,.72)
  weights={bar:phrase_weight[bar%4] for bar in range(bar_count) if density[bar]}
  for segment in range(segments):
   checkpoint()
   x=torch.zeros(1,32,27);active=False
   for bar in range(segment*2,min(bar_count,segment*2+2)):
    if not density[bar]:continue
    # A bar of 4/4 spans sixteen sixteenth-note steps inside the 32-step window.
    active=True;weight=weights[bar];base=(bar*4-segment*8)*4
    dense=density[bar]>=6
    def anchor(offset,voice,velocity):
     step=base+offset
     if not 0<=step<32:return
     x[0,step,voice]=1;x[0,step,9+voice]=max(float(x[0,step,9+voice]),velocity)
    # Kick anchors the bar line; the mid-bar kick only appears in busier bars.
    anchor(0,0,.9*weight)
    if dense:anchor(8,0,.68*weight)
    # Backbeat, but only where the piano actually plays into the bar. Toms and
    # crashes are deliberately NOT conditioned here: the Groove Transformer is
    # trained on kick/snare/hat grooves and returned essentially no toms, so a
    # modelled fill never arrived. The phrase pass further down places them.
    if density[bar]>=2:
     anchor(4,1,.78*weight);anchor(12,1,.78*weight)
    # Hi-hat subdivision follows local note density: a quarter-note pulse in
    # sparse bars, eighth notes where the writing is busy.
    for offset in range(0,16,2 if dense else 4):
     anchor(offset,2,1.0*weight if offset==0 else .58*weight)
   if not active or not x[0,:,2].any():continue
   with torch.inference_mode():h,v,o=model(x);h=h.sigmoid()[0];v=v[0];o=o[0]
   caps=[3,3,16,3,4,4,4,2,2]
   for voice,pitch in enumerate(pitches):
    previous=-9.0
    for step in sorted(torch.topk(h[:,voice],caps[voice]).indices.tolist()):
     if h[step,voice]<.45:continue
     # Preserve the sixteenth-note grid; model offsets must not move the pulse.
     beat=segment*8+step/4
     if beat>=total or beat-previous<.2:continue
     previous=beat
     velocity=max(24,min(110,round(float(v[step,voice])*110*weights.get(int(beat//4),1.0))))
     drums.notes.append(pretty_midi.Note(velocity,pitch,beat*60/tempo,(beat+.2)*60/tempo))
   progress(76+15*(segment+1)/segments,f'鼓伴奏 {segment+1} / {segments} 段')
  # Phrase gestures are written directly rather than left to the model: a crash
  # opens every four-bar phrase and the phrase's last bar ends on a tom run, so
  # the accompaniment has the fills that a drummer would actually play.
  beat_of=lambda note:note.start*tempo/60
  fill_bars=sorted(bar for bar in range(3,bar_count,4) if density[bar]>=3 and (bar+1)*4<=total)
  for bar in fill_bars:
   start=bar*4+3
   drums.notes=[note for note in drums.notes if not (note.pitch in (42,44,46) and start-.01<=beat_of(note)<start+1)]
  def gesture(pitch,beat,velocity,length=.4):
   if not 0<=beat<total:return
   drums.notes.append(pretty_midi.Note(max(28,min(120,int(round(velocity)))),pitch,beat*60/tempo,(beat+length)*60/tempo))
  for bar in range(0,bar_count,4):
   if bar>=bar_count or not density[bar]:continue
   gesture(49,bar*4,96*weights[bar],2)
  for bar in fill_bars:
   base=bar*4+3;weight=weights[bar]*.9
   for offset,pitch,velocity in ((0,47,62),(.25,50,68),(.5,43,74),(.75,38,82)):
    gesture(pitch,base+offset,velocity*weight,.25)
  # Metrical postprocessing handles empty model proposals.
  midi.instruments.append(drums);models.append('Groove Transformer')
 total=max(b['start']+b['length'] for b in bars)
 companions=[]
 for track in midi.instruments:
  for n in track.notes:
   n.start=warp(n.start*tempo/60,bars)*60/tempo
   n.end=max(n.start+.01,warp(n.end*tempo/60,bars)*60/tempo)
  proposals=[{'midi':n.pitch,'beat':n.start*tempo/60} for n in track.notes]
  if track.is_drum:
   planned=drum_pattern(original_score,bars)
   # The model colours dynamics; the metre, backbeat and fills remain authoritative.
   for hit in planned:
    velocities=[n.velocity for n in track.notes if n.pitch==hit['midi']]
    colour=sum(velocities)/len(velocities)/65 if velocities else 1
    hit['velocity']=round(hit['velocity']*max(.85,min(1.15,.8+.2*colour)))
  elif track is not source:
   planned=voice_leading(original_score,bars,proposals,track.program,companions)
   companions.extend(planned)
  else:continue
  track.name='鼓' if track.is_drum else PROGRAMS.get(track.program,track.name)
  track.notes=[pretty_midi.Note(n['velocity'],n['midi'],n['beat']*60/tempo,(n['beat']+n['duration'])*60/tempo) for n in planned]
 midi.time_signature_changes=[];previous=None
 for bar in bars:
  signature=(bar['beats'],bar['unit'])
  if signature!=previous:midi.time_signature_changes.append(pretty_midi.TimeSignature(*signature,bar['start']*60/tempo));previous=signature
 progress(93,'保存分声部总谱')
 names=[t.name for t in midi.instruments]
 for track in midi.instruments:track.name='Drums' if track.is_drum else pretty_midi.program_to_instrument_name(track.program)
 midi.write(str(Path(target).with_suffix('.mid')))
 for track,name in zip(midi.instruments,names):track.name=name
 write_notation(source_xml,midi.instruments,bars,tempo,Path(target).with_suffix('.musicxml'),data.get('title'))
 tracks=[{'name':t.name,'program':t.program,'drums':t.is_drum,'notes':[{'midi':n.pitch,'beat':n.start*tempo/60,'duration':(n.end-n.start)*tempo/60,'velocity':n.velocity/127} for n in t.notes]} for t in midi.instruments]
 write_json(Path(target),{'models':models,'title':data.get('title'),'tempo':tempo,'tracks':tracks,'params':params,'totalBeats':total})
 progress(100,'总谱已保存')

if __name__=='__main__':generate(sys.argv[1],sys.argv[2])
