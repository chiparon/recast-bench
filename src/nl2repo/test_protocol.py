import ast
import io
from pathlib import Path
import tarfile
import tempfile
import unittest
from scoring import baseline, macro_average, score
from skeleton import skeleton
from upstream import extract_prefix


def phases(call="passed", teardown="passed", xfail=None):
    return [{"when": "setup", "outcome": "passed"},
            {"when": "call", "outcome": call, "wasxfail": xfail},
            {"when": "teardown", "outcome": teardown}]


class SkeletonTests(unittest.TestCase):
    def test_no_implementation_or_import_side_effect_survives(self):
        source = '''import answer_package
TABLE = {"answer": 918273}
@decorate(918273)
class API(answer_package.Base):
    @property
    def answer(self, x: int = expensive(918273)) -> int:
        return 918273
def hidden():
    def nested():
        return 918273
    return nested()
async def fetch(x=918273):
    return x
'''
        result = skeleton(source)
        self.assertNotIn("918273", result)
        self.assertNotIn("answer_package", result)
        self.assertNotIn("decorate", result)
        self.assertNotIn("nested", result)
        namespace = {}
        exec(compile(result, "skeleton", "exec"), namespace)
        self.assertIs(namespace["TABLE"], Ellipsis)
        with self.assertRaises(NotImplementedError):
            namespace["API"]().answer()
        self.assertTrue(any(isinstance(n, ast.AsyncFunctionDef) for n in ast.walk(ast.parse(result))))

    def test_conditional_exports_have_no_branch_logic(self):
        result = skeleton("if expensive():\n    def public():\n        return 42\n")
        self.assertIn("def public", result)
        self.assertNotIn("expensive", result)


class ScoringTests(unittest.TestCase):
    def test_collection_failure_does_not_shrink_denominator(self):
        report = {"collected": ["a"], "phases": {"a": phases()}, "collectionErrors": [{"error": "import failed"}]}
        result = score(["a", "b", "c"], report)
        self.assertEqual(result["rate"], 1 / 3)
        self.assertEqual(result["missing"], 2)
        self.assertFalse(result["allPassed"])

    def test_teardown_failure_and_xfail_are_not_passes(self):
        result = score(["a", "b"], {"phases": {"a": phases(teardown="failed"), "b": phases(xfail="known")}})
        self.assertEqual(result["passed"], 0)

    def test_baseline_freezes_only_original_passing_tests(self):
        frozen = baseline({"collected": ["a", "b"], "phases": {"a": phases(), "b": phases("skipped")}, "exitCode": 0})
        self.assertEqual(frozen["expected"], ["a"])
        self.assertEqual(frozen["excluded"], ["b"])

    def test_broken_original_cannot_become_a_baseline(self):
        with self.assertRaises(ValueError):
            baseline({"collected": ["a"], "phases": {"a": phases("failed")}, "exitCode": 1})
        with self.assertRaises(ValueError):
            baseline({"collected": [], "phases": {}, "collectionErrors": ["error"], "exitCode": 2})

    def test_projects_get_equal_weight(self):
        self.assertEqual(macro_average([{"rate": 1, "total": 1}, {"rate": 0, "total": 1000}]), 0.5)


class ArchiveTests(unittest.TestCase):
    def test_source_layer_cannot_escape_target_or_restore_git_history(self):
        with tempfile.TemporaryDirectory() as temp:
            archive, output = Path(temp) / "layer.tar.gz", Path(temp) / "original"
            with tarfile.open(archive, "w:gz") as tar:
                for name in ["project/pkg.py", "project/.git/config"]:
                    info = tarfile.TarInfo(name)
                    info.size = 1
                    tar.addfile(info, io.BytesIO(b"x"))
            self.assertEqual(extract_prefix(archive, "project", output), 1)
            self.assertFalse((output / ".git").exists())
            with tarfile.open(archive, "w:gz") as tar:
                info = tarfile.TarInfo("project/../escaped")
                info.size = 1
                tar.addfile(info, io.BytesIO(b"x"))
            with self.assertRaises(ValueError):
                extract_prefix(archive, "project", output)


if __name__ == "__main__":
    unittest.main()
