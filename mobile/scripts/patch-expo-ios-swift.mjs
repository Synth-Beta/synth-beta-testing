/**
 * Expo iOS Swift files sometimes call React Native C/ObjC APIs (RCTSharedApplication,
 * RCTFatal, RCTErrorWithMessage) that are not in scope during New Architecture archive
 * builds. Patch known call sites with Swift-native equivalents.
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

  patched = patched.replace(
    /RCTFatal\s*\(\s*RCTErrorWithMessage\s*\(([\s\S]*?)\)\s*\)/g,
    'fatalError($1)',
  );

  patched = patched.replace(
    /EXFatal\s*\(\s*EXErrorWithMessage\s*\(([\s\S]*?)\)\s*\)/g,
    'fatalError($1)',
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

if (patchedCount > 0) {
  console.log(`[patch-expo-ios-swift] applied ${patchedCount} patch(es)`);
}
