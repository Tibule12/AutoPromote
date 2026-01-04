import yaml, json, sys
p='security/.semgrep.yml'
try:
    with open(p) as f:
        data=yaml.safe_load(f)
    print('Parsed keys:', list(data.keys()))
    print(json.dumps(data, indent=2))
except Exception as e:
    print('Error parsing',p,':',e)
    sys.exit(1)
