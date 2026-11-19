import json
from pathlib import Path
import numpy as np
from PIL import Image
folder=Path('dist/assets/arrival')
result=[]
for name in ['yiyuan','zhuozhengyuan']:
    meta=json.loads((folder/(name+'-outline.json')).read_text())
    mask=np.array(Image.open(folder/(name+'-outline.png')))>127
    rows=[]
    for row in mask:
        points=np.flatnonzero(row)
        rows.append([int(points[0]),int(points[-1])] if len(points) else None)
    result.append({'name':name,'origin':meta['origin'],'cell':meta['cell'],'floor':meta['floor'],'rows':rows})
(folder/'garden-terrain-clearance.json').write_text(json.dumps(result,separators=(',',':')))
print('Garden terrain height bands:',len(result))
