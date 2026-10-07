"""Normalize bound vocal files to a browser-compatible audio stream."""
import os, shutil, subprocess, tempfile
from pathlib import Path

FORMATS={'.mp3','.wav','.wave','.m4a','.aac','.flac','.ogg','.oga','.opus','.wma','.aif','.aiff','.caf','.amr','.webm','.mp4','.mov','.mkv','.3gp'}

def normalize(body,name,mime):
    suffix=Path(name).suffix.lower()
    if suffix not in FORMATS and not mime.startswith(('audio/','video/')):
        raise ValueError('不支持此文件类型，请选择音频或包含演唱音轨的视频')
    executable=shutil.which('ffmpeg')
    if not executable:
        try:
            import imageio_ffmpeg
            executable=imageio_ffmpeg.get_ffmpeg_exe()
        except (ImportError,RuntimeError):
            raise ValueError('服务端缺少 FFmpeg，无法转换此音频格式')
    with tempfile.TemporaryDirectory(prefix='vocal-') as folder:
        source=Path(folder)/('source'+suffix);output=Path(folder)/'vocal.mp3'
        source.write_bytes(body)
        try:
            result=subprocess.run([executable,'-hide_banner','-v','error','-nostdin','-y','-i',str(source),'-map','0:a:0','-vn','-ac','2','-ar','44100','-c:a','libmp3lame','-b:a','192k','-threads','2',str(output)],capture_output=True,timeout=180,creationflags=0x08000000 if os.name=='nt' else 0)
        except subprocess.TimeoutExpired:
            raise ValueError('音频格式转换超过 3 分钟，请裁剪录音后重试')
        if result.returncode or not output.exists() or output.stat().st_size<100:
            detail=result.stderr.decode('utf-8',errors='replace').strip()[-700:]
            raise ValueError('音频转换失败，文件可能损坏、加密或不含音轨。解码详情：'+detail)
        return output.read_bytes(),'audio/mpeg'
