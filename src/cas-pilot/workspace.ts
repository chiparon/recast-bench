import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readFileSync, readdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { DatabaseSync } from "node:sqlite";
import type { RawWorkspace } from "../real-projects/method-raw.ts";

const str = { type: "string" },
  int = { type: "integer" };
function tool(
  name: string,
  description: string,
  properties: Record<string, unknown>,
  required: string[],
) {
  return {
    name,
    description,
    inputSchema: {
      type: "object",
      properties,
      required,
      additionalProperties: false,
    },
  };
}
const tools = [
  tool(
    "list_files",
    "Page through target paths, optionally filtered by path substring.",
    { filter: str, offset: int, writable: { type: "boolean" } },
    [],
  ),
  tool(
    "search_source",
    "Search source by identifier, keyword or phrase. For history, ranked full-text chunks include original source lines. For target, literal matches reflect current edits.",
    {
      scope: { type: "string", enum: ["target", "history"] },
      query: str,
      filter: str,
      offset: int,
    },
    ["scope", "query"],
  ),
  tool(
    "read_slice",
    "Read numbered lines from a target or history/ path. Returns current file hash for edits.",
    { path: str, start: int, lines: int },
    ["path"],
  ),
  tool(
    "edit_lines",
    "Apply non-overlapping inclusive line replacements to the file version just read. Supply exact Python indentation; use end=start-1 for insertion. List the history paths actually used.",
    {
      path: str,
      hash: str,
      edits: {
        type: "array",
        items: {
          type: "object",
          properties: { start: int, end: int, text: str },
          required: ["start", "end", "text"],
        },
      },
      sources: { type: "array", items: str },
    },
    ["path", "hash", "edits"],
  ),
];
const sha = (value: string) => createHash("sha256").update(value).digest("hex");
const linesOf = (text: string) => text.split(/\r?\n/);
const num = (x: unknown, fallback: number, min: number, max: number) =>
  Math.max(min, Math.min(max, Number.isSafeInteger(x) ? Number(x) : fallback));

export class HistoryIndex {
  db = new DatabaseSync(":memory:");
  files = new Map<string, string>();
  counts: Record<string, number> = {};
  constructor(root?: string) {
    this.db.exec(
      "CREATE VIRTUAL TABLE chunks USING fts5(path, source, first UNINDEXED, tokenize='unicode61'); BEGIN",
    );
    const add = this.db.prepare("INSERT INTO chunks VALUES(?,?,?)");
    if (root)
      for (const rel of readdirSync(root, { recursive: true })
        .map(String)
        .sort()) {
        if (!/\.(c|h|java|jl|lisp)$/i.test(rel)) continue;
        const key = "history/" + rel.replaceAll("\\", "/"),
          repo = key.split("/")[1];
        const body = readFileSync(join(root, rel), "utf8");
        this.files.set(key, body);
        this.counts[repo] = (this.counts[repo] ?? 0) + 1;
        const lines = linesOf(body);
        for (let i = 0; i < lines.length; i += 36)
          add.run(key, lines.slice(i, i + 36).join("\n"), i + 1);
      }
    this.db.exec("COMMIT");
  }
  search(query: string, filter = "", offset = 0) {
    const terms = [...new Set(query.match(/[\p{L}\p{N}]+/gu) ?? [])].slice(
      0,
      12,
    );
    if (!terms.length) return [];
    const expr = terms.map((t) => '"' + t + '"').join(" OR ");
    return this.db
      .prepare(
        "SELECT path,first,source FROM chunks WHERE chunks MATCH ? AND instr(path,?)>0 ORDER BY bm25(chunks,0.25,1,0),path,first LIMIT 5 OFFSET ?",
      )
      .all(expr, filter, offset)
      .map((row) => ({
        path: String(row.path),
        start: Number(row.first),
        content: String(row.source).slice(0, 2200),
      }));
  }
  close() {
    this.db.close();
  }
}

export function bridge(
  root: string,
  paths: string[],
  writable: string[],
  history: {
    files: Map<string, string>;
    search(query: string, filter: string, offset: number): unknown;
  },
  log: (v: any) => void,
): RawWorkspace {
  const files = new Set(paths),
    allowed = new Set(writable),
    seen = new Map<string, string>();
  return {
    tools,
    instructions:
      "The full target is paginated. Use list_files, search_source, read_slice and edit_lines. Search the mounted history for useful algorithms if available. Attribute sources you use in edit_lines. Implement the requested library and run public checks. All 15 families receive partial credit; finish with your actual best implementation.",
    async execute(name, args) {
      const p = String(args.path ?? ""),
        offset = num(args.offset, 0, 0, 1e7),
        filter = String(args.filter ?? "");
      if (name === "list_files") {
        const matches = (args.writable === false ? paths : writable).filter(
          (k) => k.includes(filter),
        );
        return {
          total: matches.length,
          offset,
          paths: matches.slice(offset, offset + 60),
        };
      }
      if (name === "search_source") {
        const query = String(args.query ?? "").trim();
        if (!query) throw Error("Provide a query");
        if (args.scope === "history") {
          const hits = await history.search(query, filter, offset);
          log({ tool: name, scope: "history", query, filter, hits });
          return hits;
        }
        const hits = [];
        let matched = 0;
        for (const key of paths.filter(
          (k) => k.includes(filter) && k.endsWith(".py"),
        )) {
          const lines = linesOf(readFileSync(join(root, key), "utf8"));
          for (let i = 0; i < lines.length; i++)
            if (lines[i].toLowerCase().includes(query.toLowerCase())) {
              if (matched++ >= offset)
                hits.push({
                  path: key,
                  line: i + 1,
                  content: lines[i].slice(0, 400),
                });
              if (hits.length === 22) return hits;
            }
        }
        return hits;
      }
      if (!files.has(p) && !history.files.has(p))
        throw Error("Path outside visible scope");
      const body = history.files.get(p) ?? readFileSync(join(root, p), "utf8"),
        hash = sha(body),
        lines = linesOf(body);
      if (name === "read_slice") {
        const start = num(args.start, 1, 1, lines.length),
          count = num(args.lines, 64, 1, 140);
        const content = lines
          .slice(start - 1, start - 1 + count)
          .map((v, i) => start + i + " " + v)
          .join("\n")
          .slice(0, 14000);
        seen.set(p, hash);
        log({
          tool: name,
          path: p,
          start,
          count,
          ...(history.files.has(p) ? { content } : {}),
        });
        return { path: p, start, total: lines.length, hash, content };
      }
      if (name !== "edit_lines" || !allowed.has(p))
        throw Error("Path outside write scope");
      if (args.hash !== hash || seen.get(p) !== hash)
        throw Error("Read current file hash first");
      if (!Array.isArray(args.edits) || !args.edits.length)
        throw Error("Provide edits");
      let nextStart = lines.length + 1;
      for (const edit of [...args.edits].sort((a, b) => b.start - a.start)) {
        const { start, end, text } = edit;
        assert(
          Number.isSafeInteger(start) &&
            Number.isSafeInteger(end) &&
            start >= 1 &&
            start < nextStart &&
            end < nextStart &&
            end >= start - 1 &&
            typeof text === "string",
          "Invalid/overlapping line range",
        );
        lines.splice(
          start - 1,
          end - start + 1,
          ...(text === "" ? [] : linesOf(text)),
        );
        nextStart = start;
      }
      const updated = lines.join(body.includes("\r\n") ? "\r\n" : "\n");
      writeFileSync(join(root, p), updated);
      const digest = sha(updated);
      seen.set(p, digest);
      log({
        tool: name,
        path: p,
        hash: digest,
        sources: args.sources ?? [],
        edits: args.edits,
      });
      return { path: p, hash: digest };
    },
  };
}
