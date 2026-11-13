#!/bin/bash
set -euo pipefail
cd "$(dirname "$0")"
app="dist/心晴.app"
mkdir -p "$app/Contents/MacOS" "$app/Contents/Resources/web"
xcrun clang -fobjc-arc -fno-modules -O2 -mmacosx-version-min=13.0 \
  -Wall -Wextra -Werror -Wno-unused-parameter \
  -framework AppKit -framework WebKit -framework ImageIO -framework CoreGraphics -framework UniformTypeIdentifiers \
  App.m Store.m CodexAlerts.m -lsqlite3 -o "$app/Contents/MacOS/MoodSlime"
cp web/index.html web/style.css web/model.js web/physics.js web/pet.js web/expressions.js web/app.js "$app/Contents/Resources/web/"
mkdir -p "$app/Contents/Resources/web/vendor"
cp web/vendor/three.min.js web/vendor/THREE-LICENSE.txt web/vendor/PROVENANCE.json "$app/Contents/Resources/web/vendor/"
cp tests/integration.js "$app/Contents/Resources/integration.js"
cat > "$app/Contents/Info.plist" <<'PLIST'
<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0"><dict>
<key>CFBundleName</key><string>心晴</string>
<key>CFBundleDisplayName</key><string>心晴</string>
<key>CFBundleIdentifier</key><string>local.silovere.moodslime</string>
<key>CFBundleExecutable</key><string>MoodSlime</string>
<key>CFBundlePackageType</key><string>APPL</string>
<key>CFBundleShortVersionString</key><string>0.13.0</string>
<key>CFBundleVersion</key><string>37</string>
<key>LSMinimumSystemVersion</key><string>13.0</string>
<key>NSHighResolutionCapable</key><true/>
<key>NSPrincipalClass</key><string>NSApplication</string>
<key>LSUIElement</key><true/>
</dict></plist>
PLIST
codesign --force --sign - "$app"
fixture="dist/OverlayFixture.app"
mkdir -p "$fixture/Contents/MacOS"
xcrun clang -fobjc-arc -fno-modules -O2 -mmacosx-version-min=13.0 -framework Cocoa tests/fullscreen-fixture.m -o "$fixture/Contents/MacOS/OverlayFixture"
cat > "$fixture/Contents/Info.plist" <<'PLIST'
<?xml version="1.0" encoding="UTF-8"?><plist version="1.0"><dict>
<key>CFBundleIdentifier</key><string>local.silovere.moodslime.overlayfixture</string>
<key>CFBundleExecutable</key><string>OverlayFixture</string>
<key>CFBundleName</key><string>心晴全屏自检</string>
<key>CFBundlePackageType</key><string>APPL</string>
</dict></plist>
PLIST
codesign --force --sign - "$fixture"
printf 'Built: %s/%s\n' "$PWD" "$app"
