import psutil
for p in psutil.process_iter(['pid','ppid','name','cmdline','memory_info']):
 try:
  args=p.info['cmdline']or[];text=' '.join(args)
  if 'check-mentor-route-'in text or '--headless' in text:
   print(p.pid,p.info['ppid'],p.info['name'],round(p.info['memory_info'].rss/1024**2),text[:450],flush=True)
 except(psutil.NoSuchProcess,psutil.AccessDenied):pass
