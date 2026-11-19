"""Persistent CPU neural voice worker; audio stays in pipes/RAM, never on disk."""
import base64,contextlib,json,os,subprocess,sys
from pathlib import Path
os.environ.setdefault('OMP_NUM_THREADS','2')
import numpy as np
import onnxruntime as ort
import imageio_ffmpeg
from kokoro_onnx import Kokoro
from misaki import zh

root=Path(__file__).resolve().parent.parent/'.sites-runtime/voice-models/kokoro'
options=ort.SessionOptions();options.intra_op_num_threads=4;options.inter_op_num_threads=1
with contextlib.redirect_stdout(sys.stderr):
    model=Kokoro.from_session(ort.InferenceSession(str(root/('kokoro-v1.1-zh.onnx' if (root/'kokoro-v1.1-zh.onnx').exists() else 'kokoro-v1.1-zh.int8.onnx')),sess_options=options,providers=['CPUExecutionProvider']),str(root/'voices-v1.1-zh.bin'),vocab_config=str(root/'config.json'))
    g2p=zh.ZHG2P(version='1.1')
voices=model.get_voices()
for line in sys.stdin:
    try:
        data=json.loads(line);role=data.get('role','teacher')
        voice='zf_001' if role=='classroom-teacher' else 'zm_010'
        if voice not in voices:voice=next(v for v in voices if v.startswith('zf_' if role=='classroom-teacher' else 'zm_'))
        with contextlib.redirect_stdout(sys.stderr):
            phonemes,_=g2p(data['text']);samples,rate=model.create(phonemes,voice=voice,speed=1.0,is_phonemes=True)
        encoded=subprocess.run([imageio_ffmpeg.get_ffmpeg_exe(),'-hide_banner','-loglevel','error','-f','f32le','-ar',str(rate),'-ac','1','-i','pipe:0','-f','mp3','-codec:a','libmp3lame','-b:a','96k','pipe:1'],input=np.asarray(samples,dtype='<f4').tobytes(),capture_output=True,timeout=20,creationflags=getattr(subprocess,'CREATE_NO_WINDOW',0))
        if encoded.returncode:raise RuntimeError('语音编码失败')
        print(json.dumps({'audio':base64.b64encode(encoded.stdout).decode(),'voice':voice,'seconds':len(samples)/rate}),flush=True)
    except Exception as error:print(json.dumps({'error':str(error)}),flush=True)
