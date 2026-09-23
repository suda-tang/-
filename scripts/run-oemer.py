import sys
import numpy as np
# Older Oemer/Scipy releases still reference removed NumPy aliases.
for name, value in {'long': np.int64, 'ulong': np.uint64, 'longlong': np.int64, 'ulonglong': np.uint64, 'bool': np.bool_, 'object': object, 'str': str, 'int': int}.items():
    try: setattr(np, name, value)
    except Exception: pass
from oemer.ete import main
main()
