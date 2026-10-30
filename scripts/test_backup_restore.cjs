/**
 * End-to-end Backup & Restore Verification Script (F21)
 * Uses native psql and powershell scripts to ensure 0 external npm dependencies.
 */
const { execSync, execFileSync } = require('child_process');
const path = require('path');
const fs = require('fs');

function findPsql() {
  const candidates = [
    'D:\\Postgre SQL\\18\\bin\\psql.exe',
    'C:\\Program Files\\PostgreSQL\\18\\bin\\psql.exe',
    'C:\\Program Files\\PostgreSQL\\17\\bin\\psql.exe',
    'C:\\Program Files\\PostgreSQL\\16\\bin\\psql.exe',
  ];
  for (const cand of candidates) {
    if (fs.existsSync(cand)) return cand;
  }
  return 'psql';
}

const PSQL_BIN = findPsql();

function runPsql(db, sql) {
  const out = execFileSync(
    PSQL_BIN,
    ['-h', 'localhost', '-p', '5432', '-U', 'postgres', '-d', db, '-t', '-c', sql],
    {
      env: { ...process.env, PGPASSWORD: 'dhiraj' },
      encoding: 'utf8',
    }
  );
  return out.trim();
}

async function run() {
  console.log('=== PlukIt Backup & Restore Verification ===');

  const rootDir = path.resolve(__dirname, '..');
  const backupDir = path.resolve(rootDir, 'backups');
  if (!fs.existsSync(backupDir)) {
    fs.mkdirSync(backupDir, { recursive: true });
  }

  // 1. Run backup_db.ps1
  console.log('\n[1/4] Running scripts/backup_db.ps1...');
  const psBackupCmd = `powershell -ExecutionPolicy Bypass -File "${path.join(__dirname, 'backup_db.ps1')}"`;
  const backupOutput = execSync(psBackupCmd, { encoding: 'utf8' });
  console.log(backupOutput.trim());

  // Find the generated backup file
  const backupFiles = fs.readdirSync(backupDir)
    .filter(f => f.startsWith('db_backup_') && f.endsWith('.sql'))
    .sort()
    .reverse();

  if (backupFiles.length === 0) {
    throw new Error('No backup file found in ' + backupDir);
  }
  const latestBackup = path.join(backupDir, backupFiles[0]);
  const stats = fs.statSync(latestBackup);
  console.log(`Verified backup file: ${latestBackup} (${(stats.size / 1024).toFixed(1)} KB)`);

  // 2. Prepare test database plukit_restore_test
  console.log('\n[2/4] Setting up test database: plukit_restore_test...');
  runPsql('delivery_app', 'DROP DATABASE IF EXISTS plukit_restore_test;');
  runPsql('delivery_app', 'CREATE DATABASE plukit_restore_test;');
  console.log('Created fresh test database: plukit_restore_test');

  // 3. Run restore_db.ps1
  console.log('\n[3/4] Restoring backup into plukit_restore_test...');
  const psRestoreCmd = `powershell -ExecutionPolicy Bypass -File "${path.join(__dirname, 'restore_db.ps1')}" -BackupFile "${latestBackup}" -TargetDb "plukit_restore_test" -Force`;
  const restoreOutput = execSync(psRestoreCmd, { encoding: 'utf8' });
  console.log(restoreOutput.trim());

  // 4. Verify contents in plukit_restore_test
  console.log('\n[4/4] Verifying restored schema and data in plukit_restore_test...');
  const userCount = runPsql('plukit_restore_test', 'SELECT count(*) FROM users;');
  const prodCount = runPsql('plukit_restore_test', 'SELECT count(*) FROM products;');
  const catCount = runPsql('plukit_restore_test', 'SELECT count(*) FROM categories;');
  const shopCount = runPsql('plukit_restore_test', 'SELECT count(*) FROM shops;');
  const settingCount = runPsql('plukit_restore_test', 'SELECT count(*) FROM settings;');

  console.log(`Restored users count:      ${userCount}`);
  console.log(`Restored products count:   ${prodCount}`);
  console.log(`Restored categories count: ${catCount}`);
  console.log(`Restored shops count:      ${shopCount}`);
  console.log(`Restored settings count:   ${settingCount}`);

  if (parseInt(prodCount, 10) < 1) {
    throw new Error('Restored product count is 0, backup integrity check failed!');
  }

  // Clean up test database
  runPsql('delivery_app', 'DROP DATABASE IF EXISTS plukit_restore_test;');
  console.log('Cleaned up plukit_restore_test database.');

  console.log('\n✅ ALL BACKUP & RESTORE CHECKS PASSED SUCCESSFULLY!');
}

run().catch((err) => {
  console.error('\n❌ Backup & Restore check failed:', err);
  process.exit(1);
});
