import sys
try:
    import yaml
except Exception as e:
    print('PyYAML missing:', e)
    sys.exit(2)

p = r'c:/Users/asus/AutoPromte/AutoPromote/.github/workflows/deploy.yml'
try:
    with open(p, 'r', encoding='utf8') as f:
        yaml.safe_load(f)
    print('YAML OK')
except Exception as e:
    print('YAML parse error:', e)
    sys.exit(1)
