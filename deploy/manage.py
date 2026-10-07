"""Portable setup/start/health checks. Private browser profiles stay on this machine."""
import argparse, json, os, pathlib, socket, subprocess, sys, urllib.request, venv
ROOT = pathlib.Path(__file__).resolve().parents[1]
STATE = ROOT / '.sites-runtime' / 'deployment'
ENV = STATE / 'env'
PY = ENV / ('Scripts/python.exe' if os.name == 'nt' else 'bin/python')
DS = ROOT / 'services' / 'suda-ds'

def run(args, **kw):
    subprocess.run([str(x) for x in args], check=True, cwd=ROOT, **kw)

def alive(port):
    try:
        with socket.create_connection(('127.0.0.1', port), timeout=1): return True
    except OSError: return False

def environment():
    env = os.environ.copy()
    env.update(PYTHONUTF8='1', PYTHONIOENCODING='utf-8', PIANO_AUTORELOAD='0')
    config = ROOT / 'deploy' / 'local.json'
    if config.exists():
        values = json.loads(config.read_text(encoding='utf-8-sig'))
        env.update({str(k): str(v).replace('{service_dir}', str(DS)) for k, v in values.items()})
    return env

def setup(omr):
    STATE.mkdir(parents=True, exist_ok=True)
    if not PY.exists(): venv.create(ENV, with_pip=True)
    run([PY, '-m', 'pip', 'install', '-r', ROOT/'deploy/requirements-lock.txt'])
    run([PY, '-m', 'playwright', 'install', 'chromium'])
    if omr:
        env = environment()
        env['PATH'] = str(PY.parent) + os.pathsep + env.get('PATH', '')
        run(['powershell', '-NoProfile', '-ExecutionPolicy', 'Bypass', '-File', ROOT/'scripts/setup-omr.ps1'], env=env)
    print('Installation complete. Run: python deploy/manage.py start')

def start():
    if not PY.exists(): raise SystemExit('Run python deploy/manage.py setup --omr first.')
    STATE.mkdir(parents=True, exist_ok=True)
    env = environment()
    for name, port, args in [('suda-ds',8765,[DS/'launcher.py']), ('piano',5173,[ROOT/'server.py'])]:
        if alive(port):
            print(f'{name}: port {port} is already in use; existing service was left running.')
            continue
        with (STATE/f'{name}.log').open('ab') as log:
            flags = subprocess.CREATE_NO_WINDOW if os.name == 'nt' else 0
            child = subprocess.Popen([str(PY), *map(str,args)], cwd=ROOT, env=env,
                                     stdout=log, stderr=subprocess.STDOUT, creationflags=flags)
        print(f'{name}: started PID {child.pid}; log: {STATE/name}.log')
    print('Open http://127.0.0.1:5173/ ; complete university authentication in the browser window.')

def doctor():
    print('Deployment Python:', PY, 'OK' if PY.exists() else 'NOT INSTALLED')
    for port, route in [(5173,'/'), (8765,'/health')]:
        try:
            opener = urllib.request.build_opener(urllib.request.ProxyHandler({}))
            with opener.open(f'http://127.0.0.1:{port}{route}', timeout=5) as response:
                print(f'Port {port}: HTTP {response.status}')
        except Exception as exc: print(f'Port {port}: {exc}')
    print('HTTP availability alone does not confirm university authentication or model readiness.')
    print('Optional large models use their own installers; see deploy/README.md.')

if __name__ == '__main__':
    parser = argparse.ArgumentParser()
    parser.add_argument('command', choices=['setup','start','doctor'])
    parser.add_argument('--omr', action='store_true')
    args = parser.parse_args()
    if args.command == 'setup': setup(args.omr)
    elif args.command == 'start': start()
    else: doctor()
