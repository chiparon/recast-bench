"""Public checks shared by both arms; complete upstream regression is private."""
import argparse
import ast
from pathlib import Path
import sys

parser = argparse.ArgumentParser()
parser.add_argument("project")
parser.add_argument("--syntax", action="store_true")
parser.add_argument("--file")
args = parser.parse_args()
root = Path.cwd()
files = [root / args.file] if args.file else list(root.glob("**/*.py"))
for path in files:
    if not any(part.startswith(".") or part == "__pycache__" for part in path.relative_to(root).parts):
        ast.parse(path.read_text(encoding="utf-8"), filename=str(path))
if not args.syntax:
    sys.path[:0] = [str(root / "src"), str(root)]
    if args.project == "sqlparse":
        import sqlparse
        assert sqlparse.split("select 1; select 2;") == ["select 1;", "select 2;"]
        assert sqlparse.format("select 1", keyword_case="upper") == "SELECT 1"
    elif args.project == "rich-click":
        import rich_click as click
        from click.testing import CliRunner
        @click.command()
        @click.option("--name", default="world")
        def hello(name):
            click.echo("Hello " + name)
        result = CliRunner().invoke(hello, ["--help"])
        assert result.exit_code == 0 and "--name" in result.output
    elif args.project == "deepdiff":
        from deepdiff import DeepDiff, Delta
        diff = DeepDiff({"a": 1}, {"a": 2})
        assert diff["values_changed"]["root['a']"]["new_value"] == 2
        assert {"a": 1} + Delta(diff) == {"a": 2}
    elif args.project == "boltons":
        from boltons.iterutils import chunked
        assert chunked(range(5), 2) == [[0, 1], [2, 3], [4]]
    elif args.project == "jinja":
        from jinja2 import Environment
        assert Environment().from_string("Hello {{ name }}!").render(name="world") == "Hello world!"
    else:
        raise ValueError(args.project)
print("Public check passed")
