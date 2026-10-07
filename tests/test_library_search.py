import unittest
from unittest.mock import Mock
from library_classification import search_scores, SEARCH_CACHE

class LibrarySearchTests(unittest.TestCase):
    def setUp(self): SEARCH_CACHE.clear()

    def test_normal_library_uses_one_request(self):
        items = [{'id': str(i), 'title': f'Song {i}'} for i in range(1, 126)]
        response = Mock()
        response.json.return_value = {'choices': [{'message': {'content': '{"matches":["score125"]}'}}]}
        request = Mock(return_value=response)
        self.assertEqual(search_scores('lyrical piano pieces', items, request=request)['ids'], ['125'])
        self.assertEqual(request.call_count, 1)
        search_scores('lyrical piano pieces', items, request=request)
        self.assertEqual(request.call_count, 1)

    def test_title_does_not_wait_for_model(self):
        request = Mock(side_effect=AssertionError('unexpected model request'))
        self.assertEqual(search_scores('Moon', [{'id':'1','title':'Moon River'}], request=request)['ids'], ['1'])

if __name__ == '__main__': unittest.main()
