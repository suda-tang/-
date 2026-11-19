from pathlib import Path
import re

root = Path(__file__).resolve().parent
source = root / 'build_documents.py'
namespace = {'__file__': str(source)}
exec(source.read_text(encoding='utf-8').split("for name in ['博士申请主稿'")[0], namespace)
text = (root / '项目技术与研究说明.md').read_text(encoding='utf-8')
numbers = [int(n) for n in re.findall(r'^### (\d+) ', text, re.M)]
assert numbers == list(range(1,55)), numbers
assert 'undefined' not in text
namespace['build']('项目技术与研究说明')
from docx import Document
output = root / '项目技术与研究说明.docx'
document = Document(output)
for paragraph in document.paragraphs:
    if paragraph.text == '技术来源与复核说明':
        paragraph.paragraph_format.page_break_before = True
document.save(output)
print('Numbered modules:',len(numbers),'characters:',len(text),'subsections:',len(re.findall(r'^#### ',text,re.M)))
