/**
 * Expo iOS Swift files sometimes call React Native C/ObjC APIs (RCTSharedApplication,
 * RCTFatal, RCTErrorWithMessage) that are not in scope during New Architecture archive
 * builds. Patch known call sites with Swift-native equivalents.
 *
 * Also patches upstream availability bugs: Expo pods occasionally call an API newer
 * than the deployment target their own podspec declares, which fails the archive.
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const mobileRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const nodeModules = path.join(mobileRoot, 'node_modules');

function applyPatches(content) {
  let patched = content;

  patched = patched.replaceAll(
    'RCTSharedApplication()?.applicationIconBadgeNumber',
    'UIApplication.shared.applicationIconBadgeNumber',
  );

  patched = patched.replaceAll(
    /RCTFatal\s*\(\s*RCTErrorWithMessage\s*\(([\s\S]*?)\)\s*\)/g,
    'fatalError($1)',
  );

  patched = patched.replaceAll(
    /EXFatal\s*\(\s*EXErrorWithMessage\s*\(([\s\S]*?)\)\s*\)/g,
    'fatalError($1)',
  );

  // expo-router 55.0.5 assigns `UIAction.subtitle` with no availability guard in
  // LinkPreview/LinkPreviewNativeActionView.swift. `subtitle` is inherited from
  // UIMenuElement and is iOS 16.0+, but ExpoRouter.podspec still declares
  // :ios => '15.1', so the archive fails with:
  //   'subtitle' is only available in iOS 16.0 or newer
  //
  // The sibling `menuAction.subtitle` write a few lines above is UIMenu.subtitle,
  // which is iOS 15.0+ and compiles fine - it is deliberately left alone, since
  // guarding it too would drop menu subtitles on iOS 15 for no reason.
  //
  // Matched as an exact literal, so re-running is a no-op: after the first pass the
  // body is re-indented and this pattern no longer matches. (CI runs this twice.)
  patched = patched.replace(
    `    if let subtitle = subtitle {
      baseUiAction.subtitle = subtitle
    }`,
    `    if #available(iOS 16.0, *) {
      if let subtitle = subtitle {
        baseUiAction.subtitle = subtitle
      }
    }`,
  );

  return patched;
}

function patchFile(filePath, label) {
  if (!fs.existsSync(filePath)) {
    return false;
  }

  const original = fs.readFileSync(filePath, 'utf8');
  const patched = applyPatches(original);
  if (patched === original) {
    return false;
  }

  fs.writeFileSync(filePath, patched);
  console.log(`[patch-expo-ios-swift] patched ${label}`);
  return true;
}

function walkSwiftFiles(dir, results = []) {
  if (!fs.existsSync(dir)) {
    return results;
  }

  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const fullPath = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      walkSwiftFiles(fullPath, results);
    } else if (entry.name.endsWith('.swift')) {
      results.push(fullPath);
    }
  }

  return results;
}

const knownFiles = [
  'expo-notifications/ios/ExpoNotifications/Badge/BadgeModule.swift',
  'expo-image-picker/ios/ImagePickerPermissionRequesters.swift',
  // Listed explicitly: the generic sweep below only visits files containing
  // RCTFatal/RCTSharedApplication/EXFatal, and this one has none of them.
  'expo-router/ios/LinkPreview/LinkPreviewNativeActionView.swift',
];

let patchedCount = 0;

for (const relPath of knownFiles) {
  if (patchFile(path.join(nodeModules, relPath), relPath)) {
    patchedCount += 1;
  }
}

if (fs.existsSync(nodeModules)) {
  for (const pkg of fs.readdirSync(nodeModules)) {
    if (!pkg.startsWith('expo-') && pkg !== 'expo') {
      continue;
    }

    for (const swiftFile of walkSwiftFiles(path.join(nodeModules, pkg))) {
      const relPath = path.relative(nodeModules, swiftFile).replace(/\\/g, '/');
      if (knownFiles.includes(relPath)) {
        continue;
      }

      const original = fs.readFileSync(swiftFile, 'utf8');
      if (
        !original.includes('RCTFatal') &&
        !original.includes('RCTSharedApplication') &&
        !original.includes('EXFatal')
      ) {
        continue;
      }

      if (patchFile(swiftFile, relPath)) {
        patchedCount += 1;
      }
    }
  }
}

// Fail here rather than four minutes into an Xcode Cloud archive. The subtitle patch
// matches an exact literal, so if expo-router reformats or moves that call site the
// replacement silently stops applying and the archive breaks with a compile error.
const linkPreviewActionView = path.join(
  nodeModules,
  'expo-router/ios/LinkPreview/LinkPreviewNativeActionView.swift',
);
if (fs.existsSync(linkPreviewActionView)) {
  const content = fs.readFileSync(linkPreviewActionView, 'utf8');
  const idx = content.indexOf('baseUiAction.subtitle');
  const guarded =
    idx === -1 ||
    content.slice(Math.max(0, idx - 200), idx).includes('#available(iOS 16.0, *)');

  if (!guarded) {
    console.error(
      '[patch-expo-ios-swift] baseUiAction.subtitle is NOT guarded by #available(iOS 16.0, *).\n' +
        "  expo-router changed upstream - update this script's subtitle patch before archiving.",
    );
    process.exit(1);
  }
}

if (patchedCount > 0) {
  console.log(`[patch-expo-ios-swift] applied ${patchedCount} patch(es)`);
}
