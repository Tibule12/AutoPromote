"""Exercise the real admission functions without importing model/cloud runtimes."""
import ast
import asyncio
import pathlib
import unittest

class HttpError(Exception):
    def __init__(self, status_code, detail):
        self.status_code = status_code
        self.detail = detail

class Background:
    def add_task(self, *_args, **_kwargs):
        raise AssertionError("Retired request dispatched work")

class ProductRetirement(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        tree = ast.parse(pathlib.Path(__file__).with_name("main_media_server.py").read_text())
        nodes = [n for n in tree.body if isinstance(n, ast.AsyncFunctionDef) and n.name in {"retired_idea_video", "auto_generate_clips"}]
        assert len(nodes) == 2
        for node in nodes:
            node.decorator_list = []
        cls.namespace = {"HTTPException": HttpError, "Dict": dict, "Any": object, "BackgroundTasks": Background}
        exec(compile(ast.Module(body=nodes, type_ignores=[]), "real_worker_admission", "exec"), cls.namespace)

    def test_idea_generation_is_gone_before_media_or_model_access(self):
        with self.assertRaises(HttpError) as result:
            asyncio.run(self.namespace["retired_idea_video"]())
        self.assertEqual(result.exception.status_code, 410)

    def test_standalone_promo_cannot_use_the_shared_clip_worker(self):
        for request in [{"job_id": "promo-old-client"}, {"workflow_type": "smart_promo_visual_v1"}, {"workflow_type": "podcast_v1"}, {"workflow_type": "clip_scanner_v1", "output_mode": "visual_edit"}, {"campaign_roles": [{"role": "promo"}]}]:
            with self.subTest(request=request), self.assertRaises(HttpError) as result:
                asyncio.run(self.namespace["auto_generate_clips"](request, Background()))
            self.assertEqual(result.exception.status_code, 410)

    def test_active_clips_still_reach_normal_source_validation(self):
        # Missing source rejects as an ordinary invalid clip request, not a retirement.
        self.namespace["os"] = __import__("os")
        with self.assertRaises(HttpError) as result:
            asyncio.run(self.namespace["auto_generate_clips"]({"workflow_type": "clip_scanner_v1"}, Background()))
        self.assertEqual(result.exception.status_code, 400)

    def test_local_cpu_bounds_keep_render_limits_and_reject_unbounded_analysis(self):
        source = pathlib.Path(__file__).parents[1] / "scripts/monetization/local-worker-execution.py"
        tree = ast.parse(source.read_text())
        first = next(i for i, node in enumerate(tree.body)
                     if isinstance(node, ast.Assign) and any(
                         isinstance(target, ast.Name) and target.id == "cpu_seconds"
                         for target in node.targets))
        last = next(i for i in range(first, len(tree.body))
                    if isinstance(tree.body[i], ast.Expr)
                    and isinstance(tree.body[i].value, ast.Call)
                    and isinstance(tree.body[i].value.func, ast.Attribute)
                    and tree.body[i].value.func.attr == "setrlimit")
        program = compile(ast.Module(body=tree.body[first:last + 1], type_ignores=[]),
                          "actual_local_cpu_admission", "exec")
        class Limits:
            RLIMIT_CPU = 0
            def setrlimit(self, kind, limits):
                self.applied = (kind, limits)
        for record, expected in [
            ({"expected": {"endpoint": "/render-viral-clip"}}, 120),
            ({"expected": {"endpoint": "/analyze-clips"}}, 240),
            ({"expected": {"endpoint": "/analyze-clips"}, "localCpuSeconds": 180}, 180),
        ]:
            limits = Limits()
            exec(program, {"record": record, "resource": limits})
            self.assertEqual(limits.applied, (0, (expected, expected)))
        for record in [
            {"expected": {"endpoint": "/render-viral-clip"}, "localCpuSeconds": 240},
            {"expected": {"endpoint": "/analyze-clips"}, "localCpuSeconds": 301},
            {"expected": {"endpoint": "/analyze-clips"}, "localCpuSeconds": 0},
        ]:
            with self.subTest(record=record), self.assertRaises(RuntimeError):
                exec(program, {"record": record, "resource": Limits()})

if __name__ == "__main__":
    unittest.main()
