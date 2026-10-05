#!/usr/bin/env bash
set -euo pipefail

payload=${1:?usage: build-macos-arm-launcher.sh <cosmo-payload.tar.gz> <output.tar.gz>}
output=${2:?usage: build-macos-arm-launcher.sh <cosmo-payload.tar.gz> <output.tar.gz>}
work=$(mktemp -d)
trap 'rm -rf "$work"' EXIT

mkdir -p "$work/sidecar-payload"
tar -xzf "$payload" -C "$work/sidecar-payload"
cc -O -o "$work/ape-aarch64.macho" "$work/sidecar-payload/bin/ape-m1.c"
tar -czf "$output" -C "$work" ape-aarch64.macho
