#!/usr/bin/env node
const fs = require('fs');
const path = require('path');

function copyRecursiveSync(src, dest) {
  const exists = fs.existsSync(src);
  const stats = exists && fs.statSync(src);
  const isDirectory = exists && stats.isDirectory();
  
  if (isDirectory) {
    if (!fs.existsSync(dest)) {
      fs.mkdirSync(dest, { recursive: true });
    }
    fs.readdirSync(src).forEach(function(childItemName) {
      copyRecursiveSync(path.join(src, childItemName), path.join(dest, childItemName));
    });
  } else {
    fs.copyFileSync(src, dest);
  }
}

const srcDir = path.join(__dirname, '../src/postgresql/generated');
const destDir = path.join(__dirname, '../dist/postgresql/generated');

console.log('Copying Prisma generated files...');
console.log('From:', srcDir);
console.log('To:', destDir);

if (fs.existsSync(srcDir)) {
  copyRecursiveSync(srcDir, destDir);
  console.log('✅ Prisma generated files copied successfully');
} else {
  console.log('⚠️  Prisma generated files not found at:', srcDir);
  process.exit(1);
}