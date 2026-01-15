#!/usr/bin/env node

/**
 * Security Audit Script
 * 
 * Scans the codebase for security vulnerabilities:
 * - Hardcoded secrets (API keys, tokens, passwords)
 * - Exposed service role keys in frontend code
 * - Unsafe environment variable usage
 * - Console logs that might expose sensitive data
 * 
 * Run with: node scripts/security-audit.js
 */

import fs from 'fs';
import path from 'path';

const ISSUES = {
  CRITICAL: [],
  HIGH: [],
  MEDIUM: [],
  LOW: [],
};

// Patterns to detect hardcoded secrets
const SECRET_PATTERNS = [
  // Supabase service role keys (JWT format)
  /eyJ[a-zA-Z0-9_-]+\.eyJ[a-zA-Z0-9_-]+\.[a-zA-Z0-9_-]+/g,
  // API keys (common formats)
  /['"](?:api[_-]?key|apikey|api_key)['"]\s*[:=]\s*['"]([^'"]{20,})['"]/gi,
  // JWT secrets
  /['"]jwt[_-]?secret['"]\s*[:=]\s*['"]([^'"]+)['"]/gi,
  // Database passwords
  /['"]password['"]\s*[:=]\s*['"]([^'"]{8,})['"]/gi,
  // Service role mentions with hardcoded values
  /service[_-]?role[_-]?key['"]\s*[:=]\s*['"]([^'"]{20,})['"]/gi,
];

// Files/directories to exclude from scanning
const EXCLUDE_PATTERNS = [
  /node_modules/,
  /\.git/,
  /dist/,
  /build/,
  /\.next/,
  /coverage/,
  /\.cursor/,
  /\.vscode/,
  /\.idea/,
  /\.env/,
  /\.env\./,
  /lock/,
  /\.log$/,
  /\.md$/,
  /\.sql$/,
  /\.json$/,
  /\.lockb$/,
];

// Files that should never contain secrets
const FRONTEND_PATHS = [
  /^src\//,
  /^public\//,
];

// Check if file should be scanned
function shouldScanFile(filePath) {
  const relativePath = path.relative(process.cwd(), filePath);
  
  for (const pattern of EXCLUDE_PATTERNS) {
    if (pattern.test(relativePath) || pattern.test(filePath)) {
      return false;
    }
  }
  
  return true;
}

// Check if file is frontend code
function isFrontendFile(filePath) {
  const relativePath = path.relative(process.cwd(), filePath);
  
  for (const pattern of FRONTEND_PATHS) {
    if (pattern.test(relativePath)) {
      return true;
    }
  }
  
  return false;
}

// Scan file for security issues
function scanFile(filePath) {
  if (!shouldScanFile(filePath)) {
    return;
  }
  
  try {
    const content = fs.readFileSync(filePath, 'utf8');
    const relativePath = path.relative(process.cwd(), filePath);
    const isFrontend = isFrontendFile(filePath);
    
    // Check for hardcoded secrets
    for (const pattern of SECRET_PATTERNS) {
      const matches = content.match(pattern);
      if (matches) {
        matches.forEach(match => {
          ISSUES.CRITICAL.push({
            file: relativePath,
            issue: 'Hardcoded secret detected',
            match: match.substring(0, 50) + '...',
            severity: 'CRITICAL',
          });
        });
      }
    }
    
    // Check for service role key in frontend code
    if (isFrontend) {
      if (content.includes('SERVICE_ROLE_KEY') || content.includes('service_role')) {
        ISSUES.CRITICAL.push({
          file: relativePath,
          issue: 'Service role key reference in frontend code',
          match: 'Service role keys must NEVER be exposed to frontend',
          severity: 'CRITICAL',
        });
      }
      
      // Check for process.env.SUPABASE_SERVICE_ROLE_KEY in frontend
      if (content.includes('process.env.SUPABASE_SERVICE_ROLE_KEY') || 
          content.includes('import.meta.env.SUPABASE_SERVICE_ROLE_KEY') ||
          content.includes('VITE_SUPABASE_SERVICE_ROLE_KEY')) {
        ISSUES.CRITICAL.push({
          file: relativePath,
          issue: 'Service role key environment variable in frontend code',
          match: 'Service role keys must only be used in backend/server code',
          severity: 'CRITICAL',
        });
      }
    }
    
    // Check for weak JWT secrets
    if (content.includes('development-secret') || content.includes('change-in-production')) {
      ISSUES.HIGH.push({
        file: relativePath,
        issue: 'Weak default JWT secret detected',
        match: 'JWT secrets must be strong random strings in production',
        severity: 'HIGH',
      });
    }
    
    // Check for console.log with potentially sensitive data
    const consoleLogPattern = /console\.(log|warn|error|info)\([^)]*\)/g;
    const consoleMatches = content.match(consoleLogPattern);
    if (consoleMatches && isFrontend) {
      consoleMatches.forEach(match => {
        if (match.includes('key') || match.includes('secret') || match.includes('token') || match.includes('password')) {
          ISSUES.MEDIUM.push({
            file: relativePath,
            issue: 'Console log may expose sensitive data',
            match: match.substring(0, 80),
            severity: 'MEDIUM',
          });
        }
      });
    }
    
  } catch (error) {
    // Skip files that can't be read (binary files, etc.)
  }
}

// Recursively scan directory
function scanDirectory(dirPath) {
  try {
    const entries = fs.readdirSync(dirPath, { withFileTypes: true });
    
    for (const entry of entries) {
      const fullPath = path.join(dirPath, entry.name);
      
      if (entry.isDirectory()) {
        scanDirectory(fullPath);
      } else if (entry.isFile()) {
        scanFile(fullPath);
      }
    }
  } catch (error) {
    // Skip directories that can't be read
  }
}

// Check build output for exposed secrets
function checkBuildOutput() {
  const distPath = path.join(process.cwd(), 'dist');
  
  if (!fs.existsSync(distPath)) {
    console.log('⚠️  Build output not found. Run "npm run build" first to check production bundle.');
    return;
  }
  
  console.log('\n📦 Checking production build output...');
  scanDirectory(distPath);
}

// Main execution
console.log('🔍 Starting security audit...\n');

// Scan source code
console.log('📁 Scanning source code...');
scanDirectory(path.join(process.cwd(), 'src'));
scanDirectory(path.join(process.cwd(), 'backend'));

// Check build output
checkBuildOutput();

// Report results
console.log('\n' + '='.repeat(60));
console.log('SECURITY AUDIT RESULTS');
console.log('='.repeat(60));

let totalIssues = 0;

if (ISSUES.CRITICAL.length > 0) {
  console.log(`\n❌ CRITICAL ISSUES (${ISSUES.CRITICAL.length}):`);
  ISSUES.CRITICAL.forEach(issue => {
    console.log(`  • ${issue.file}`);
    console.log(`    ${issue.issue}`);
    console.log(`    Match: ${issue.match}`);
    console.log('');
  });
  totalIssues += ISSUES.CRITICAL.length;
}

if (ISSUES.HIGH.length > 0) {
  console.log(`\n⚠️  HIGH PRIORITY ISSUES (${ISSUES.HIGH.length}):`);
  ISSUES.HIGH.forEach(issue => {
    console.log(`  • ${issue.file}`);
    console.log(`    ${issue.issue}`);
    console.log('');
  });
  totalIssues += ISSUES.HIGH.length;
}

if (ISSUES.MEDIUM.length > 0) {
  console.log(`\n⚠️  MEDIUM PRIORITY ISSUES (${ISSUES.MEDIUM.length}):`);
  ISSUES.MEDIUM.slice(0, 10).forEach(issue => {
    console.log(`  • ${issue.file}`);
    console.log(`    ${issue.issue}`);
    console.log('');
  });
  if (ISSUES.MEDIUM.length > 10) {
    console.log(`  ... and ${ISSUES.MEDIUM.length - 10} more`);
  }
  totalIssues += ISSUES.MEDIUM.length;
}

if (totalIssues === 0) {
  console.log('\n✅ No security issues detected!');
  console.log('\n💡 Remember to:');
  console.log('   • Run this audit before each production deployment');
  console.log('   • Verify RLS policies are enabled on all tables');
  console.log('   • Test network request replay in Chrome DevTools');
  console.log('   • Ensure no secrets in VITE_* environment variables');
  process.exit(0);
} else {
  console.log(`\n❌ Found ${totalIssues} security issue(s) that need attention.`);
  console.log('\n💡 Fix these issues before deploying to production.');
  process.exit(1);
}

