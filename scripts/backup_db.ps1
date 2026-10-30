<#
.SYNOPSIS
  Automated PostgreSQL database backup script for PlukIt (F21).
.DESCRIPTION
  Performs a consistent pg_dump of the database, writes a timestamped SQL dump
  to the backups folder, and applies rolling retention policy (default 14 days, range 7-30 days).
.EXAMPLE
  .\scripts\backup_db.ps1
  .\scripts\backup_db.ps1 -RetentionDays 7
#>

[CmdletBinding()]
param(
    [string]$TargetDir = "",
    [int]$RetentionDays = 14,
    [string]$DbUrl = ""
)

$ErrorActionPreference = "Stop"

# 1. Resolve Target Directory
if ([string]::IsNullOrWhiteSpace($TargetDir)) {
    if (Test-Path "$PSScriptRoot\..\backups") {
        $resolvedTargetDir = [System.IO.Path]::GetFullPath("$PSScriptRoot\..\backups")
    } elseif (Test-Path "delivery-app\backups") {
        $resolvedTargetDir = [System.IO.Path]::GetFullPath("delivery-app\backups")
    } elseif (Test-Path "backups") {
        $resolvedTargetDir = [System.IO.Path]::GetFullPath("backups")
    } else {
        $resolvedTargetDir = [System.IO.Path]::GetFullPath("$PSScriptRoot\..\backups")
    }
} else {
    $resolvedTargetDir = [System.IO.Path]::GetFullPath($TargetDir)
}

if (-not (Test-Path $resolvedTargetDir)) {
    New-Item -ItemType Directory -Path $resolvedTargetDir -Force | Out-Null
    Write-Host "[BACKUP] Created backup directory: $resolvedTargetDir" -ForegroundColor Cyan
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
    Write-Error "[BACKUP] DATABASE_URL not found in arguments, server/.env, or environment variables."
}

# 3. Parse DATABASE_URL: postgresql://user:pass@host:port/dbname?schema=public
$regex = '^postgresql:\/\/(?:([^:]+)(?::([^@]+))?@)?([^:\/]+)(?::(\d+))?\/([^?]+)'
if ($DbUrl -match $regex) {
    $pgUser = $matches[1]
    $pgPass = $matches[2]
    $pgHost = $matches[3]
    $pgPort = if ($matches[4]) { $matches[4] } else { "5432" }
    $pgDb   = $matches[5]
} else {
    Write-Error "[BACKUP] Unsupported DATABASE_URL format: $DbUrl"
}

# 4. Locate pg_dump executable
$pgDump = Get-Command "pg_dump" -ErrorAction SilentlyContinue | Select-Object -ExpandProperty Source
if (-not $pgDump) {
    $candidates = @(
        "D:\Postgre SQL\18\bin\pg_dump.exe",
        "C:\Program Files\PostgreSQL\18\bin\pg_dump.exe",
        "C:\Program Files\PostgreSQL\17\bin\pg_dump.exe",
        "C:\Program Files\PostgreSQL\16\bin\pg_dump.exe",
        "C:\Program Files\PostgreSQL\15\bin\pg_dump.exe"
    )
    foreach ($cand in $candidates) {
        if (Test-Path $cand) {
            $pgDump = $cand
            break
        }
    }
}

if (-not $pgDump) {
    Write-Error "[BACKUP] pg_dump executable not found. Please install PostgreSQL client tools or add to PATH."
}

Write-Host "[BACKUP] Using pg_dump: $pgDump" -ForegroundColor Cyan
Write-Host "[BACKUP] Connecting to: ${pgHost}:${pgPort}/${pgDb} as user '$pgUser'" -ForegroundColor Cyan

# 5. Execute pg_dump
$timestamp = (Get-Date).ToString("yyyyMMdd_HHmmss")
$backupFileName = "db_backup_$timestamp.sql"
$backupFilePath = Join-Path $resolvedTargetDir $backupFileName

$env:PGPASSWORD = $pgPass
try {
    $arguments = @(
        "-h", $pgHost,
        "-p", $pgPort,
        "-U", $pgUser,
        "-d", $pgDb,
        "--clean",
        "--if-exists",
        "--no-owner",
        "--no-privileges",
        "-f", $backupFilePath
    )

    & $pgDump $arguments
    if ($LASTEXITCODE -ne 0) {
        throw "pg_dump process failed with exit code $LASTEXITCODE"
    }

    if (-not (Test-Path $backupFilePath)) {
        throw "Backup file was not created: $backupFilePath"
    }

    $fileItem = Get-Item $backupFilePath
    $sizeKb = [Math]::Round($fileItem.Length / 1024, 2)
    Write-Host "[BACKUP] SUCCESS: Created $backupFileName ($sizeKb KB)" -ForegroundColor Green
} finally {
    $env:PGPASSWORD = ""
}

# 6. Apply rolling retention (7-30 days)
if ($RetentionDays -lt 7) { $RetentionDays = 7 }
if ($RetentionDays -gt 30) { $RetentionDays = 30 }

$cutoffDate = (Get-Date).AddDays(-$RetentionDays)
Write-Host "[BACKUP] Applying rolling retention ($RetentionDays days cutoff: $($cutoffDate.ToString('yyyy-MM-dd')))..." -ForegroundColor Yellow

$oldBackups = Get-ChildItem -Path $resolvedTargetDir -Filter "db_backup_*.sql" | Where-Object { $_.LastWriteTime -lt $cutoffDate }
$deletedCount = 0
foreach ($old in $oldBackups) {
    Remove-Item -Path $old.FullName -Force
    $deletedCount++
    Write-Host "[BACKUP] Rotated old backup: $($old.Name)" -ForegroundColor DarkGray
}

Write-Host "[BACKUP] Complete. 1 backup created, $deletedCount old backups purged." -ForegroundColor Green
Write-Output $backupFilePath
