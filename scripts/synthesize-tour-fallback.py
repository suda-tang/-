"""Isolated fallback worker. Input via stdin avoids putting lesson text in process arguments."""
import json,sys
from gtts import gTTS

data=json.load(sys.stdin)
languages={'zh':'zh-CN','zh-Hant':'zh-TW','yue':'yue'}
gTTS(data['text'],lang=languages.get(data['locale'],data['locale']),timeout=(8,20)).save(data['target'])
