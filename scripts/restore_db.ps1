<#
.SYNOPSIS
  PostgreSQL database restore script for PlukIt (F21).
.DESCRIPTION
  Restores a specified or latest .sql backup dump using psql.
.EXAMPLE
  .\scripts\restore_db.ps1 -BackupFile backups\db_backup_20261030_142355.sql -Force
  .\scripts\restore_db.ps1 -TargetDb delivery_app_restore_test -Force
#>

[CmdletBinding()]
param(
    [string]$BackupFile = "",
    [string]$TargetDb = "",
    [string]$DbUrl = "",
    [switch]$Force
)

$ErrorActionPreference = "Stop"

# 1. Resolve Backup File
if ([string]::IsNullOrWhiteSpace($BackupFile)) {
    $candidateDirs = @(
        "$PSScriptRoot\..\backups",
        "delivery-app\backups",
        "backups"
    )
    $backupDir = ""
    foreach ($d in $candidateDirs) {
        if (Test-Path $d) {
            $backupDir = [System.IO.Path]::GetFullPath($d)
            break
        }
    }

    if (-not $backupDir) {
        Write-Error "[RESTORE] Backups directory not found."
    }

    $latest = Get-ChildItem -Path $backupDir -Filter "db_backup_*.sql" | Sort-Object LastWriteTime -Descending | Select-Object -First 1
    if (-not $latest) {
        Write-Error "[RESTORE] No db_backup_*.sql files found in $backupDir."
    }
    $resolvedBackupFile = $latest.FullName
} else {
    $resolvedBackupFile = [System.IO.Path]::GetFullPath($BackupFile)
}

if (-not (Test-Path $resolvedBackupFile)) {
    Write-Error "[RESTORE] Specified backup file does not exist: $resolvedBackupFile"
}

# 2. Resolve Database URL
if ([string]::IsNullOrWhiteSpace($DbUrl)) {
    $candidateEnvs = @(
        "$PSScriptRoot\..\server\.env",
        "delivery-app\server\.env",
        "server\.env",
        ".env"
    )
    $envPath = ""
    foreach ($cand in $candidateEnvs) {
        if (Test-Path $cand) {
            $envPath = [System.IO.Path]::GetFullPath($cand)
            break
        }
    }
    if ($envPath -and (Test-Path $envPath)) {
        $envContent = Get-Content $envPath
        foreach ($line in $envContent) {
            if ($line -match '^\s*DATABASE_URL\s*=\s*["'']?([^"'']+)["'']?') {
                $DbUrl = $matches[1]
                break
            }
        }
    }
    if ([string]::IsNullOrWhiteSpace($DbUrl) -and $env:DATABASE_URL) {
        $DbUrl = $env:DATABASE_URL
    }
}

if ([string]::IsNullOrWhiteSpace($DbUrl)) {
    Write-Error "[RESTORE] DATABASE_URL not found in arguments, server/.env, or environment variables."
}

# 3. Parse DATABASE_URL: postgresql://user:pass@host:port/dbname?schema=public
$regex = '^postgresql:\/\/(?:([^:]+)(?::([^@]+))?@)?([^:\/]+)(?::(\d+))?\/([^?]+)'
if ($DbUrl -match $regex) {
    $pgUser = $matches[1]
    $pgPass = $matches[2]
    $pgHost = $matches[3]
    $pgPort = if ($matches[4]) { $matches[4] } else { "5432" }
    $pgDb   = if ($TargetDb) { $TargetDb } else { $matches[5] }
} else {
    Write-Error "[RESTORE] Unsupported DATABASE_URL format: $DbUrl"
}

# 4. Locate psql executable
$pgPsql = Get-Command "psql" -ErrorAction SilentlyContinue | Select-Object -ExpandProperty Source
if (-not $pgPsql) {
    $candidates = @(
        "D:\Postgre SQL\18\bin\psql.exe",
        "C:\Program Files\PostgreSQL\18\bin\psql.exe",
        "C:\Program Files\PostgreSQL\17\bin\psql.exe",
        "C:\Program Files\PostgreSQL\16\bin\psql.exe",
        "C:\Program Files\PostgreSQL\15\bin\psql.exe"
    )
    foreach ($cand in $candidates) {
        if (Test-Path $cand) {
            $pgPsql = $cand
            break
        }
    }
}

if (-not $pgPsql) {
    Write-Error "[RESTORE] psql executable not found. Please install PostgreSQL client tools or add to PATH."
}

# 5. Confirmation Prompt
Write-Host "[RESTORE] Backup target file: $resolvedBackupFile" -ForegroundColor Cyan
Write-Host "[RESTORE] Destination database: ${pgHost}:${pgPort}/${pgDb} as user '$pgUser'" -ForegroundColor Yellow

if (-not $Force) {
    $confirmation = Read-Host "CAUTION: This will overwrite tables in '${pgDb}'. Type 'YES' to proceed"
    if ($confirmation -ne "YES") {
        Write-Host "[RESTORE] Operation cancelled by user." -ForegroundColor Red
        exit 0
    }
}

# 6. Execute Restore via psql
Write-Host "[RESTORE] Restoring database from $resolvedBackupFile..." -ForegroundColor Cyan
$env:PGPASSWORD = $pgPass
try {
    $arguments = @(
        "-h", $pgHost,
        "-p", $pgPort,
        "-U", $pgUser,
        "-d", $pgDb,
        "-f", $resolvedBackupFile
    )

    & $pgPsql $arguments
    if ($LASTEXITCODE -ne 0) {
        throw "psql restore process failed with exit code $LASTEXITCODE"
    }

    Write-Host "[RESTORE] SUCCESS: Database '$pgDb' successfully restored from backup." -ForegroundColor Green
} finally {
    $env:PGPASSWORD = ""
}
