"""Grounded workspace capabilities; no model-controlled arbitrary UI or file writes."""
import json
from arrangement_music import PROGRAMS, PRESETS


def arrangement_config(value):
    if isinstance(value, str):
        try:
            value = json.loads(value)
        except (ValueError, TypeError):
            raise ValueError('配器参数需要包含编制、乐器和鼓声部，尚未执行')
    if not isinstance(value, dict) or set(value) - {'style', 'programs', 'drums'}:
        raise ValueError('配器参数无效，尚未执行')
    style = value.get('style')
    if style not in {*PRESETS, 'custom'}:
        raise ValueError('没有这个编制，尚未执行')
    if not isinstance(value.get('drums'), bool):
        raise ValueError('请明确是否加入鼓声部，尚未执行')
    programs = value.get('programs', [])
    if not isinstance(programs, list) or any(type(p) is not int or p not in PROGRAMS for p in programs):
        raise ValueError('包含不支持的乐器，尚未执行')
    if len(programs) != len(set(programs)):
        raise ValueError('同一乐器不能重复选择，尚未执行')
    if style == 'custom' and not 1 <= len(programs) <= 8:
        raise ValueError('自选编制需要 1–8 种受支持的乐器，尚未执行')
    if style != 'custom' and programs:
        raise ValueError('预设编制不能夹带自选乐器，尚未执行')
    return {'style': style, 'programs': programs, 'drums': value['drums'] or style == 'original'}


WORKSPACE_GUIDANCE = '''
沿用当前工作区的实际能力，不创造新页面或虚构工具。回答直接说明结果与依据，不写宣传口号。
context.panel 是当前四面板之一；context.scoreSource 标明正在看的原谱还是改编谱。
context.scoreEvidence 来自当前实际载入谱面的逐小节和逐声部统计，改编谱必须以此为准，不能拿原谱档案冒充改编结果。密集音符、短时值和音域只能作为练习选段线索，不自动等于难度、单手跨度或错误。没有事件的休止小节也可能存在。
context.currentMeasureEvents 是当前小节实际音符。只能据已提供的谱面与麦克风匹配记录提出练习建议，不能声称听过完整演奏、评判音色/力度/指法或推断学生能力。practice 的平均偏移不能代表稳定性，优先参考 meanAbsoluteOffsetMs、timingSpreadMs 和样本数；模拟记录不算真实练习。关注最需要复核的 1–3 个小节，说明具体怎么练，速度以当前 BPM 为基准。
context.arrangementCapabilities 是界面真正支持的编制与乐器列表。用户指定组合、是否加鼓时，用 configure_arrangement，value 为 JSON 对象 {"style":"custom","programs":[40,42],"drums":false}，编号必须逐字取自 capabilities；预设不带 programs 或给空数组。必须同时保留用户没有要求改变的鼓选项。此动作只设置原有控件，不生成。用户明确要求生成才另发 generate_arrangement；只问建议不改变控件。不能用相似乐器偷偷替代不支持的乐器，先说明限制。
context.tasks 包含最近同步的任务状态、时间及错误。解释排队/失败要引用实际任务标题和阶段，区分已知错误与推测；正在处理不能说失败，尚未同步不能说没有任务。不能编造剩余时间、成功结果、自动重试或已修复。用户要重试时指向原任务的重试按钮，不用生成改编动作代替重试，不替用户选择转录分离策略。
context.settings、settings.arrangementPrograms、settings.drums 为当前真实参数。分析报告也必须结合这些值，换曲后的记录不可套用到新曲。只解释操作含义时不要执行。
'''


def analysis_context(context, score_id):
    """Do not attach the current performance to a different work's analysis."""
    current = str(context.get('currentId') or '') == str(score_id)
    keys = ('settings', 'arrangementCapabilities', 'language')
    result = {k: context.get(k) for k in keys}
    result.update({k: context.get(k) if current else None for k in
                   ('practice', 'measure', 'scoreSource', 'currentMeasureEvents', 'scoreEvidence')})
    return result
