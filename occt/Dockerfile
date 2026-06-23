# syntax=docker/dockerfile:1
FROM occt-wasm-builder

RUN apt-get update && apt-get install -y --no-install-recommends \
    binaryen ccache curl \
    && rm -rf /var/lib/apt/lists/*

ENV CCACHE_DIR=/cache/ccache
ENV CC="ccache gcc"
ENV CXX="ccache g++"
ENV EM_COMPILER_WRAPPER=ccache
ARG ENABLE_WASM_OPT=0
ENV ENABLE_WASM_OPT=${ENABLE_WASM_OPT}

COPY rust-toolchain.toml /tmp/rust-toolchain.toml
RUN curl --proto '=https' --tlsv1.2 -sSf https://sh.rustup.rs | \
    sh -s -- -y --default-toolchain "$(grep channel /tmp/rust-toolchain.toml | cut -d'"' -f2)" \
    && rm /tmp/rust-toolchain.toml
ENV PATH="/root/.cargo/bin:${PATH}"

WORKDIR /workspace

COPY ts/package.json ts/package-lock.json* ts/
RUN cd ts && (npm ci 2>/dev/null || npm install)

COPY Cargo.toml Cargo.lock* ./
COPY codegen/Cargo.toml codegen/Cargo.toml
COPY codegen/src codegen/src
RUN cd codegen && cargo build --release

COPY facade/ facade/
COPY scripts/ scripts/
COPY ts/src/ ts/src/
COPY ts/tsconfig.json ts/eslint.config.js ts/vitest.config.ts ts/

RUN --mount=type=cache,target=/cache/ccache \
    cd codegen && cargo run --release \
    && bash /workspace/scripts/build-wasm.sh \
    && echo "WASM size: $(du -h /workspace/dist/occt-wasm.wasm | cut -f1)"

COPY ts/scripts/ ts/scripts/
RUN cd ts && npm run build
