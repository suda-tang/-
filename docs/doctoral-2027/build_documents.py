from pathlib import Path
import re
from docx import Document
from docx.shared import Inches, Pt, RGBColor
from docx.oxml import OxmlElement
from docx.oxml.ns import qn
from docx.enum.text import WD_ALIGN_PARAGRAPH
from docx.enum.table import WD_TABLE_ALIGNMENT, WD_CELL_VERTICAL_ALIGNMENT
from docx.opc.constants import RELATIONSHIP_TYPE as RT

ROOT=Path(__file__).resolve().parent

def font(style,size,bold=False,east='宋体'):
    style.font.name='Times New Roman';style.font.size=Pt(size);style.font.bold=bold
    style.font.color.rgb=RGBColor(0,0,0)
    style.element.get_or_add_rPr().get_or_add_rFonts().set(qn('w:eastAsia'),east)

def clean(text):
    text=re.sub(r'\[([^\]]+)\]\(([^)]+)\)',lambda m:m[1]+'（'+m[2]+'）',text)
    text=text.replace('*','').replace('`','')
    text=text.replace(r'\(', '').replace(r'\)', '')
    text=text.replace(r'\(w\)','w')
    text=text.replace('d_m','dₘ').replace('e_i','eᵢ')
    text=text.replace(r'\(t(q)=\int_0^q60/T(x)\,dx\)', 't(q)为从0到q对60/T(x)积分得到的秒数')
    text=text.replace(r't(q)=\int_0^q60/T(x)\,dx','从位置0至q累计每个四分音符所需的60/T(x)秒')
    return text

def heading_text(s):
    return re.sub(r'[^\w\s\u3400-\u9fff]',' ',s).strip()

def body(doc,text):
    p=doc.add_paragraph();pos=0
    for match in re.finditer(r'\[([^\]]+)\]\((https?://[^)]+)\)',text):
        p.add_run(clean(text[pos:match.start()]))
        link=OxmlElement('w:hyperlink');link.set(qn('r:id'),doc.part.relate_to(match[2],RT.HYPERLINK,is_external=True))
        run=OxmlElement('w:r');pr=OxmlElement('w:rPr');col=OxmlElement('w:color');col.set(qn('w:val'),'225577');pr.append(col);run.append(pr)
        txt=OxmlElement('w:t');txt.text=match[1];run.append(txt);link.append(run);p._p.append(link);pos=match.end()
    p.add_run(clean(text[pos:]));return p

def table(doc,lines):
    rows=[[clean(c.strip()) for c in line.strip().strip('|').split('|')] for line in lines]
    rows=[r for r in rows if not all(re.fullmatch(r'[:\- ]+',c) for c in r)]
    t=doc.add_table(rows=0,cols=len(rows[0]));t.alignment=WD_TABLE_ALIGNMENT.CENTER;t.autofit=False
    cols=len(rows[0]); weights=([.6,1.5,1.35,1.5,1.4] if cols==5 else [1]*cols)
    total=sum(weights)
    for c,w in zip(t.columns,weights):c.width=Inches(6.65*w/total)
    for ri,row in enumerate(rows):
        cells=t.add_row().cells
        for ci,value in enumerate(row):
            c=cells[ci];c.width=Inches(6.65*weights[ci]/total);c.vertical_alignment=WD_CELL_VERTICAL_ALIGNMENT.CENTER
            p=c.paragraphs[0];p.paragraph_format.space_after=Pt(3);p.paragraph_format.space_before=Pt(3);p.paragraph_format.line_spacing=1.1
            r=p.add_run(value);r.font.size=Pt(9.5);r.bold=ri==0
            pr=c._tc.get_or_add_tcPr();b=OxmlElement('w:tcBorders')
            for side in ['top','left','bottom','right']:
                el=OxmlElement('w:'+side);el.set(qn('w:val'),'single');el.set(qn('w:sz'),'4');el.set(qn('w:color'),'D9D9D9');b.append(el)
            pr.append(b);mar=OxmlElement('w:tcMar')
            for side in ['top','left','bottom','right']:
                el=OxmlElement('w:'+side);el.set(qn('w:w'),'80');el.set(qn('w:type'),'dxa');mar.append(el)
            pr.append(mar)
            if ri==0:
                sh=OxmlElement('w:shd');sh.set(qn('w:fill'),'E8EDF2');pr.append(sh)
        trpr=t.rows[-1]._tr.get_or_add_trPr()
        if ri==0:trpr.append(OxmlElement('w:tblHeader'))
    doc.add_paragraph().paragraph_format.space_after=Pt(1)

def build(name):
    d=Document();s=d.sections[0]
    s.page_width=Inches(8.5);s.page_height=Inches(11)
    s.left_margin=s.right_margin=Inches(.925);s.top_margin=Inches(.8);s.bottom_margin=Inches(.8)
    s.header_distance=s.footer_distance=Inches(.35)
    font(d.styles['Normal'],11)
    normal=d.styles['Normal'].paragraph_format;normal.line_spacing=1.25;normal.space_after=Pt(6);normal.widow_control=True
    for style,size in [('Title',20),('Heading 1',15),('Heading 2',12.5),('Heading 3',11.5)]:
        font(d.styles[style],size,True,'黑体');pf=d.styles[style].paragraph_format;pf.space_before=Pt(14);pf.space_after=Pt(7);pf.keep_with_next=True
    font(d.styles['Header'],9);font(d.styles['Footer'],9)
    s.header.paragraphs[0].text='唐秋鸣  2027年博士申请研究材料'
    foot=s.footer.paragraphs[0];foot.alignment=WD_ALIGN_PARAGRAPH.CENTER
    fld=OxmlElement('w:fldSimple');fld.set(qn('w:instr'),'PAGE');foot._p.append(fld)
    lines=(ROOT/(name+'.md')).read_text(encoding='utf-8-sig').splitlines();i=0;code=False
    while i<len(lines):
        line=lines[i].strip();i+=1
        if not line or line=='---':continue
        if line.startswith('```'):code=not code;continue
        if line.startswith('|'):
            block=[line]
            while i<len(lines) and lines[i].strip().startswith('|'):block.append(lines[i]);i+=1
            table(d,block);continue
        if line==r'\[':
            equation=[]
            while i<len(lines) and lines[i].strip()!=r'\]':equation.append(lines[i]);i+=1
            i+=1;p=d.add_paragraph();p.alignment=WD_ALIGN_PARAGRAPH.CENTER
            math=OxmlElement('m:oMath');run=OxmlElement('m:r');txt=OxmlElement('m:t');txt.text=clean(' '.join(equation));run.append(txt);math.append(run);p._p.append(math);continue
        if line.startswith('#'):
            level=len(line)-len(line.lstrip('#'));txt=heading_text(clean(line.lstrip('#').strip()))
            d.add_paragraph(txt,style='Title' if level==1 else 'Heading '+str(min(3,level-1)));continue
        p=body(d,line)
        if code:
            p.paragraph_format.line_spacing=1.05;p.paragraph_format.space_after=Pt(3)
            p.paragraph_format.keep_with_next=True
            for r in p.runs:r.font.size=Pt(10)
    for root in [d.styles.element,d.element]:
        for border in list(root.iter(qn('w:pBdr'))):border.getparent().remove(border)
    d.core_properties.author='唐秋鸣';d.core_properties.title=name
    out=ROOT/(name+'.docx');d.save(out);print(out.name)

for name in ['博士申请主稿','项目技术与研究说明','研究论文初稿']:build(name)
