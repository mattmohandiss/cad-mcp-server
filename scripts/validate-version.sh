#!/usr/bin/env bash
set -euo pipefail

echo "═══ Version sync validation ═══"
echo ""

pkg_version=$(node -e "console.log(require('./package.json').version)")
server_version=$(node -e "console.log(require('./server.json').version)")
server_pkg_version=$(node -e "console.log(require('./server.json').packages[0].version)")

fail=0

if [ "$server_version" != "$pkg_version" ]; then
    echo "❌ server.json version ($server_version) != package.json version ($pkg_version)"
    fail=1
else
    echo "✅ server.json version matches package.json: $pkg_version"
fi

if [ "$server_pkg_version" != "$pkg_version" ]; then
    echo "❌ server.json packages[0].version ($server_pkg_version) != package.json version ($pkg_version)"
    fail=1
else
    echo "✅ server.json packages[0].version matches package.json: $pkg_version"
fi

echo ""
if [ $fail -eq 0 ]; then
    echo "═══ All version checks passed. ═══"
else
    echo "═══ Version mismatch detected. Run: node -e 'const fs=require(\"fs\");const s=JSON.parse(fs.readFileSync(\"server.json\",\"utf8\"));const p=require(\"./package.json\");s.version=p.version;s.packages[0].version=p.version;fs.writeFileSync(\"server.json\",JSON.stringify(s,null,2)+\"\\n\")' ═══"
    exit 1
fi
