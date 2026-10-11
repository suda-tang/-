"""Small, allowlisted practice proposals; applying them remains a user action."""
import json


def bind_generated_practice_plan(value, context):
    """Bind fresh model output to its request snapshot, never a later live score.

    Model-authored identifiers are not concurrency tokens. Existing/saved plans
    must still go through validate_practice_plan without rebinding.
    """
    if isinstance(value, str):
        value = json.loads(value)
    if not isinstance(value, dict):
        raise ValueError('练习建议格式不完整')
    value = {**value, 'scoreVersion': context.get('practiceVersion')}
    numbers = sorted({int(n) for n in context.get('measureNumbers', []) if str(n).isdigit()})
    if numbers and isinstance(value.get('steps'), list):
        steps = []
        for original in value['steps']:
            if not isinstance(original, dict):
                continue
            step = dict(original)
            for key in ('start', 'end', 'bpm', 'rounds'):
                if isinstance(step.get(key), str) and step[key].strip().isdigit():
                    step[key] = int(step[key])
            start, end = step.get('start'), step.get('end')
            if type(start) is int and type(end) is int and start <= end:
                available = [n for n in numbers if start <= n <= end]
                if not available:
                    continue
                step['start'], step['end'] = available[0], available[-1]
            steps.append(step)
        value['steps'] = steps
    return validate_practice_plan(value, context)


def fallback_practice_plan(context):
    numbers = sorted({n for n in context.get('measureNumbers', []) if type(n) is int})
    if not numbers:
        raise ValueError('请先打开一首可练习的曲谱')
    tempo = context.get('practiceTempo') or 60
    try:tempo = max(30, min(120, round(float(tempo)*.75)))
    except (ValueError, TypeError):tempo = 60
    return validate_practice_plan({'scoreVersion': context['practiceVersion'], 'goal': '先练一小段，再按实际情况调整',
        'steps': [{'start': numbers[0], 'end': numbers[min(3,len(numbers)-1)], 'bpm': tempo, 'rounds': 3,
                   'method': '先核对这一段的音高和节奏，再慢速连起来。', 'criterion': '完整练三遍，听一听有没有停顿。'}]}, context)


def validate_practice_plan(value, context):
    if isinstance(value, str):
        value = json.loads(value)
    if not isinstance(value, dict) or set(value) - {'scoreVersion', 'goal', 'steps'}:
        raise ValueError('练习建议包含不支持的设置')
    if not context.get('practiceVersion') or value.get('scoreVersion') != context['practiceVersion']:
        raise ValueError('曲谱版本已变化，请基于当前谱面重新生成建议')
    goal, steps = value.get('goal'), value.get('steps')
    if not isinstance(goal, str) or not goal.strip() or len(goal) > 160 or not isinstance(steps, list) or not 1 <= len(steps) <= 6:
        raise ValueError('练习建议需要目标和 1–6 个段落')
    numbers = [n for n in context.get('measureNumbers', []) if type(n) is int]
    if not numbers:
        raise ValueError('没有可跟弹的谱面数据')
    for step in steps:
        if not isinstance(step, dict) or set(step) - {'start', 'end', 'bpm', 'rounds', 'method', 'criterion'}:
            raise ValueError('练习段落包含不支持的设置')
        start, end = step.get('start'), step.get('end')
        if type(start) is not int or type(end) is not int or not min(numbers) <= start <= end <= max(numbers) or not any(start <= n <= end for n in numbers):
            raise ValueError('练习小节范围与当前谱面不符')
        if type(step.get('bpm')) is not int or not 30 <= step['bpm'] <= 240 or type(step.get('rounds')) is not int or not 1 <= step['rounds'] <= 10:
            raise ValueError('练习速度或遍数无效')
        if any(not isinstance(step.get(k), str) or not step[k].strip() or len(step[k]) > 400 for k in ('method', 'criterion')):
            raise ValueError('每段需要具体练法和检查点')
    return value


PRACTICE_GUIDANCE = '''
跟弹练习支持 practice_plan 动作，value 为 JSON 对象：{"goal":"具体目标","steps":[{"start":1,"end":4,"bpm":60,"rounds":3,"method":"具体练法","criterion":"由演奏者或教师核对的检查点"}]}。曲谱版本由程序绑定到本次请求的谱面，不需要生成 scoreVersion。
用户明确要求练习计划、分段跟弹建议，或 context.practiceRequest 为真时，应提供这个动作，把建议送到现有跟弹区域供确认，不能只写一段无法应用的散文。其他问题不要强加计划。
只能根据 context.measureNumbers 和 scoreEvidence 选择实际小节，1–6 段，每段速度30–240、遍数1–10。不要虚构指法、学生错误或学习成果。检查点不等于自动评分；柔和音色、放松、连奏等须本人或教师核对。
practice_plan 仅为待确认建议，尚未改变控件。reply 简短说明已提供待确认建议，不要声称已应用。不得同时用 set_tempo、seek_measure、play、open 等动作绕过用户确认；绝不自动开启麦克风。
若无 practiceVersion 或无实际小节数据，说明需要先载入可演奏曲谱，不得编造方案。不要把 sourceVersion 当作曲谱标题或云曲库id。
'''
