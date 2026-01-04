import yaml,sys,re
p='c:/Users/asus/AutoPromte/AutoPromote/.github/workflows/functions-emulator-smoke.yml'
try:
    with open(p,'r',encoding='utf-8') as f:
        text=f.read()
    data=yaml.safe_load(text)
    print('YAML parsed OK. Top keys:', list(data.keys()))
    # Basic checks
    jobs=data.get('jobs',{})
    if not jobs:
        print('ERROR: no jobs defined')
        sys.exit(1)
    if 'smoke-tests' not in jobs:
        print('ERROR: job smoke-tests missing')
        sys.exit(1)
    steps=jobs['smoke-tests'].get('steps',[])
    print('Found',len(steps),'steps')
    # Look for dangerous shell usage of secrets
    problems=[]
    for i,s in enumerate(steps,1):
        name=s.get('name','(unnamed)')
        if 'run' in s:
            run=s['run']
            if re.search(r'\[\s*-n\s+"\$\{\{\s*secrets\.', run):
                problems.append((i,name,'shell -n test with secret'))
            if re.search(r'echo\s+"\$\{\{\s*secrets\.', run):
                problems.append((i,name,'echo secret directly'))
    if problems:
        print('Suspicious run contents found:')
        for p in problems:
            print(' step',p[0],p[1],p[2])
    else:
        print('No suspicious secret uses found')
    # Validate step-level if expressions syntax roughly
    for i,s in enumerate(steps,1):
        if 'if' in s:
            expr=s['if']
            if not isinstance(expr,str):
                print(' step',i,s.get('name','(unnamed)'),"has non-string if expression")
            # Basic sanity
            if len(expr.strip())==0:
                print(' step',i,s.get('name','(unnamed)'),"has empty if expression")
    print('Validation complete')
except Exception as e:
    print('YAML parse/analysis error:',e)
    sys.exit(2)
