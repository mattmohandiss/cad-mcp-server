#!/usr/bin/env python3
"""Assemble the files consumed by the packaged Cosmopolitan sidecar runtime."""
import argparse
from pathlib import Path
import shutil
import tarfile
import tempfile

parser = argparse.ArgumentParser()
parser.add_argument("--work", type=Path, default=Path("build-work"))
parser.add_argument("--output", type=Path, default=Path("cosmo-payload.tar.gz"))
args = parser.parse_args()

work = args.work.resolve()
output = args.output.resolve()
binary = work / "cosmo/occt-sidecar"
toolchain_bin = work / "cosmocc/bin"
if not binary.is_file():
    raise SystemExit(f"Missing Cosmopolitan sidecar binary: {binary}")

with tempfile.TemporaryDirectory(prefix="cosmo-payload-", dir=work) as temporary:
    bin_dir = Path(temporary) / "bin"
    bin_dir.mkdir()
    shutil.copy2(binary, bin_dir / "occt-sidecar.exe")
    shutil.copy2(toolchain_bin / "ape-m1.c", bin_dir / "ape-m1.c")
    for name in ("ape-x86_64.elf", "ape-aarch64.elf", "ape-x86_64.macho"):
        matches = list((work / "cosmocc").rglob(name))
        if not matches:
            raise SystemExit(f"Missing Cosmopolitan launcher: {name}")
        shutil.copy2(matches[0], bin_dir / name)

    with tarfile.open(output, "w:gz") as archive:
        for path in sorted(bin_dir.iterdir()):
            archive.add(path, arcname=f"bin/{path.name}")
