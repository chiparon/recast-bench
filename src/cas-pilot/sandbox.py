"""Public runner checks; only the candidate tree and this driver enter Docker."""
from pathlib import Path
import subprocess
import sys
import traceback


def container(image, candidate, driver, *args):
    return ["docker", "run", "--rm", "-i", "--network", "none", "--read-only",
            "--tmpfs", "/tmp", "--pids-limit", "128", "--memory", "2g",
            "--cap-drop", "ALL", "--security-opt", "no-new-privileges", "--user", "65534:65534",
            "-e", "SYMPY_GROUND_TYPES=python", "-v", f"{candidate.resolve()}:/candidate:ro",
            "-v", f"{driver.resolve()}:/bench/src/cas/runner.py:ro", image, "python", "-I", "-B", "-c",
            "import runpy,sys; sys.stdout.reconfigure(encoding='cp1252', errors='backslashreplace'); "
            "sys.argv=sys.argv[1:]; runpy.run_path(sys.argv[0], run_name='__main__')",
            "/bench/src/cas/runner.py", *args]


def public(mode, group):
    root = Path("/candidate")
    if mode == "compile":
        for path in (root / "sympy").rglob("*.py"):
            compile(path.read_bytes(), str(path), "exec")
        return 0
    sys.path.insert(0, str(root))
    import smoke
    import sympy
    assert Path(sympy.__file__).resolve() == root / "sympy/__init__.py"
    failed = 0
    for name in ([group] if group else list(smoke.CHECKS)):
        try:
            assert smoke.CHECKS[name](sympy, sympy.Symbol("x"))
            print(name, "PASS")
        except Exception:
            failed += 1
            print(name, "FAIL", traceback.format_exc(limit=-4))
    return int(bool(failed))


if __name__ == "__main__":
    if sys.argv[1] == "--inside":
        sys.exit(public(sys.argv[2], next(iter(sys.argv[3:]), None)))
    image, *selection = sys.argv[1:]
    sys.exit(subprocess.run(container(image, Path.cwd(), Path(__file__), "--inside", *selection)).returncode)
