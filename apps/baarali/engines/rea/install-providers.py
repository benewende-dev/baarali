"""Build-time installation only: immutable artifacts with verified digests.

BAARALI(15/10/2026): no provider download, update or extraction runs in an
account's interactive session. Keep upstream licenses in the complete trees.
"""
import hashlib
import json
import os
from pathlib import Path, PurePosixPath
import shutil
import stat
import sys
import tempfile
import urllib.request
import zipfile


def download(spec, destination):
    if not spec["url"].startswith("https://github.com/"):
        raise ValueError("Provider must use an explicit GitHub release URL")
    digest = hashlib.sha256()
    total = 0
    with urllib.request.urlopen(spec["url"], timeout=60) as source, destination.open("wb") as output:
        while chunk := source.read(1024 * 1024):
            total += len(chunk)
            if total > 1024 * 1024 * 1024:
                raise ValueError("Provider download exceeds 1 GiB")
            digest.update(chunk)
            output.write(chunk)
    if digest.hexdigest() != spec["sha256"]:
        raise ValueError("Provider SHA-256 mismatch")


def extract(archive, destination, expected_root):
    with zipfile.ZipFile(archive) as source:
        entries = source.infolist()
        if len(entries) > 100_000 or sum(item.file_size for item in entries) > 4 * 1024**3:
            raise ValueError("Provider archive exceeds extraction budget")
        for item in entries:
            name = PurePosixPath(item.filename)
            mode = item.external_attr >> 16
            if name.is_absolute() or ".." in name.parts or "\\" in item.filename or stat.S_ISLNK(mode):
                raise ValueError("Unsafe provider archive member")
            if not name.parts or name.parts[0] != expected_root:
                raise ValueError("Unexpected provider archive root")
            relative = Path(*name.parts[1:])
            target = destination / relative
            if item.is_dir():
                target.mkdir(parents=True, exist_ok=True)
            else:
                target.parent.mkdir(parents=True, exist_ok=True)
                with source.open(item) as src, target.open("xb") as out:
                    shutil.copyfileobj(src, out)
                target.chmod(mode & 0o777 or 0o644)


def install(manifest, destination):
    destination = Path(destination).absolute()
    if destination.exists():
        raise ValueError("Provider destination already exists")
    destination.parent.mkdir(parents=True, exist_ok=True)
    specs = json.loads(Path(manifest).read_text())
    with tempfile.TemporaryDirectory(prefix="baarali-analysis-", dir=destination.parent) as temporary:
        temporary = Path(temporary)
        output = temporary / "providers"
        output.mkdir()
        ghidra_zip = temporary / "ghidra.zip"
        download(specs["ghidra"], ghidra_zip)
        extract(ghidra_zip, output / "ghidra", specs["ghidra"]["archive_root"])
        download(specs["jadx"], output / "jadx-headless-mcp.jar")
        (output / "providers.json").write_text(json.dumps(specs, indent=2) + "\n")
        os.replace(output, destination)


if __name__ == "__main__":
    install(sys.argv[1], sys.argv[2])
