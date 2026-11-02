"""Local scratch-file configuration; no worker/cloud runtime is imported."""
import ast
from pathlib import Path
import pytest


source = Path(__file__).resolve().parents[1] / 'scripts/monetization/local-worker-execution.py'
tree = ast.parse(source.read_text())
scope = {}
exec(compile(ast.Module(body=[n for n in tree.body if isinstance(n, ast.FunctionDef) and n.name in {'local_render_file_ceiling', 'local_render_cpu_ceiling'}], type_ignores=[]), str(source), 'exec'), scope)
ceiling = scope['local_render_file_ceiling']


def test_defaults_are_preserved_and_larger_local_transparency_files_are_explicitly_bounded():
    assert ceiling({}, {}) == 128 * 1024**2
    assert ceiling({'threeDGraphics': [{}]}, {}) == 750 * 1024**2
    assert ceiling({}, {'CREDITS_LOCAL_RENDER_FILE_MIB': '512'}) == 512 * 1024**2
    for invalid in ['127', '751', '-1', '512.5', 'unlimited', '']:
        with pytest.raises(ValueError):
            ceiling({}, {'CREDITS_LOCAL_RENDER_FILE_MIB': invalid})


def test_cpu_defaults_are_preserved_and_larger_local_graphs_require_an_explicit_finite_limit():
    cpu = scope['local_render_cpu_ceiling']
    assert cpu({}, {}) == 600
    assert cpu({'threeDGraphics': [{}]}, {}) == 1200
    assert cpu({}, {'CREDITS_LOCAL_RENDER_CPU_SECONDS': '1200'}) == 1200
    for invalid in ['599', '1201', '-1', '600.5', 'unlimited', '']:
        with pytest.raises(ValueError):
            cpu({}, {'CREDITS_LOCAL_RENDER_CPU_SECONDS': invalid})
