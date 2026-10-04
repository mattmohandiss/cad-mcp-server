#!/usr/bin/env python3
"""Download pinned inputs and build the native or multi-OS Cosmopolitan sidecar."""
import argparse
import hashlib
import os
from pathlib import Path
import shutil
import stat
import subprocess
import tarfile
import urllib.request
import zipfile

parser=argparse.ArgumentParser()
parser.add_argument('variant',choices=['native','cosmo'])
parser.add_argument('--jobs',type=int,default=4)
parser.add_argument('--work',type=Path,default=Path('build-work'))
parser.add_argument('--build-dir',type=Path)
parser.add_argument('--also-static',action='store_true',help='also link the native fully static executable')
args=parser.parse_args()
repo=Path(__file__).resolve().parents[1]
work=args.work.resolve();work.mkdir(parents=True,exist_ok=True)
build=(args.build_dir.resolve() if args.build_dir else work/args.variant)

def download(url,path,expected=None):
    if not path.exists():
        temporary=path.with_suffix(path.suffix+'.partial')
        urllib.request.urlretrieve(url,temporary)
        temporary.replace(path)
    if expected:
        with path.open('rb') as f:actual=hashlib.file_digest(f,'sha256').hexdigest()
        if actual!=expected:raise RuntimeError(f'Checksum mismatch: {path}')

source_archive=work/'occt-8.0.1-source.tar.gz'
bundled=repo/'vendor/occt-8.0.1-source.tar.gz'
if bundled.exists() and not source_archive.exists():
    import shutil
    shutil.copyfile(bundled,source_archive)
download('https://api.github.com/repos/Open-Cascade-SAS/OCCT/tarball/V8.0.1',source_archive,
         '6c55c0e7ed8262b5598260f44905c702b85fcd297732c955ae76f583bd380807')
source=work/'Open-Cascade-SAS-OCCT-b8f597c'
if not source.exists():
    with tarfile.open(source_archive) as archive:archive.extractall(work,filter='data')
subprocess.run(['python3',str(repo/'scripts/patch_occt.py'),str(source)],check=True)
json_header=work/'json.hpp'
if (repo/'vendor/json.hpp').exists() and not json_header.exists():
    import shutil
    shutil.copyfile(repo/'vendor/json.hpp',json_header)
download('https://raw.githubusercontent.com/nlohmann/json/v3.12.0/single_include/nlohmann/json.hpp',json_header,
         'aaf127c04cb31c406e5b04a63f1ae89369fccde6d8fa7cdda1ed4f32dfc5de63')
command=['cmake','-S',str(repo),'-B',str(build),'-G','Ninja',
         '-DCMAKE_BUILD_TYPE=Release','-DCMAKE_POLICY_VERSION_MINIMUM=3.5',
         f'-DOCCT_SOURCE_DIR={source}',f'-DJSON_INCLUDE_DIR={work}']
ccache=shutil.which('ccache')
if ccache:
    command += [f'-DCMAKE_C_COMPILER_LAUNCHER={ccache}',
                f'-DCMAKE_CXX_COMPILER_LAUNCHER={ccache}']
if args.variant=='cosmo':
    toolchain_archive=work/'cosmocc-4.0.2.zip'
    download('https://github.com/jart/cosmopolitan/releases/download/4.0.2/cosmocc-4.0.2.zip',toolchain_archive,
             '85b8c37a406d862e656ad4ec14be9f6ce474c1b436b9615e91a55208aced3f44')
    toolchain=work/'cosmocc'
    if not (toolchain/'bin/cosmocc').exists():
        with zipfile.ZipFile(toolchain_archive) as archive:
            archive.extractall(toolchain)
            for entry in archive.infolist():
                path=toolchain/entry.filename
                mode=entry.external_attr>>16
                if stat.S_ISLNK(mode):
                    path.unlink();path.symlink_to(archive.read(entry).decode())
                elif path.is_file() and mode & 0o111:path.chmod(0o755)
    command += [f'-DCMAKE_TOOLCHAIN_FILE={repo}/cmake/cosmopolitan.cmake',f'-DCOSMO_ROOT={toolchain}']
subprocess.run(command,check=True)
targets=['occt-sidecar']
if args.variant=='native' and args.also_static:
    targets.append('occt-sidecar-static')
subprocess.run(['cmake','--build',str(build),'--parallel',str(args.jobs),'--target',*targets],check=True)
print(f'Built under {build}')
