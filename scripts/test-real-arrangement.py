import json
from pathlib import Path
import arrangement_service,server
p=Path('.sites-runtime/score-cache/031257641a9b44d10b5ace547e0a9818f90dd83408c7e4f84426559c8fe9d254.json')
def report(p,t):
 if int(p)%10==0:print(int(p),t,flush=True)
r=arrangement_service.generate(p.stem,{'style':'chamber','drums':True},report,server)
print(r,flush=True)
print('cached second call',arrangement_service.generate(p.stem,{'style':'chamber','drums':True},report,server),flush=True)
