from pathlib import Path
import numpy as np
from PIL import Image
from scipy.ndimage import binary_erosion
folder=Path('dist/assets/arrival')
for name in ['yiyuan','zhuozhengyuan']:
    mask=np.array(Image.open(folder/(name+'-outline.png')))>127
    # The architectural outline includes the perimeter wall and its outer apron.
    # Pull back the ground-only mask; the shader retains standing wall faces.
    inset=binary_erosion(mask,iterations=5)
    Image.fromarray(np.uint8(inset)*255).save(folder/(name+'-base-outline.png'))
    Image.fromarray(np.uint8(binary_erosion(mask,iterations=12))*255).save(folder/(name+'-wall-outline.png'))
    print(name,'removed exterior base cells',int(mask.sum()-inset.sum()))
