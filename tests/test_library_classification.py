import json
import tempfile
import unittest
from pathlib import Path
from unittest.mock import Mock,patch
import library_classification as classification


class ClassificationRecovery(unittest.TestCase):
    def test_supported_response_encodings_preserve_chinese(self):
        payload={'categories':{'score1':'流行歌曲'}}
        plain=json.dumps(payload,ensure_ascii=False)
        for text in (plain,'```json\n'+plain+'\n```',plain.replace('"','\\"'),json.dumps(plain),str(payload)):
            with self.subTest(text=text):
                self.assertEqual(classification.parse_categories(text),payload['categories'])

    def test_invalid_results_are_not_executed(self):
        for text in ('[]','{"categories":[]}',"__import__('os').getcwd()"):
            with self.assertRaises(ValueError):classification.parse_categories(text)

    def test_escaped_batch_is_classified_and_cached(self):
        with tempfile.TemporaryDirectory() as folder,patch.object(classification,'STORE',Path(folder)/'categories.json'):
            response=Mock();response.json.return_value={'choices':[{'message':{'content':r'{\"categories\":{\"score1\":\"流行歌曲\",\"score2\":\"古典作品\"}}'}}]}
            result=classification.classify([{'id':'one','title':'说好不哭'},{'id':'two','title':'致爱丽丝'}],request=Mock(return_value=response),force=True)
            self.assertEqual(result['categories'],{'one':'流行歌曲','two':'古典作品'})
            self.assertEqual(result['warning'],'')
            self.assertEqual(json.loads(classification.STORE.read_text(encoding='utf-8'))['two']['category'],'古典作品')


if __name__=='__main__':unittest.main()
