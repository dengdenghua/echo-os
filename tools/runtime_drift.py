#!/usr/bin/env python3
"""Measure, explain and ratchet the drift between the two copies of ``runtime/``.

Echo OS (``echo-os``) and Echo AI (``echo-ai``) each carry a copy of the same
Agent runtime under ``runtime/``. Fixes that land in one copy and never reach
the other are how a security fix goes missing, so this tool compares the two
trees file by file (git blob hashes, so line endings never count) and sorts
every path into: identical, diverged, or present on one side only.

For diverged files ``--details`` also says *how* they differ:

* the line shape: one side is a strict line superset of the other (it only
  adds lines), or both sides changed;
* ``cosmetic`` when the Python AST is the same (formatting/comments only) or
  differs only in docstrings;
* the history relation, from both repos' git logs: when one side's current
  blob appears in the other side's history of that path, the other side is
  strictly *ahead* and its newer commits are what the lagging side lacks;
  otherwise both sides moved since their last shared version (*forked*).

Intentional product differences are recorded in
``tools/lint/runtime_drift_allowlist.txt`` (same file in both repos). Every
other diverged path is *unexplained*. ``tools/lint/runtime_drift_baseline.json``
holds a snapshot of the sibling's runtime hashes plus the ceiling on
unexplained files, so ``tests/test_runtime_drift.py`` can enforce the ratchet
in CI without the sibling checkout. See ``docs/runtime-drift.md``.

Usage::

    python tools/runtime_drift.py                  # summary vs the sibling checkout
    python tools/runtime_drift.py --details        # + per-file shape and history
    python tools/runtime_drift.py --details --prefix runtime/safety
    python tools/runtime_drift.py --json report.json
    python tools/runtime_drift.py --check          # offline ratchet (what the test runs)
    python tools/runtime_drift.py --write-baseline # refresh snapshot + ceiling

The sibling checkout defaults to ``../echo-ai`` (from echo-os) or
``../echo-os`` (from echo-ai); override with ``--peer`` or
``ECHO_RUNTIME_DRIFT_PEER``. Live comparisons use both repos' ``HEAD``
(``--worktree`` uses the working trees instead), so another session's
uncommitted edits do not skew the numbers.
"""

from __future__ import annotations

import argparse
import ast
import difflib
import fnmatch
import json
import os
import subprocess
import sys
from collections import Counter
from dataclasses import asdict, dataclass, field
from pathlib import Path

REPO_ROOT = Path(__file__).resolve().parent.parent
RUNTIME = "runtime"
ALLOWLIST = REPO_ROOT / "tools" / "lint" / "runtime_drift_allowlist.txt"
BASELINE = REPO_ROOT / "tools" / "lint" / "runtime_drift_baseline.json"
# Hash prefix length stored in the baseline snapshot. 16 hex chars keep the
# file small; a collision between two different versions of one path is not
# a practical concern.
HASH_PREFIX = 16
# Allowlist categories: why a diverged file is allowed to stay diverged.
CATEGORIES = {
    "product": "a feature or hook that exists in one product only",
    "brand": "product name, copy or defaults that differ by product",
    "platform": "OS appliance integration (paths, services, packaging)",
}
EXCLUDED_PARTS = ("__pycache__/",)
PEER_ENV = "ECHO_RUNTIME_DRIFT_PEER"


# ── repo identity ───────────────────────────────────────────────────────────


def repo_name(root: Path) -> str:
    """``echo-os`` or ``echo-ai`` for a checkout, from its pyproject name."""
    try:
        text = (root / "pyproject.toml").read_text(encoding="utf-8")
    except OSError:
        return root.name
    for line in text.splitlines():
        if line.startswith("name"):
            name = line.split("=", 1)[1].strip().strip('"')
            return "echo-os" if name.startswith("echo-os") else "echo-ai"
    return root.name


def default_peer(root: Path) -> Path:
    env = os.environ.get(PEER_ENV)
    if env:
        return Path(env)
    peer = "echo-ai" if repo_name(root) == "echo-os" else "echo-os"
    return root.parent / peer


# ── git helpers ─────────────────────────────────────────────────────────────


def git(root: Path, *args: str, stdin: bytes | None = None) -> bytes:
    result = subprocess.run(
        ["git", "-C", str(root), *args],
        input=stdin,
        capture_output=True,
        check=False,
    )
    if result.returncode:
        raise SystemExit(
            f"runtime_drift: git {' '.join(args[:3])} failed in {root}: "
            f"{result.stderr.decode(errors='replace').strip()}"
        )
    return result.stdout


def _in_scope(path: str) -> bool:
    return path.startswith(f"{RUNTIME}/") and not any(p in path for p in EXCLUDED_PARTS)


def tree_hashes(root: Path, ref: str = "HEAD") -> dict[str, str]:
    """``{path: blob sha}`` for ``runtime/`` at ``ref``."""
    out: dict[str, str] = {}
    for entry in git(root, "ls-tree", "-r", "-z", ref, "--", RUNTIME).split(b"\0"):
        if not entry:
            continue
        meta, path = entry.decode("utf-8", "surrogateescape").split("\t", 1)
        mode, kind, sha = meta.split()
        if kind == "blob" and _in_scope(path):
            out[path] = sha
    return out


def worktree_hashes(root: Path) -> dict[str, str]:
    """``{path: blob sha}`` for tracked ``runtime/`` files as they are on disk.

    ``git hash-object`` applies the repo's attributes (``eol=lf``), so the
    hashes are comparable with ``ls-tree`` output from either repo.
    """
    raw = git(root, "ls-files", "-z", "--", RUNTIME).split(b"\0")
    paths = [
        p.decode("utf-8", "surrogateescape")
        for p in raw
        if p and _in_scope(p.decode("utf-8", "surrogateescape"))
    ]
    paths = [p for p in paths if (root / p).is_file()]
    if not paths:
        return {}
    shas = git(root, "hash-object", "--stdin-paths", stdin="\n".join(paths).encode()).split()
    return {p: s.decode() for p, s in zip(paths, shas, strict=True)}


def head_commit(root: Path) -> str:
    return git(root, "rev-parse", "HEAD").decode().strip()


class BlobReader:
    """Reads blobs through one ``git cat-file --batch`` process per repo."""

    def __init__(self, root: Path) -> None:
        self._proc = subprocess.Popen(
            ["git", "-C", str(root), "cat-file", "--batch"],
            stdin=subprocess.PIPE,
            stdout=subprocess.PIPE,
        )

    def read(self, sha: str) -> bytes:
        assert self._proc.stdin and self._proc.stdout
        self._proc.stdin.write(f"{sha}\n".encode())
        self._proc.stdin.flush()
        header = self._proc.stdout.readline().split()
        if len(header) < 3 or header[1] == b"missing":
            return b""
        size = int(header[2])
        data = self._proc.stdout.read(size)
        self._proc.stdout.read(1)  # trailing newline
        return data

    def close(self) -> None:
        if self._proc.stdin:
            self._proc.stdin.close()
        self._proc.wait()


@dataclass
class HistoryEntry:
    commit: str
    timestamp: int
    subject: str
    blob: str


def path_histories(root: Path, paths: set[str]) -> dict[str, list[HistoryEntry]]:
    """Newest-first ``[(commit, blob)]`` per path, from ``git log --raw``."""
    raw = git(
        root,
        "log",
        "--format=%x01%H%x09%ct%x09%s",
        "--raw",
        "--no-abbrev",
        "--no-renames",
        "-z",
        "HEAD",
        "--",
        RUNTIME,
    ).decode("utf-8", "surrogateescape")
    histories: dict[str, list[HistoryEntry]] = {}
    for chunk in raw.split("\x01"):
        if not chunk.strip():
            continue
        head, _, rest = chunk.partition("\n")
        commit, ts, subject = (head.split("\t", 2) + ["", ""])[:3]
        fields = [f for f in rest.split("\0") if f.strip()]
        # -z --raw: ":old_mode new_mode old_sha new_sha status\0path\0"
        for i in range(0, len(fields) - 1, 2):
            meta, path = fields[i].strip(), fields[i + 1]
            if path not in paths:
                continue
            parts = meta.split()
            if len(parts) < 5:
                continue
            blob = parts[3]
            if set(blob) == {"0"}:  # deletion
                continue
            histories.setdefault(path, []).append(
                HistoryEntry(commit[:10], int(ts or 0), subject, blob)
            )
    return histories


# ── allowlist and baseline ──────────────────────────────────────────────────


@dataclass(frozen=True)
class AllowEntry:
    pattern: str
    category: str
    reason: str


def load_allowlist(path: Path = ALLOWLIST) -> list[AllowEntry]:
    """``path<TAB>category<TAB>reason`` lines; ``#`` comments; globs allowed."""
    entries: list[AllowEntry] = []
    if not path.is_file():
        return entries
    for number, raw in enumerate(path.read_text(encoding="utf-8").splitlines(), 1):
        line = raw.rstrip()
        if not line or line.lstrip().startswith("#"):
            continue
        parts = line.split("\t")
        if len(parts) != 3 or not all(p.strip() for p in parts):
            raise ValueError(f"{path.name}:{number}: expected 'path<TAB>category<TAB>reason'")
        pattern, category, reason = (p.strip() for p in parts)
        if category not in CATEGORIES:
            raise ValueError(
                f"{path.name}:{number}: unknown category {category!r} "
                f"(use one of {', '.join(sorted(CATEGORIES))})"
            )
        entries.append(AllowEntry(pattern, category, reason))
    return entries


def allow_match(path: str, entries: list[AllowEntry]) -> AllowEntry | None:
    for entry in entries:
        if path == entry.pattern or fnmatch.fnmatchcase(path, entry.pattern):
            return entry
    return None


def load_baseline(path: Path = BASELINE) -> dict:
    return json.loads(path.read_text(encoding="utf-8"))


# ── comparison ──────────────────────────────────────────────────────────────


@dataclass
class FileDrift:
    path: str
    local_lines: int = 0
    peer_lines: int = 0
    added: int = 0  # lines only in local
    removed: int = 0  # lines only in peer
    shape: str = ""  # local-superset | peer-superset | both-changed
    cosmetic: str = ""  # "", "format", "docstrings"
    relation: str = ""  # local-ahead | peer-ahead | forked | unrelated
    local_commits: list[str] = field(default_factory=list)
    peer_commits: list[str] = field(default_factory=list)
    allow: str = ""


@dataclass
class Report:
    local: str
    peer: str
    local_commit: str
    peer_commit: str
    identical: int
    diverged: list[str]
    only_local: list[str]
    only_peer: list[str]
    allowlisted: list[str]
    unexplained: list[str]
    details: list[FileDrift] = field(default_factory=list)

    @property
    def shared(self) -> int:
        return self.identical + len(self.diverged)


def compare(
    local: dict[str, str],
    peer: dict[str, str],
    allowlist: list[AllowEntry],
    *,
    prefix_len: int | None = None,
) -> tuple[int, list[str], list[str], list[str]]:
    """``(identical, diverged, only_local, only_peer)``; hashes may be prefixes."""

    def same(a: str, b: str) -> bool:
        if prefix_len:
            return a[:prefix_len] == b[:prefix_len]
        return a == b

    shared = sorted(set(local) & set(peer))
    diverged = [p for p in shared if not same(local[p], peer[p])]
    identical = len(shared) - len(diverged)
    return (
        identical,
        diverged,
        sorted(set(local) - set(peer)),
        sorted(set(peer) - set(local)),
    )


def _strip_docstrings(tree: ast.AST) -> ast.AST:
    for node in ast.walk(tree):
        if isinstance(node, ast.Module | ast.ClassDef | ast.FunctionDef | ast.AsyncFunctionDef):
            body = node.body
            if (
                body
                and isinstance(body[0], ast.Expr)
                and isinstance(body[0].value, ast.Constant)
                and isinstance(body[0].value.value, str)
            ):
                node.body = body[1:] or [ast.Pass()]
    return tree


def cosmetic_kind(path: str, a: bytes, b: bytes) -> str:
    if not path.endswith(".py"):
        return "format" if a.split() == b.split() else ""
    try:
        ta, tb = ast.parse(a), ast.parse(b)
    except (SyntaxError, ValueError):
        return ""
    if ast.dump(ta) == ast.dump(tb):
        return "format"
    if ast.dump(_strip_docstrings(ta)) == ast.dump(_strip_docstrings(tb)):
        return "docstrings"
    return ""


def line_shape(a: bytes, b: bytes) -> tuple[int, int, str]:
    la = a.decode("utf-8", "replace").splitlines()
    lb = b.decode("utf-8", "replace").splitlines()
    added = removed = 0
    for tag, i1, i2, j1, j2 in difflib.SequenceMatcher(None, lb, la, autojunk=False).get_opcodes():
        if tag in ("replace", "delete"):
            removed += i2 - i1
        if tag in ("replace", "insert"):
            added += j2 - j1
    if added and not removed:
        shape = "local-superset"
    elif removed and not added:
        shape = "peer-superset"
    else:
        shape = "both-changed"
    return added, removed, shape


def _commit_label(entry: HistoryEntry) -> str:
    return f"{entry.commit} {entry.subject[:90]}"


def history_relation(
    local_sha: str,
    peer_sha: str,
    local_hist: list[HistoryEntry],
    peer_hist: list[HistoryEntry],
) -> tuple[str, list[str], list[str]]:
    """Which side is ahead, and the commits each side has since the last shared blob."""
    local_blobs = {e.blob for e in local_hist}
    peer_blobs = {e.blob for e in peer_hist}

    def since(hist: list[HistoryEntry], shared: set[str]) -> list[str]:
        newer: list[str] = []
        for entry in hist:  # newest first
            if entry.blob in shared:
                return newer
            newer.append(_commit_label(entry))
        return newer

    if peer_sha in local_blobs:
        return "local-ahead", since(local_hist, {peer_sha}), []
    if local_sha in peer_blobs:
        return "peer-ahead", [], since(peer_hist, {local_sha})
    common = local_blobs & peer_blobs
    if not common:
        return "unrelated", [_commit_label(e) for e in local_hist[:3]], [
            _commit_label(e) for e in peer_hist[:3]
        ]
    return "forked", since(local_hist, common), since(peer_hist, common)


def build_report(
    root: Path,
    peer_root: Path,
    *,
    worktree: bool = False,
    details: bool = False,
    prefix: str = "",
) -> Report:
    local = worktree_hashes(root) if worktree else tree_hashes(root)
    peer = worktree_hashes(peer_root) if worktree else tree_hashes(peer_root)
    if prefix:
        local = {p: s for p, s in local.items() if p.startswith(prefix)}
        peer = {p: s for p, s in peer.items() if p.startswith(prefix)}
    allowlist = load_allowlist()
    identical, diverged, only_local, only_peer = compare(local, peer, allowlist)
    allowlisted = [p for p in diverged if allow_match(p, allowlist)]
    unexplained = [p for p in diverged if not allow_match(p, allowlist)]
    report = Report(
        local=repo_name(root),
        peer=repo_name(peer_root),
        local_commit=head_commit(root),
        peer_commit=head_commit(peer_root),
        identical=identical,
        diverged=diverged,
        only_local=only_local,
        only_peer=only_peer,
        allowlisted=allowlisted,
        unexplained=unexplained,
    )
    if details and diverged:
        report.details = _details(root, peer_root, local, peer, diverged, allowlist)
    return report


def _details(
    root: Path,
    peer_root: Path,
    local: dict[str, str],
    peer: dict[str, str],
    diverged: list[str],
    allowlist: list[AllowEntry],
) -> list[FileDrift]:
    wanted = set(diverged)
    local_hist = path_histories(root, wanted)
    peer_hist = path_histories(peer_root, wanted)
    local_reader, peer_reader = BlobReader(root), BlobReader(peer_root)
    out: list[FileDrift] = []
    try:
        for path in diverged:
            a = _read(root, path, local[path], local_reader)
            b = _read(peer_root, path, peer[path], peer_reader)
            added, removed, shape = line_shape(a, b)
            relation, mine, theirs = history_relation(
                local[path], peer[path], local_hist.get(path, []), peer_hist.get(path, [])
            )
            entry = allow_match(path, allowlist)
            out.append(
                FileDrift(
                    path=path,
                    local_lines=a.count(b"\n"),
                    peer_lines=b.count(b"\n"),
                    added=added,
                    removed=removed,
                    shape=shape,
                    cosmetic=cosmetic_kind(path, a, b),
                    relation=relation,
                    local_commits=mine,
                    peer_commits=theirs,
                    allow=f"{entry.category}: {entry.reason}" if entry else "",
                )
            )
    finally:
        local_reader.close()
        peer_reader.close()
    return out


def _read(root: Path, path: str, sha: str, reader: BlobReader) -> bytes:
    data = reader.read(sha)
    if data or not (root / path).is_file():
        return data
    # Working-tree blob that is not in the object store yet.
    return (root / path).read_bytes().replace(b"\r\n", b"\n")


# ── offline ratchet ─────────────────────────────────────────────────────────


@dataclass
class CheckResult:
    peer: str
    peer_commit: str
    ceiling: int
    diverged: list[str]
    unexplained: list[str]
    new_unexplained: list[str]  # not in the recorded ledger
    converged_ledger: list[str]  # recorded as unexplained, now identical or gone
    stale_allow: list[str]  # allowlist patterns that no longer match a diverged file
    allow_errors: list[str]

    @property
    def problems(self) -> list[str]:
        msgs: list[str] = list(self.allow_errors)
        if len(self.unexplained) > self.ceiling:
            msgs.append(
                f"{len(self.unexplained)} unexplained diverged runtime files vs {self.peer} "
                f"(ceiling {self.ceiling}). Newly diverged:\n    "
                + "\n    ".join(self.new_unexplained or ["(see --details)"])
                + "\n  Port the change to the other repo, or, if the difference is an "
                "intentional product difference, add it to tools/lint/runtime_drift_allowlist.txt "
                "(both repos) with a reason. See docs/runtime-drift.md."
            )
        elif len(self.unexplained) < self.ceiling:
            msgs.append(
                f"Unexplained drift fell to {len(self.unexplained)} (ceiling {self.ceiling}). "
                "Lock in the win: run `python tools/runtime_drift.py --write-baseline` "
                "with the sibling checkout present, or lower max_unexplained in "
                "tools/lint/runtime_drift_baseline.json."
            )
        if self.stale_allow:
            msgs.append(
                "Allowlist entries that no longer match a diverged file (remove them):\n    "
                + "\n    ".join(self.stale_allow)
            )
        return msgs


def offline_check(root: Path = REPO_ROOT) -> CheckResult:
    """Working tree vs the committed snapshot of the sibling's runtime."""
    baseline = load_baseline()
    peer_files: dict[str, str] = baseline["peer_files"]
    local = worktree_hashes(root)
    allow_errors: list[str] = []
    try:
        allowlist = load_allowlist()
    except ValueError as exc:
        allowlist, allow_errors = [], [str(exc)]
    _, diverged, _, _ = compare(local, peer_files, allowlist, prefix_len=HASH_PREFIX)
    unexplained = [p for p in diverged if not allow_match(p, allowlist)]
    ledger = set(baseline.get("unexplained", []))
    diverged_set = set(diverged)
    stale = [
        e.pattern
        for e in allowlist
        if not any(p == e.pattern or fnmatch.fnmatchcase(p, e.pattern) for p in diverged_set)
    ]
    return CheckResult(
        peer=baseline.get("peer", "peer"),
        peer_commit=baseline.get("peer_commit", ""),
        ceiling=int(baseline["max_unexplained"]),
        diverged=diverged,
        unexplained=unexplained,
        new_unexplained=sorted(set(unexplained) - ledger),
        converged_ledger=sorted(ledger - set(unexplained)),
        stale_allow=stale,
        allow_errors=allow_errors,
    )


def write_baseline(root: Path, peer_root: Path) -> dict:
    """Snapshot the sibling's committed runtime and set the ceiling from local HEAD."""
    peer = tree_hashes(peer_root)
    local = tree_hashes(root)
    allowlist = load_allowlist()
    _, diverged, _, _ = compare(local, peer, allowlist)
    unexplained = [p for p in diverged if not allow_match(p, allowlist)]
    data = {
        "_comment": (
            "Generated by tools/runtime_drift.py --write-baseline. peer_files is the "
            "sibling repo's runtime/ (path -> blob sha prefix) at peer_commit; "
            "max_unexplained caps diverged files that are not in "
            "runtime_drift_allowlist.txt. See docs/runtime-drift.md."
        ),
        "local": repo_name(root),
        "peer": repo_name(peer_root),
        "peer_commit": head_commit(peer_root),
        "max_unexplained": len(unexplained),
        "unexplained": unexplained,
        "peer_files": {p: s[:HASH_PREFIX] for p, s in sorted(peer.items())},
    }
    BASELINE.write_text(json.dumps(data, indent=1, sort_keys=False) + "\n", encoding="utf-8")
    return data


# ── output ──────────────────────────────────────────────────────────────────


def _area(path: str, depth: int = 3) -> str:
    return "/".join(path.split("/")[:depth])


def print_report(report: Report, *, details: bool, limit: int) -> None:
    print(
        f"runtime/ drift: {report.local} @{report.local_commit[:10]} vs "
        f"{report.peer} @{report.peer_commit[:10]}"
    )
    print(f"  shared paths       {report.shared}")
    print(f"  identical          {report.identical}")
    print(
        f"  diverged           {len(report.diverged)} "
        f"(allowlisted {len(report.allowlisted)}, unexplained {len(report.unexplained)})"
    )
    print(f"  only in {report.local:<10} {len(report.only_local)}")
    print(f"  only in {report.peer:<10} {len(report.only_peer)}")
    areas = Counter(_area(p) for p in report.unexplained)
    if areas:
        print("\nUnexplained diverged files by area:")
        for area, n in areas.most_common(limit):
            print(f"  {n:4d}  {area}")
    if not details or not report.details:
        return
    rel = Counter(d.relation for d in report.details)
    shapes = Counter(d.shape for d in report.details)
    cosm = Counter(d.cosmetic or "semantic" for d in report.details)
    print(
        "\nHistory: "
        + ", ".join(f"{k} {v}" for k, v in rel.most_common())
        + "\nShape:   "
        + ", ".join(f"{k} {v}" for k, v in shapes.most_common())
        + "\nContent: "
        + ", ".join(f"{k} {v}" for k, v in cosm.most_common())
    )
    print(f"\n{'path':<72} {'+loc':>5} {'-loc':>5}  relation     shape / note")
    for d in report.details:
        note = d.cosmetic and f"cosmetic:{d.cosmetic}" or d.shape
        if d.allow:
            note += f"  [allow {d.allow.split(':', 1)[0]}]"
        print(f"{d.path:<72} {d.added:5d} {d.removed:5d}  {d.relation:<12} {note}")
        for c in d.local_commits[:4]:
            print(f"      {report.local}: {c}")
        for c in d.peer_commits[:4]:
            print(f"      {report.peer}: {c}")


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(description=__doc__.split("\n\n", 1)[0])
    parser.add_argument("--peer", type=Path, help="sibling checkout (default: ../echo-ai|echo-os)")
    parser.add_argument("--worktree", action="store_true", help="compare working trees, not HEAD")
    parser.add_argument("--details", action="store_true", help="per-file shape and history")
    parser.add_argument("--prefix", default="", help="only paths under this prefix")
    parser.add_argument("--json", type=Path, help="write the full report as JSON")
    parser.add_argument("--limit", type=int, default=40, help="rows in the area table")
    parser.add_argument(
        "--check", action="store_true", help="offline ratchet: worktree vs committed snapshot"
    )
    parser.add_argument(
        "--write-baseline", action="store_true", help="refresh snapshot + ceiling from the sibling"
    )
    args = parser.parse_args(argv)

    if args.check:
        result = offline_check()
        problems = result.problems
        print(
            f"runtime drift vs {result.peer} snapshot @{result.peer_commit[:10]}: "
            f"{len(result.diverged)} diverged, {len(result.unexplained)} unexplained "
            f"(ceiling {result.ceiling})"
        )
        for msg in problems:
            print(f"\n{msg}")
        return 1 if problems else 0

    peer_root = (args.peer or default_peer(REPO_ROOT)).resolve()
    if not (peer_root / RUNTIME).is_dir():
        print(f"runtime_drift: sibling checkout not found at {peer_root} (use --peer)")
        return 2

    if args.write_baseline:
        data = write_baseline(REPO_ROOT, peer_root)
        print(
            f"wrote {BASELINE.relative_to(REPO_ROOT).as_posix()}: {len(data['peer_files'])} "
            f"{data['peer']} files @{data['peer_commit'][:10]}, "
            f"max_unexplained {data['max_unexplained']}"
        )
        peer_allow = peer_root / ALLOWLIST.relative_to(REPO_ROOT)
        if peer_allow.is_file() and peer_allow.read_bytes() != ALLOWLIST.read_bytes():
            print(f"warning: {peer_allow} differs from this repo's allowlist; keep them identical")
        return 0

    report = build_report(
        REPO_ROOT, peer_root, worktree=args.worktree, details=args.details, prefix=args.prefix
    )
    print_report(report, details=args.details, limit=args.limit)
    if args.json:
        payload = asdict(report)
        payload["shared"] = report.shared
        args.json.write_text(json.dumps(payload, indent=1, ensure_ascii=False), encoding="utf-8")
        print(f"\nwrote {args.json}")
    return 0


if __name__ == "__main__":
    sys.exit(main())
