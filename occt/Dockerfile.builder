# syntax=docker/dockerfile:1
# Pre-built OCCT 8.0.0 static libs for local/CI wasm builds.
# Rebuild only when OCCT commit, emsdk version, or toolkit set changes.

FROM emscripten/emsdk:5.0.3

ARG OCCT_REPO=https://github.com/andymai/OCCT.git
ARG OCCT_COMMIT=77aef4a6b51a981c0ae4485628a24f02cc410404
ARG OCCT_TOOLKITS="TKernel;TKMath;TKG2d;TKG3d;TKGeomBase;TKBRep;TKGeomAlgo;TKTopAlgo;TKMesh;TKShHealing;TKXSBase;TKDESTEP;TKDESTL"

RUN apt-get update && apt-get install -y --no-install-recommends \
    ca-certificates cmake git ninja-build \
    && rm -rf /var/lib/apt/lists/*

WORKDIR /workspace

RUN git init occt-src \
    && cd occt-src \
    && git remote add origin "${OCCT_REPO}" \
    && git fetch --depth 1 origin "${OCCT_COMMIT}" \
    && git checkout --detach FETCH_HEAD

RUN mkdir -p /opt/occt-build && cd /opt/occt-build \
    && emcmake cmake /workspace/occt-src \
        -G Ninja \
        -DCMAKE_BUILD_TYPE=Release \
        -DBUILD_MODULE_FoundationClasses=FALSE \
        -DBUILD_MODULE_ModelingData=FALSE \
        -DBUILD_MODULE_ModelingAlgorithms=FALSE \
        -DBUILD_MODULE_DataExchange=FALSE \
        -DBUILD_MODULE_ApplicationFramework=FALSE \
        -DBUILD_MODULE_Visualization=FALSE \
        -DBUILD_MODULE_Draw=FALSE \
        "-DBUILD_ADDITIONAL_TOOLKITS=${OCCT_TOOLKITS}" \
        -DBUILD_LIBRARY_TYPE=Static \
        -DUSE_FREETYPE=OFF \
        -DUSE_RAPIDJSON=OFF \
        "-DCMAKE_C_FLAGS=-fwasm-exceptions -O3 -msimd128 -DIGNORE_NO_ATOMICS=1 -DOCCT_NO_PLUGINS" \
        "-DCMAKE_CXX_FLAGS=-fwasm-exceptions -O3 -msimd128 -DIGNORE_NO_ATOMICS=1 -DOCCT_NO_PLUGINS" \
        -Wno-dev \
    && cmake --build . --parallel \
    && echo "OCCT: $(ls -1 lin32/clang/lib/*.a 2>/dev/null | wc -l) static libs" \
    && test -d include/opencascade
