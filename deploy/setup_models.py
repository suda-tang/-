"""Rebuild model Python environments from public version locks (Windows)."""
import argparse, pathlib, subprocess, os
ROOT=pathlib.Path(__file__).resolve().parents[1]
GROUPS={'performance':('3.12','.sites-runtime/performance-env'),
        'avatar':('3.10','.sites-runtime/avatar-env'),
        'cosy':('3.10','.sites-runtime/cosyvoice/venv')}

def setup(group):
 version,folder=GROUPS[group];target=ROOT/folder;python=target/'Scripts/python.exe'
 if not python.exists():
  subprocess.run(['py','-'+version,'-m','venv',str(target)],check=True)
 subprocess.run([str(python),'-m','pip','install','--extra-index-url','https://download.pytorch.org/whl/cpu',
                 '-r',str(ROOT/'deploy'/f'requirements-{group}-lock.txt')],check=True,cwd=ROOT)
 print(group,'environment ready',flush=True)

if __name__=='__main__':
 parser=argparse.ArgumentParser();parser.add_argument('--group',choices=['all',*GROUPS],default='all');args=parser.parse_args()
 for group in (GROUPS if args.group=='all' else [args.group]):setup(group)
