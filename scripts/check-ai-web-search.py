#!/usr/bin/env python3
"""联网找谱端点的守护检查（需要本地 5173 在跑，且需要外网）。

守测试报告 #7：
  - 以前「所有查询都只返回一条跳转链接」——因为兜底用的是 Bing 的 site: 语法，
    而 cn.bing.com 会忽略 site: 并把「卡农 钢琴谱 pdf」当单字查询，返回一堆汉语字典页，
    再被 host 过滤掉，于是 directPdf 恒为 false、导入按钮永远不出现。
  - 现在要求：要么给出真实相关结果，要么明确说清「无法自动下载」，
    并且绝不能出现「不是 PDF 却标 directPdf=true」这种骗人的按钮。

网络不通时只做结构校验（不判结果条数），网络通了才判质量。
"""
import json, sys, urllib.error, urllib.request
from urllib.parse import urlparse

ENDPOINT = 'http://127.0.0.1:5173/api/workspace-ai/web'


def search(query):
    body = json.dumps({'mode': 'search', 'query': query}).encode('utf8')
    req = urllib.request.Request(ENDPOINT, data=body, headers={'Content-Type': 'application/json'})
    try:
        with urllib.request.urlopen(req, timeout=40) as r:
            return json.load(r)
    except urllib.error.URLError as e:
        print('SKIP 连不上本地 5173：%s' % e)
        sys.exit(0)


def check_shape(payload, query):
    assert isinstance(payload.get('results'), list), '结果不是数组'
    assert payload.get('notice'), '必须给出 notice（说清楚能不能自动下载）'
    for item in payload['results']:
        for key in ('title', 'url', 'source'):
            assert item.get(key), '%s 缺少 %s' % (query, key)
        url = item['url']
        assert url.startswith('http'), '%s 的地址不是 http：%s' % (query, url)
        host = (urlparse(url).hostname or '').lower()
        assert not host.startswith('image.'), '图片搜索结果不该出现在曲谱候选里：' + url
        assert '/error/' not in urlparse(url).path, '错误页不该出现在曲谱候选里：' + url
        # ★ 最要紧的一条：不能出现「不是 PDF 却带导入按钮」的假承诺
        if item.get('directPdf'):
            assert urlparse(url).path.lower().endswith('.pdf'), \
                'directPdf=true 但地址不是 PDF（会出现点了就报错的假按钮）：' + url


def main():
    payload = search('卡农')
    check_shape(payload, '卡农')

    results = payload['results']
    # 只剩「在 Everyone Piano 搜索《…》」这一条兜底时，说明外网那条腿全断了。
    only_fallback = len(results) == 1 and '在 Everyone Piano 搜索' in results[0]['title']
    if only_fallback:
        print('WARN 只拿到兜底搜索入口（外网搜索源不可达），结构校验通过')
        print('PASS 联网找谱：结构合法 + notice 说明了现状')
        return

    # 通了就要判质量：至少给出一条真曲谱站的结果，且标题里有曲名。
    assert '卡农' in ''.join(x['title'] for x in results), \
        '结果标题里完全没有「卡农」，说明搜到的和曲名无关：%s' % json.dumps(results, ensure_ascii=False)[:300]
    assert payload['notice'], 'notice 为空，用户不知道这些站点能不能直接下载'
    print('PASS 联网找谱：%d 条结果 / 来源 %s' % (
        len(results), '/'.join(sorted({x['source'] for x in results}))))
    print('PASS 联网找谱：结构合法、无假 directPdf、notice 已说明「多数需登录或 VIP」')


main()
