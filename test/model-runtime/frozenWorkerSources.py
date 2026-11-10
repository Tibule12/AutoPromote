"""Local worker bundles must include their real transitive Python imports.

No model, cloud SDK or worker is executed. This detects a missing helper before
spending inference time in an immutable execution that cannot import it.
"""
import ast
import re
import unittest
from pathlib import Path


ROOT = Path(__file__).resolve().parents[2]


def dependencies(entry):
    pending = [entry]
    found = set()
    while pending:
        name = pending.pop()
        if name in found:
            continue
        file = ROOT / (name.replace('.', '/') + '.py')
        if not file.is_file():
            continue
        found.add(name)
        package = name.split('.')[:-1]
        for node in ast.walk(ast.parse(file.read_text())):
            candidates = []
            if isinstance(node, ast.Import):
                candidates.extend(alias.name for alias in node.names)
            elif isinstance(node, ast.ImportFrom):
                prefix = package[:len(package)-node.level+1] if node.level else []
                module = '.'.join([*prefix, *([node.module] if node.module else [])])
                candidates.append(module)
                candidates.extend(module + '.' + alias.name for alias in node.names)
            pending.extend(candidate for candidate in candidates if candidate.startswith(
                ('model_workers.', 'python_media_worker.')))
    return {name.replace('.', '/') + '.py' for name in found}


def source_list(file, variable):
    match = re.search(r'const\s+' + variable + r'\s*=\s*(\[[^;]+?\]);',
                      (ROOT/file).read_text())
    if not match:
        raise AssertionError('Worker source list could not be inspected')
    return set(ast.literal_eval(match.group(1)))


class FrozenWorkerSources(unittest.TestCase):
    def test_real_cpu_runtime_dependency_closure_is_packaged(self):
        bundled=source_list('src/modelRuntime/localCpuWorker.js','codeFiles')
        self.assertFalse(dependencies('model_workers.local_cpu')-bundled)

    def test_real_emulator_runtime_dependency_closure_is_packaged(self):
        bundled=source_list('src/modelRuntime/emulatorCpuWorker.js','files')
        self.assertFalse(dependencies('model_workers.emulator_cpu')-bundled)

    def test_omitted_post_matte_helper_is_detected_before_inference(self):
        bundled=source_list('src/modelRuntime/emulatorCpuWorker.js','files')
        needed=dependencies('model_workers.emulator_cpu')
        helper='model_workers/adapters/fixed_source_neural.py'
        self.assertIn(helper,needed)
        self.assertEqual(needed-(bundled-{helper}),{helper})


if __name__=='__main__':
    unittest.main()
