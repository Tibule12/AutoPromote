import yaml, sys
files=['.github/workflows/clip-integration.yml','.github/workflows/functions-emulator-smoke.yml']
ok=True
for f in files:
    try:
        with open(f,'r',encoding='utf8') as fh:
            yaml.safe_load(fh)
        print(f, 'OK')
    except Exception as e:
        ok=False
        print(f, 'ERROR:', e)
if not ok:
    sys.exit(1)
