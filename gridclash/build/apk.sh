#!/usr/bin/env bash
# Builds a signed, installable APK from the web bundle in dist/.
#
# Deliberately Gradle-free: the app is one Activity and a WebView, so the SDK's
# own tools (aapt2 → javac → d8 → apksigner) do the whole job with no plugin
# resolution and no network.
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
SDK="${ANDROID_HOME:-/opt/android-sdk}"
API=34
BT="$SDK/build-tools/34.0.0"
JAR="$SDK/platforms/android-$API/android.jar"
OUT="$ROOT/build/apk-work"
DIST="$ROOT/dist"
APK="$DIST/grid-clash.apk"

for tool in "$BT/aapt2" "$BT/d8" "$BT/zipalign" "$BT/apksigner" "$JAR"; do
  [ -e "$tool" ] || { echo "missing: $tool" >&2; exit 1; }
done
[ -f "$DIST/index.html" ] || { echo "run 'node build/build.mjs' first" >&2; exit 1; }

rm -rf "$OUT"
mkdir -p "$OUT/compiled" "$OUT/classes" "$OUT/gen" "$ROOT/android/assets"

echo "-> staging web bundle"
cp "$DIST/index.html" "$ROOT/android/assets/index.html"

echo "-> aapt2 compile"
"$BT/aapt2" compile --dir "$ROOT/android/res" -o "$OUT/compiled/res.zip"

echo "-> aapt2 link"
"$BT/aapt2" link \
  -I "$JAR" \
  --manifest "$ROOT/android/AndroidManifest.xml" \
  -A "$ROOT/android/assets" \
  --java "$OUT/gen" \
  --min-sdk-version 24 \
  --target-sdk-version "$API" \
  --version-code 1 --version-name 1.0 \
  -o "$OUT/base.apk" \
  "$OUT/compiled/res.zip"

echo "-> javac"
find "$ROOT/android/java" "$OUT/gen" -name '*.java' > "$OUT/sources.txt"
javac -nowarn -encoding UTF-8 -source 8 -target 8 -bootclasspath "$JAR" \
  -classpath "$JAR" -d "$OUT/classes" @"$OUT/sources.txt" 2>&1 |
  grep -v 'bootstrap class path\|source value 8\|target value 8\|deprecat' || true

echo "-> d8"
find "$OUT/classes" -name '*.class' > "$OUT/classes.txt"
"$BT/d8" --release --min-api 24 --lib "$JAR" \
  --output "$OUT" @"$OUT/classes.txt"

echo "-> package"
cp "$OUT/base.apk" "$OUT/unsigned.apk"
(cd "$OUT" && zip -q -X "unsigned.apk" classes.dex)

echo "-> zipalign"
"$BT/zipalign" -f -p 4 "$OUT/unsigned.apk" "$OUT/aligned.apk"

KS="$ROOT/build/release.keystore"
if [ ! -f "$KS" ]; then
  echo "-> generating signing key"
  keytool -genkeypair -v -keystore "$KS" -storepass gridclash -keypass gridclash \
    -alias gridclash -keyalg RSA -keysize 2048 -validity 10950 \
    -dname "CN=Grid Clash, OU=Game, O=Grid Clash, L=, S=, C=" 2>/dev/null
fi

echo "-> sign"
"$BT/apksigner" sign --ks "$KS" --ks-pass pass:gridclash --key-pass pass:gridclash \
  --v1-signing-enabled true --v2-signing-enabled true --v3-signing-enabled true \
  --out "$APK" "$OUT/aligned.apk"

"$BT/apksigner" verify --print-certs "$APK" | head -3
echo
echo "APK: $APK  ($(du -h "$APK" | cut -f1))"
