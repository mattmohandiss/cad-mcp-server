"""Apply narrow Cosmopolitan compatibility fixes to the pinned OCCT source.

The errno switch fix preserves each OCCT error classification. Cosmopolitan errno
values are runtime constants because values differ between host operating systems.
"""
import sys
import re
from pathlib import Path

root = Path(sys.argv[1])
path = root/'src/FoundationClasses/TKernel/OSD/OSD_Error.cxx'
source = path.read_text()
if 'OCCT_PORTABLE_ERRNO' not in source:
    names = list(dict.fromkeys(re.findall(r'case (E[A-Z0-9_]+):', source)))
    block = '\n// Cosmopolitan host errno numbers are not C++ constant expressions.\n'
    block += '#if defined(__COSMOPOLITAN__)\n'
    for i, name in enumerate(names, 1):
        block += f'#define OCCT_PORTABLE_ERRNO_{name} {i}\n'
    block += '#define OCCT_PORTABLE_ERRNO(x) OCCT_PORTABLE_ERRNO_##x\n'
    block += 'static int OCCT_PortableErrno(int value) {\n'
    for i, name in enumerate(names, 1):
        block += f'#ifdef {name}\n  if (value == {name}) return {i};\n#endif\n'
    block += '  return -1;\n}\n#else\n#define OCCT_PORTABLE_ERRNO(x) x\n'
    block += 'static int OCCT_PortableErrno(int value) { return value; }\n#endif\n'
    source = re.sub(r'case (E[A-Z0-9_]+):', r'case OCCT_PORTABLE_ERRNO(\1):', source)
    source = source.replace('switch (myErrno)', 'switch (OCCT_PortableErrno(myErrno))')
    position = source.index('void OSD_Error::Perror()')
    source = source[:position] + block + '\n' + source[position:]
    path.write_text(source)
    print('Patched OSD_Error.cxx: runtime errno mapping')
source=path.read_text()
updated=source.replace('#ifdef EWOULDBLOCK\n  if (value == EWOULDBLOCK)',
    '#if defined(EWOULDBLOCK) && (defined(SUN) || defined(IRIX4))\n  if (value == EWOULDBLOCK)')
if updated != source:
    path.write_text(updated)

path = root/'src/FoundationClasses/TKernel/OSD/OSD_Path.cxx'
source = path.read_text()
if '// Cosmopolitan provides uname through POSIX headers.' not in source:
    source = '#if defined(__COSMOPOLITAN__)\n// Cosmopolitan provides uname through POSIX headers.\n#include <sys/utsname.h>\n#endif\n' + source
    path.write_text(source)
    print('Patched OSD_Path.cxx: explicit uname header')
source=path.read_text()
if 'Cosmopolitan exposes a POSIX filesystem API on every host.' not in source:
    source=source.replace('#elif defined(__linux__) || defined(__linux)',
        '#elif defined(__COSMOPOLITAN__)\n  // Cosmopolitan exposes a POSIX filesystem API on every host.\n  return OSD_UnixBSD;\n#elif defined(__linux__) || defined(__linux)',1)
    path.write_text(source)
    print('Patched OSD_Path.cxx: select POSIX path syntax')

path = root/'src/FoundationClasses/TKernel/OSD/OSD_Chronometer.cxx'
source = path.read_text()
if 'defined(__COSMOPOLITAN__)' not in source:
    source = source.replace('|| defined(__QNX__)', '|| defined(__QNX__) || defined(__COSMOPOLITAN__)')
    path.write_text(source)
    print('Patched OSD_Chronometer.cxx: POSIX thread CPU clock')

path = root/'src/FoundationClasses/TKernel/OSD/OSD_signal.cxx'
source = path.read_text()
if 'OCCT_PORTABLE_SIGNAL' not in source:
    names = list(dict.fromkeys(re.findall(r'case (SIG[A-Z0-9_]+):', source)))
    block = '\n#if defined(__COSMOPOLITAN__)\n'
    for i, name in enumerate(names,1):
        block += f'#define OCCT_PORTABLE_SIGNAL_{name} {i}\n'
    block += '#define OCCT_PORTABLE_SIGNAL(x) OCCT_PORTABLE_SIGNAL_##x\n'
    block += 'static int OCCT_PortableSignal(int value) {\n'
    for i,name in enumerate(names,1):
        block += f'#ifdef {name}\n  if(value == {name}) return {i};\n#endif\n'
    block += '  return -1;\n}\n#else\n#define OCCT_PORTABLE_SIGNAL(x) x\n'
    block += 'static int OCCT_PortableSignal(int value) { return value; }\n#endif\n'
    source = re.sub(r'case (SIG[A-Z0-9_]+):',r'case OCCT_PORTABLE_SIGNAL(\1):',source)
    source = source.replace('switch (theSignal)','switch (OCCT_PortableSignal(theSignal))')
    source = source.replace('switch (signum)','switch (OCCT_PortableSignal(signum))')
    position=source.index('//================')
    source=source[:position]+block+'\n'+source[position:]
    path.write_text(source)
    print('Patched OSD_signal.cxx: runtime signal mapping')

path = root/'src/FoundationClasses/TKernel/Standard/Standard_StackTrace.cxx'
source = path.read_text()
if 'defined(__COSMOPOLITAN__)' not in source:
    # Use OCCT's existing unsupported-stack-tracing fallback. Geometry is unchanged;
    # the limitation is recorded explicitly in the prototype report.
    source=source.replace('defined(__QNX__)', '(defined(__QNX__) || defined(__COSMOPOLITAN__))')
    path.write_text(source)
    print('Patched Standard_StackTrace.cxx: disable execinfo stack tracing')

path=root/'src/FoundationClasses/TKernel/NCollection/NCollection_IncAllocator.cxx'
source=path.read_text()
if '#include <mutex>' not in source:
    source=source.replace('#include <Standard_OutOfMemory.hxx>','#include <Standard_OutOfMemory.hxx>\n#include <mutex>')
    path.write_text(source)
    print('Patched NCollection_IncAllocator.cxx: explicit standard mutex header')

path=root/'src/Visualization/TKService/Aspect/Aspect_VKeySet.cxx'
source=path.read_text()
if '#include <mutex>' not in source:
    source=source.replace('#include "Aspect_VKeySet.hxx"','#include "Aspect_VKeySet.hxx"\n#include <mutex>')
    path.write_text(source)
    print('Patched Aspect_VKeySet.cxx: explicit standard mutex header')
