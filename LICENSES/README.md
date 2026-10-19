# Licenses

CAD MCP Server is MIT licensed; see [`../LICENSE`](../LICENSE).

The published package bundles a native sidecar built from these components:

| Component               | Version | License  | Text                                             |
| ----------------------- | ------- | -------- | ------------------------------------------------ |
| Open CASCADE Technology | 8.0.1   | LGPL-2.1 | [`LGPL-2.1.txt`](LGPL-2.1.txt)                   |
| Cosmopolitan libc       | 4.0.2   | ISC      | [`ISC-Cosmopolitan.txt`](ISC-Cosmopolitan.txt)   |
| nlohmann/json           | 3.12.0  | MIT      | [`MIT-nlohmann-json.txt`](MIT-nlohmann-json.txt) |

The sidecar embeds OCCT, Cosmopolitan libc, and `json.hpp`. The corresponding
source for the bundled OCCT build is the upstream [V8.0.1
release](https://github.com/Open-Cascade-SAS/OCCT/releases/tag/V8.0.1), together
with the patches and build scripts in [`occt/sidecar`](../occt/sidecar).
Cosmopolitan and nlohmann/json sources are available at their upstream
repositories.
