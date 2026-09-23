import tempfile,unittest
from pathlib import Path
from unittest.mock import patch
import background_jobs as jobs

class PriorityTests(unittest.TestCase):
 def test_priority_persists_without_interrupting_current_job(self):
  with tempfile.TemporaryDirectory() as directory,patch.object(jobs,'DB',Path(directory)/'queue.db'):
   first=jobs.enqueue('a','arrangement','test',priority=0)
   second=jobs.enqueue('b','arrangement','test',priority=20)
   running=jobs.enqueue('c','expression','test');jobs.update(running,status='running',progress=37)
   jobs.prioritize(second)
   with jobs.connection() as db:
    self.assertEqual(db.execute("SELECT id FROM jobs WHERE status='queued' ORDER BY priority,created").fetchone()[0],second)
    self.assertEqual(db.execute('SELECT progress FROM jobs WHERE id=?',(running,)).fetchone()[0],37)
   with self.assertRaises(ValueError):jobs.prioritize(running)
   with self.assertRaises(ValueError):jobs.prioritize('missing')
   jobs.update(first,status='failed');jobs.prioritize(first)
   with jobs.connection() as db:
    row=db.execute('SELECT status,priority FROM jobs WHERE id=?',(first,)).fetchone()
    self.assertEqual(row['status'],'queued')
    self.assertLess(row['priority'],db.execute('SELECT priority FROM jobs WHERE id=?',(second,)).fetchone()[0])
