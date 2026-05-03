$ErrorActionPreference = "Stop"

$Root = Split-Path -Parent $PSScriptRoot
$Tools = Join-Path $Root ".tools"
$BuildDir = Join-Path $Root ".build\backend"
$DbPath = Join-Path $Root ".build\vibe.db"
$SqliteJar = Join-Path $Tools "sqlite-jdbc-3.45.3.0.jar"
$Slf4jApiJar = Join-Path $Tools "slf4j-api-2.0.13.jar"
$Slf4jSimpleJar = Join-Path $Tools "slf4j-simple-2.0.13.jar"
$RuntimeClasspath = "$BuildDir;$SqliteJar;$Slf4jApiJar;$Slf4jSimpleJar"

function Find-Tool($name) {
  $cmd = Get-Command $name -ErrorAction SilentlyContinue
  if ($cmd) {
    return $cmd.Source
  }
  return $null
}

function Find-Javac {
  $candidates = @()
  if ($env:JAVA_HOME) {
    $candidates += Join-Path $env:JAVA_HOME "bin\javac.exe"
  }
  $toolJavac = Find-Tool "javac"
  if ($toolJavac) {
    $candidates += $toolJavac
  }
  $candidates += Get-ChildItem -Path (Join-Path $Tools "jdk") -Recurse -Filter javac.exe -ErrorAction SilentlyContinue | ForEach-Object { $_.FullName }
  foreach ($candidate in $candidates) {
    if ($candidate -and (Test-Path -LiteralPath $candidate)) {
      return $candidate
    }
  }
  return $null
}

function Java-From-Javac($javacPath) {
  return (Join-Path (Split-Path -Parent $javacPath) "java.exe")
}

if (-not (Test-Path -LiteralPath $SqliteJar) -or -not (Test-Path -LiteralPath $Slf4jApiJar) -or -not (Test-Path -LiteralPath $Slf4jSimpleJar)) {
  & powershell -ExecutionPolicy Bypass -File (Join-Path $PSScriptRoot "ensure-java-tools.ps1")
}

$javac = Find-Javac
if (-not $javac) {
  throw "No javac found. Run scripts\ensure-java-tools.ps1 first."
}

$java = Java-From-Javac $javac
New-Item -ItemType Directory -Force -Path $BuildDir | Out-Null
New-Item -ItemType Directory -Force -Path (Split-Path -Parent $DbPath) | Out-Null

$sources = Get-ChildItem -Path (Join-Path $Root "apps\backend-java\src\main\java") -Recurse -Filter *.java | ForEach-Object { $_.FullName }
& $javac -encoding UTF-8 -cp "$SqliteJar;$Slf4jApiJar;$Slf4jSimpleJar" -d $BuildDir $sources

$env:VIBE_DB_PATH = $DbPath
& $java -cp $RuntimeClasspath com.vibe.app.VibeServer
