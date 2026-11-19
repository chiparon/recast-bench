# NL2Repo paired results: five-unlimited-high-v1-retry

Model **gpt-6-luna**, effort `high`. Project token budget **unlimited**. Project time budget **unlimited**. Repetitions per method 1.

| Project | RECAST test pass rate | Codex test pass rate |
|---|---:|---:|
| sqlparse | 134/461 (29.07%) | 233/461 (50.54%) |
| rich-click | 0/139 (0.00%) | 0/139 (0.00%) |
| deepdiff | 7/970 (0.72%) | 368/970 (37.94%) |
| boltons | 16/423 (3.78%) | 0/423 (0.00%) |
| jinja | 0/911 (0.00%) | 117/911 (12.84%) |
| Equal-project average | **6.71%** | **20.26%** |

0/10 trials stopped at the configured budget. Fully passing deliveries: recast=0/5, codex=0/5.

Token counts below are provider-reported usage, including input and output.

The declaration-skeleton setup uses an empty reference corpus and per-file RECAST scheduling without supplied dependency edges.

## Inputs and controls

This is a declaration-skeleton variant of NL2Repo, not the original empty-workspace benchmark.

| Project | Production files | Original lines | Upstream count | Local baseline | Skeleton | Environment |
|---|---:|---:|---:|---|---|---|
| sqlparse | 21 | 4,023 | 461 | 461/464 collected | 1/461 | ready |
| rich-click | 20 | 6,785 | 145 | 139/143 collected | 4/139 | ready |
| deepdiff | 16 | 8,127 | 970 | 970/980 collected | 0/970 | ready |
| boltons | 30 | 17,005 | 423 | 423/423 collected | 2/423 | ready |
| jinja | 25 | 14,351 | 911 | 911/911 collected | 0/911 | ready |

Native controls are preparation diagnostics. Formal model scores require successful isolated controls, including a frozen list of eligible test IDs. Skips and expected failures in the original are excluded before either arm runs. Collection failures and missing tests in a generated submission remain in the fixed denominator.

## Per-trial details

| Project | Repetition | Method | Test pass rate | Reported tokens | State |
|---|---:|---|---:|---:|---|
| sqlparse | 0 | recast | 134/461 (29.07%) | 10282250 | graded |
| sqlparse | 0 | codex | 233/461 (50.54%) | 15506123 | Error: Public tests failed: WARNING: Running pip as the 'root' user can result in broken permissions and conflicting behaviour with the system package manager, possibly rendering your system unusable.It is recommended to use a virtual environment instead: https://pip.pypa.io/warnings/venv. Use the --root-user-action option if you know what you are doing and want to suppress this warning. Traceback (most recent call last):   File "/tmp/project/public_check.py", line 22, in <module>     assert sqlparse.format("select 1", keyword_case="upper") == "SELECT 1"            ^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^   File "/tmp/project/sqlparse/__init__.py", line 34, in format     results = [str(item) for item in stack.run(sql_text, encoding)]                                      ^^^^^^^^^^^^^^^^^^^^^^^^^^^^^   File "/tmp/project/sqlparse/engine/filter_stack.py", line 24, in run     for raw_statement in splitter.process(stream):                          ^^^^^^^^^^^^^^^^^^^^^^^^   File "/tmp/project/sqlparse/engine/statement_splitter.py", line 38, in process     for ttype, value in stream:                         ^^^^^^   File "/tmp/project/sqlparse/filters/tokens.py", line 26, in process     if self.case and any(ttype in base for base in bases):                      ^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^   File "/tmp/project/sqlparse/filters/tokens.py", line 26, in <genexpr>     if self.case and any(ttype in base for base in bases):                          ^^^^^^^^^^^^^ TypeError: 'in <string>' requires string as left operand, not _TokenType  |
| rich-click | 0 | recast | 0/139 (0.00%) | 825166 | Cannot produce a safe implementation plan for src/rich_click/_click_types_cache.py: its writable source file contains only the future-import skeleton, the shared requirements do not specify this module's symbols, signatures, or cache behavior, and the supplied context has no historical candidate. The required query_evidence tool is not available in this run. Please provide the module's API/history excerpt or restore access to query_evidence; inventing a cache contract would risk breaking its consumers. |
| rich-click | 0 | codex | 0/139 (0.00%) | 12344422 | Error: Public tests failed: WARNING: Running pip as the 'root' user can result in broken permissions and conflicting behaviour with the system package manager, possibly rendering your system unusable.It is recommended to use a virtual environment instead: https://pip.pypa.io/warnings/venv. Use the --root-user-action option if you know what you are doing and want to suppress this warning. Traceback (most recent call last):   File "/tmp/project/public_check.py", line 24, in <module>     import rich_click as click   File "/tmp/project/src/rich_click/__init__.py", line 9, in <module>     globals()[_name] = getattr(_click, _name)     ^^^^^^^^^ TypeError: 'module' object is not callable  |
| deepdiff | 0 | recast | 7/970 (0.72%) | 3126837 | Cannot produce a reliable implementation plan for deepdiff/delta.py because the supplied files are declaration-only and the required pinned historical implementation evidence is unavailable: evidenceScopes is empty, evidenceQueriesRemaining is 0, and no query_evidence tool is exposed. REQUIREMENTS.md gives Delta signatures and broad behavior but omits the precise delta payload schema and compatible semantics for ignore-order opcodes/indexes, flat-row round-tripping, reverse/merge behavior, and path mutation/type-coercion. Implementing those details from guesswork would invent behavior and risk violating the existing DeepDiff/serialization contracts. Provide a scoped history evidence query for the Delta implementation (or the relevant concrete symbols) before planning. |
| deepdiff | 0 | codex | 368/970 (37.94%) | 21825685 | graded |
| boltons | 0 | recast | 16/423 (3.78%) | 1414546 | The only supplied debugutils evidence is a declaration skeleton and abbreviated behavioral summaries; it does not define the concrete tracing protocol needed to implement `trace_print_hook`, `wrap_trace`, and their `wrap_method`/`__setattr__`/`__delattr__` callbacks (event names, filtering semantics, proxy/attribute behavior, and hook argument/default formatting), nor the exact `pdb_on_exception` limit behavior. The historical candidate was not supplied, `evidenceScopes` is empty, and this run exposes no `query_evidence` tool despite the requirement to retrieve a concrete historical symbol when adapting. Without that evidence I would have to invent compatibility behavior for the core module APIs. Please provide the pinned debugutils implementation/excerpts or complete behavioral contracts for these symbols, and enable the scoped evidence query. |
| boltons | 0 | codex | 0/423 (0.00%) | 19289801 | graded |
| jinja | 0 | recast | 0/911 (0.00%) | 1451213 | The compiler.py workspace file is only a declaration skeleton, and the supplied requirements describe behavior but do not provide the historical implementations needed for this large module. The analyzer instructions require querying one concrete symbol at a time when that implementation is absent, but this run exposes no query_evidence tool and the request reports evidenceScopes=[] with evidenceQueriesRemaining=0. Without the pinned compiler history excerpts, I cannot responsibly plan a faithful complete implementation rather than inventing behavior. |
| jinja | 0 | codex | 117/911 (12.84%) | 26436890 | Error: Public tests failed: G: Running pip as the 'root' user can result in broken permissions and conflicting behaviour with the system package manager, possibly rendering your system unusable.It is recommended to use a virtual environment instead: https://pip.pypa.io/warnings/venv. Use the --root-user-action option if you know what you are doing and want to suppress this warning. Traceback (most recent call last):   File "/tmp/project/public_check.py", line 42, in <module>     assert Environment().from_string("Hello {{ name }}!").render(name="world") == "Hello world!"            ^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^   File "/tmp/project/src/jinja2/environment.py", line 212, in from_string     cls=template_class or self.template_class; code=self.compile(source)                                                     ^^^^^^^^^^^^^^^^^^^^   File "/tmp/project/src/jinja2/environment.py", line 139, in compile     src=self.preprocess(source,name,filename); astnode=self._parse(src,name,filename); astnode._source=src                                                        ^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^   File "/tmp/project/src/jinja2/environment.py", line 121, in _parse     def _parse(self,source,name,filename): return Parser(self,source,name,filename).parse()                                                   ^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^   File "/tmp/project/src/jinja2/parser.py", line 352, in parse     body=self.subparse(); result=nodes.Template(body); result.set_environment(self.environment); return result          ^^^^^^^^^^^^^^^   File "/tmp/project/src/jinja2/parser.py", line 336, in subparse     if token.type==TOKEN_VARIABLE_BEGIN: body.append(self.parse_print()); continue                                                      ^^^^^^^^^^^^^^^^^^   File "/tmp/project/src/jinja2/parser.py", line 164, in parse_print     if not self.stream.skip_if(TOKEN_COMMA): break                                ^^^^^^^^^^^ NameError: name 'TOKEN_COMMA' is not defined. Did you mean: 'TOKEN_DATA'?  |

Macro average: recast=6.71%, codex=20.26%

[Reproducible evidence: protocol, controls, per-trial usage and delivered files](nl2repo-five-unlimited-high-v1-retry-evidence.json.gz)
