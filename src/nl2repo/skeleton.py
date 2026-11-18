"""Strict declaration skeleton: no original imports, values, decorators or bodies."""
import ast
import copy


def declarations(nodes):
    result = []
    for node in nodes:
        if isinstance(node, (ast.FunctionDef, ast.AsyncFunctionDef)):
            stub = copy.deepcopy(node)
            stub.decorator_list = []
            stub.args.defaults = [ast.Constant(Ellipsis) for _ in stub.args.defaults]
            stub.args.kw_defaults = [None if d is None else ast.Constant(Ellipsis) for d in stub.args.kw_defaults]
            stub.body = [ast.Raise(ast.Call(ast.Name("NotImplementedError", ast.Load()),
                                            [ast.Constant("NL2Repo skeleton: implement this API")], []), None)]
            result.append(stub)
        elif isinstance(node, ast.ClassDef):
            stub = copy.deepcopy(node)
            stub.bases, stub.keywords, stub.decorator_list = [], [], []
            stub.body = declarations(node.body) or [ast.Pass()]
            result.append(stub)
        elif isinstance(node, (ast.Assign, ast.AnnAssign)):
            targets = node.targets if isinstance(node, ast.Assign) else [node.target]
            for target in targets:
                # Export names, not lookup tables, lambdas, comprehensions or computed values.
                for name in ast.walk(target):
                    if isinstance(name, ast.Name):
                        result.append(ast.Assign([ast.Name(name.id, ast.Store())], ast.Constant(Ellipsis)))
        elif isinstance(node, (ast.If, ast.Try)):
            # Conditional API declarations remain discoverable; branch logic is removed.
            groups = [node.body, node.orelse]
            if isinstance(node, ast.Try):
                groups += [node.finalbody, *(handler.body for handler in node.handlers)]
            for group in groups:
                result.extend(declarations(group))
    return result


def skeleton(source):
    tree = ast.parse(source)
    result = ast.Module(body=[ast.ImportFrom("__future__", [ast.alias("annotations")], 0),
                              *declarations(tree.body)], type_ignores=[])
    ast.fix_missing_locations(result)
    text = "# Declaration skeleton. Reconstruct imports, inheritance, constants and behavior.\n" + ast.unparse(result) + "\n"
    ast.parse(text)
    return text
