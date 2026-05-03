$ErrorActionPreference = "Stop"

$Root = Split-Path -Parent $PSScriptRoot
$Tools = Join-Path $Root ".tools"
$JdkDir = Join-Path $Tools "jdk"
$SqliteJar = Join-Path $Tools "sqlite-jdbc-3.45.3.0.jar"
$Slf4jApiJar = Join-Path $Tools "slf4j-api-2.0.13.jar"
$Slf4jSimpleJar = Join-Path $Tools "slf4j-simple-2.0.13.jar"

New-Item -ItemType Directory -Force -Path $Tools | Out-Null

function Find-Javac {
  $candidates = @()
  if ($env:JAVA_HOME) {
    $candidates += Join-Path $env:JAVA_HOME "bin\javac.exe"
  }
  $cmd = Get-Command javac -ErrorAction SilentlyContinue
  if ($cmd) {
    $candidates += $cmd.Source
  }
  $candidates += Get-ChildItem -Path $JdkDir -Recurse -Filter javac.exe -ErrorAction SilentlyContinue | ForEach-Object { $_.FullName }
  foreach ($candidate in $candidates) {
    if ($candidate -and (Test-Path -LiteralPath $candidate)) {
      return $candidate
    }
  }
  return $null
}

$javac = Find-Javac
if (-not $javac) {
  $zipPath = Join-Path $Tools "temurin-jdk17.zip"
  $downloadUrl = "https://api.adoptium.net/v3/binary/latest/17/ga/windows/x64/jdk/hotspot/normal/eclipse?project=jdk"
  Write-Host "Downloading portable JDK 17..."
  Invoke-WebRequest -Uri $downloadUrl -OutFile $zipPath
  if (Test-Path -LiteralPath $JdkDir) {
    Remove-Item -LiteralPath $JdkDir -Recurse -Force
  }
  New-Item -ItemType Directory -Force -Path $JdkDir | Out-Null
  Expand-Archive -LiteralPath $zipPath -DestinationPath $JdkDir -Force
  Remove-Item -LiteralPath $zipPath -Force
  $javac = Find-Javac
}

if (-not (Test-Path -LiteralPath $SqliteJar)) {
  Write-Host "Downloading SQLite JDBC driver..."
  Invoke-WebRequest -Uri "https://repo1.maven.org/maven2/org/xerial/sqlite-jdbc/3.45.3.0/sqlite-jdbc-3.45.3.0.jar" -OutFile $SqliteJar
}

if (-not (Test-Path -LiteralPath $Slf4jApiJar)) {
  Write-Host "Downloading SLF4J API..."
  Invoke-WebRequest -Uri "https://repo1.maven.org/maven2/org/slf4j/slf4j-api/2.0.13/slf4j-api-2.0.13.jar" -OutFile $Slf4jApiJar
}

if (-not (Test-Path -LiteralPath $Slf4jSimpleJar)) {
  Write-Host "Downloading SLF4J simple logger..."
  Invoke-WebRequest -Uri "https://repo1.maven.org/maven2/org/slf4j/slf4j-simple/2.0.13/slf4j-simple-2.0.13.jar" -OutFile $Slf4jSimpleJar
}

Write-Host "javac: $javac"
Write-Host "sqlite-jdbc: $SqliteJar"
Write-Host "slf4j-api: $Slf4jApiJar"
Write-Host "slf4j-simple: $Slf4jSimpleJar"
