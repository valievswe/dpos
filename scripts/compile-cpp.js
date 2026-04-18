// scripts/compile-cpp.js
// Compiles the C++ printer binaries into resources/bin/
// Requires g++ (MinGW) to be in PATH on Windows.
// Run:  node scripts/compile-cpp.js
// Or via npm:  npm run compile:cpp

'use strict'

const { spawnSync } = require('child_process')
const path = require('path')
const fs = require('fs')

const root = path.resolve(__dirname, '..')
const binDir = path.join(root, 'resources', 'bin')

// ── helpers ──────────────────────────────────────────────────────────────────

function ensureDir(dir) {
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true })
}

function compile(label, src, out, flags) {
  console.log(`\nCompiling ${label}...`)
  console.log(`  ${src} → ${out}`)

  const result = spawnSync('g++', [src, '-o', out, ...flags, '-std=c++17', '-O2'], {
    stdio: 'inherit',
    shell: true,
    cwd: root
  })

  if (result.error) {
    console.error(`\n[ERROR] Could not launch g++: ${result.error.message}`)
    console.error('Make sure MinGW/g++ is installed and in your PATH.')
    console.error('Download: https://www.mingw-w64.org/')
    process.exit(1)
  }

  if (result.status !== 0) {
    console.error(`\n[ERROR] Compilation failed for ${label} (exit ${result.status})`)
    process.exit(1)
  }

  console.log(`  ✓ ${path.basename(out)} compiled`)
}

// ── main ─────────────────────────────────────────────────────────────────────

if (process.platform !== 'win32') {
  console.log('Skipping C++ compilation: not on Windows (printer binaries are Windows-only)')
  process.exit(0)
}

ensureDir(binDir)

// receipt2.exe — ESC/POS raw receipt printer (no GDI+ needed)
compile(
  'receipt2.exe',
  path.join(root, 'receipt2.cpp'),
  path.join(binDir, 'receipt2.exe'),
  ['-lwinspool', '-lshell32']
)

// label.exe — GDI+ barcode label printer
compile(
  'label.exe',
  path.join(root, 'labelc.cpp'),
  path.join(binDir, 'label.exe'),
  ['-DUNICODE', '-D_UNICODE', '-lgdiplus', '-lgdi32', '-lwinspool', '-mwindows']
)

console.log('\nAll binaries compiled successfully → resources/bin/')
