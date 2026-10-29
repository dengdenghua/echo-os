#!/usr/bin/env python3
"""Rebuild the locked v1-feature-gated runtime with a caller-provided toolchain.

This wrapper does not install a toolchain or download source. Its configure and
Ninja sequence was exercised by the original build; this parameterized wrapper
has only received CLI and syntax checks.
"""

from __future__ import annotations

import argparse
import gzip
import hashlib
import json
import os
import shlex
import shutil
import subprocess
import tarfile
from pathlib import Path, PurePosixPath

HERE = Path(__file__).resolve().parent


def digest(path: Path) -> str:
    with path.open("rb") as stream:
        return hashlib.file_digest(stream, "sha256").hexdigest()


def checked_file(path: Path, expected: str) -> None:
    if not path.is_file() or digest(path) != expected:
        raise SystemExit(f"Missing or mismatched locked input: {path}")


def payload(record: dict) -> bytes:
    path = HERE / record["path"]
    checked_file(path, record["gzip_sha256"])
    data = gzip.decompress(path.read_bytes())
    if (
        len(data) != record["payload_bytes"]
        or hashlib.sha256(data).hexdigest() != record["payload_sha256"]
    ):
        raise SystemExit(f"Compressed payload mismatch: {path}")
    return data


def extract_source(archive: Path, destination: Path) -> Path:
    """Extract regular source files; use the existing prebuilt firmware separately."""
    with tarfile.open(archive, "r:xz") as source:
        for member in source:
            name = PurePosixPath(member.name)
            if not member.isfile() or member.name.startswith("qemu-11.1.3/roms/"):
                continue
            if name.is_absolute() or not name.parts or name.parts[0] != "qemu-11.1.3":
                raise SystemExit(f"Unexpected source archive member: {member.name}")
            target = destination.joinpath(*name.parts)
            if not target.resolve().is_relative_to(destination.resolve()):
                raise SystemExit(f"Source member escapes work directory: {member.name}")
            target.parent.mkdir(parents=True, exist_ok=True)
            with source.extractfile(member) as src, target.open("wb") as dst:
                shutil.copyfileobj(src, dst)
    return destination / "qemu-11.1.3"


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument(
        "--work-dir",
        type=Path,
        required=True,
        help="New or empty directory outside Git",
    )
    parser.add_argument(
        "--python", type=Path, required=True, help="Native CPython with locked Meson"
    )
    parser.add_argument(
        "--toolchain-root",
        type=Path,
        required=True,
        help="Prepared MSYS2 UCRT64 prefix",
    )
    parser.add_argument(
        "--source-archive", type=Path, required=True, help="Locked qemu-11.1.3.tar.xz"
    )
    parser.add_argument(
        "--bash", type=Path, required=True, help="Git Bash or compatible MSYS2 bash.exe"
    )
    parser.add_argument("--jobs", type=int, choices=(1, 2), default=2)
    parser.add_argument(
        "--package-cache",
        type=Path,
        action="append",
        default=[],
        help="Optional read-only archive cache; repeat to verify all 98 locked package archives",
    )
    args = parser.parse_args()
    if os.name != "nt":
        parser.error("This recipe requires a Windows host and native UCRT64 toolchain")

    lock = json.loads((HERE / "source.lock.json").read_text(encoding="utf-8"))
    work = args.work_dir.resolve()
    python = args.python.resolve()
    tools = args.toolchain_root.resolve()
    archive = args.source_archive.resolve()
    bash = args.bash.resolve()
    if work.exists() and (not work.is_dir() or any(work.iterdir())):
        parser.error("--work-dir must be new or empty; existing work is never overwritten")
    git = shutil.which("git")
    if git is None or not python.is_file() or not bash.is_file():
        parser.error("Provide existing Git, native Python and bash executables")
    ancestor = work
    while not ancestor.exists():
        ancestor = ancestor.parent
    inside_git = subprocess.run(
        [git, "rev-parse", "--is-inside-work-tree"],
        cwd=ancestor,
        stdout=subprocess.DEVNULL,
        stderr=subprocess.DEVNULL,
        check=False,
    )
    if inside_git.returncode == 0:
        parser.error(
            "Choose --work-dir outside Git so source patches cannot address the parent repo"
        )

    checked_file(archive, lock["source"]["sha256"])
    checked_file(HERE / lock["toolchain"]["packages_file"], lock["toolchain"]["packages_sha256"])
    for record in lock["toolchain"]["critical_files"]:
        checked_file(tools / record["path"], record["sha256"])
    version = json.loads(
        subprocess.check_output(
            [
                str(python),
                "-c",
                "import json,sys;from importlib.metadata import version;"
                "print(json.dumps({'python':'.'.join(map(str,sys.version_info[:3])),"
                "'meson':version('meson')}))",
            ],
            text=True,
            encoding="utf-8",
        )
    )
    for name in ("python", "meson"):
        if version[name] != lock["toolchain"]["versions"][name]:
            parser.error(f"Locked {name} version required: {lock['toolchain']['versions'][name]}")
    if args.package_cache:
        packages = json.loads(
            (HERE / lock["toolchain"]["packages_file"]).read_text(encoding="utf-8")
        )
        for package in packages:
            found = next(
                (
                    cache / package["FILENAME"]
                    for cache in args.package_cache
                    if (cache / package["FILENAME"]).is_file()
                ),
                None,
            )
            if found is None:
                parser.error(f"Missing locked package archive: {package['FILENAME']}")
            checked_file(found, package["SHA256SUM"])

    records = lock["upstream"]["patches"] + lock["local_patches"]
    decoded = {record["path"]: payload(record) for record in records}
    payload(lock["upstream"]["mbox"])
    if set(decoded) != set(lock["application_order"]) or len(records) != 13:
        parser.error("Expected exactly 11 upstream patches and 2 local patches")

    work.mkdir(parents=True, exist_ok=True)
    source = extract_source(archive, work / "source")
    patches = work / "applied-patches"
    patches.mkdir()
    env = dict(os.environ)
    for key in ("GIT_DIR", "GIT_WORK_TREE", "GIT_INDEX_FILE"):
        env.pop(key, None)
    env["GIT_CEILING_DIRECTORIES"] = str(work)
    for name in lock["application_order"]:
        patch = patches / Path(name).name.removesuffix(".gz")
        patch.write_bytes(decoded[name])
        command = [git, "-c", "core.autocrlf=false", "apply", "--whitespace=warn"]
        subprocess.run([*command, "--check", str(patch)], cwd=source, env=env, check=True)
        subprocess.run([*command, str(patch)], cwd=source, env=env, check=True)

    lines = [
        "#!/usr/bin/env bash",
        "set -euo pipefail",
        f"qemu_work={shlex.quote(work.as_posix())}",
        f"qemu_source={shlex.quote(source.as_posix())}",
        f"qemu_python={shlex.quote(python.as_posix())}",
        f"qemu_tools={shlex.quote(tools.as_posix())}",
        'export PATH="$(cygpath -u "$qemu_tools/bin"):$(cygpath -u "$(dirname "$qemu_python")"):$PATH"',
        'export CC="$qemu_tools/bin/gcc.exe"',
        'export CXX="$qemu_tools/bin/g++.exe"',
        'export PKG_CONFIG="$qemu_tools/bin/pkgconf.exe"',
        'export PKG_CONFIG_PATH="$qemu_tools/lib/pkgconfig;$qemu_tools/share/pkgconfig"',
        'mkdir -p "$qemu_work/build"',
        'cd "$qemu_work/build"',
        '"$qemu_source/configure" --python="$qemu_python" '
        '--ninja="$qemu_tools/bin/ninja.exe" '
        + " ".join(shlex.quote(x) for x in lock["configure_args"])
        + ' --prefix="$qemu_work/install"',
        f'"$qemu_tools/bin/ninja.exe" -j{args.jobs} '
        + " ".join(shlex.quote(x) for x in lock["targets"]),
    ]
    build_script = work / "build.sh"
    build_script.write_bytes(("\n".join(lines) + "\n").encode("utf-8"))
    subprocess.run([str(bash), str(build_script)], env=env, check=True)
    receipt = {
        "identity": lock["identity"],
        "source_lock_sha256": digest(HERE / "source.lock.json"),
        "source_archive_sha256": digest(archive),
        "build_script_sha256": digest(build_script),
        "critical_toolchain_files_verified": True,
        "all_98_package_archives_verified": bool(args.package_cache),
        "products": [
            {"path": name, "sha256": digest(work / "build" / name)} for name in lock["targets"]
        ],
    }
    (work / "build-receipt.json").write_text(
        json.dumps(receipt, indent=2) + "\n",
        encoding="utf-8",
    )
    print(f"Built {lock['identity']}; products and receipt: {work}")


if __name__ == "__main__":
    main()
