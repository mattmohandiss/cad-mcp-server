# Third-Party Notices

CAD MCP Server bundles a WebAssembly geometry kernel built from Open CASCADE Technology through the local `occt-wasm` package.

## Open CASCADE Technology

- Project: Open CASCADE Technology
- Website: https://dev.opencascade.org/
- License: GNU Lesser General Public License version 2.1

Open CASCADE Technology is used for STEP import and geometric/topological measurement. The bundled WebAssembly artifact is distributed as part of the `occt-wasm` runtime included in this npm package.

## occt-wasm

- Package: `occt-wasm`
- License: MIT OR Apache-2.0

This project uses a stripped local build of `occt-wasm` focused on read-only STEP inspection.

Review the upstream license terms before redistributing modified kernel builds or embedding this package in another commercial distribution.
