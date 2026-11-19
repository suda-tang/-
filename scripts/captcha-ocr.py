"""Isolated CPU OCR worker. Receives an image on stdin; returns JSON only."""
import os,sys,json
os.environ.setdefault('OMP_NUM_THREADS','2')
os.environ.setdefault('OPENBLAS_NUM_THREADS','2')

def main():
 data=sys.stdin.buffer.read(1024*1024+1)
 if len(data)>1024*1024:raise ValueError('验证码图片超过1MB')
 from PIL import Image
 from io import BytesIO
 image=Image.open(BytesIO(data));image.verify()
 image=Image.open(BytesIO(data))
 if image.width>2048 or image.height>2048:raise ValueError('验证码图片尺寸过大')
 import ddddocr
 model=ddddocr.DdddOcr(show_ad=False,use_gpu=False)
 text=str(model.classification(data)).strip()
 print(json.dumps({'text':text},ensure_ascii=True))
if __name__=='__main__':
 try:main()
 except Exception as e:print(json.dumps({'error':str(e)},ensure_ascii=True));sys.exit(1)
