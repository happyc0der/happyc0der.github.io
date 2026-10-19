# Counts games per emulator on the MSI. Prints JSON with emulator names and counts only, never game titles.
# Run over SSH: ssh msi "powershell -NoProfile -Command -" < emulators.ps1
$ErrorActionPreference = 'SilentlyContinue'
$out = @()

# RPCS3 (PS3): disc games registered in games.yml plus installed games (EBOOT.BIN), unique by title id.
if (Test-Path 'D:\RPCS3') {
  $disc = Get-Content 'D:\RPCS3\config\games.yml' | Where-Object { $_ -match '^([A-Z]{4}\d{5}):' } | ForEach-Object { $Matches[1] }
  $hdd = Get-ChildItem 'D:\RPCS3\dev_hdd0\game' -Directory | Where-Object { $_.Name -match '^[A-Z]{4}\d{5}$' -and (Test-Path (Join-Path $_.FullName 'USRDIR\EBOOT.BIN')) } | ForEach-Object { $_.Name }
  $out += [ordered]@{ name = 'RPCS3'; platform = 'PlayStation 3'; games = @(@($disc) + @($hdd) | Where-Object { $_ } | Sort-Object -Unique).Count }
}

# PPSSPP (PSP): disc images anywhere under its folder, plus installed EBOOT games.
if (Test-Path 'D:\PPSSPP') {
  $iso = (Get-ChildItem 'D:\PPSSPP' -Recurse -Include *.iso,*.cso,*.chd -File).Count
  $eboot = (Get-ChildItem 'D:\PPSSPP\memstick\PSP\GAME' -Directory | Where-Object { Test-Path (Join-Path $_.FullName 'EBOOT.PBP') }).Count
  $out += [ordered]@{ name = 'PPSSPP'; platform = 'PSP'; games = $iso + $eboot }
}

# Xenia (Xbox 360): one folder per game next to the emulator.
if (Test-Path 'D:\Xenia') {
  $std = 'cache','cache0','cache1','content','logs','patches','screenshots','portable','shaders','config'
  $out += [ordered]@{ name = 'Xenia'; platform = 'Xbox 360'; games = (Get-ChildItem 'D:\Xenia' -Directory | Where-Object { $std -notcontains $_.Name.ToLower() }).Count }
}

# Cemu (Wii U): titles installed into its storage, or game files in its configured game paths.
$cemuSettings = "$env:APPDATA\Cemu\settings.xml"
if (Test-Path $cemuSettings) {
  [xml]$s = Get-Content $cemuSettings
  $n = 0
  foreach ($m in @($s.SelectSingleNode('//mlc_path').InnerText, "$env:APPDATA\Cemu\mlc01", 'D:\Cemu\mlc01') | Where-Object { $_ }) {
    $t = Join-Path $m 'usr\title\00050000'; if (Test-Path $t) { $n += (Get-ChildItem $t -Directory).Count }
  }
  foreach ($p in $s.SelectNodes('//GamePaths/*')) { if ($p.InnerText -and (Test-Path $p.InnerText)) { $n += (Get-ChildItem $p.InnerText -Recurse -Include *.wua,*.wux,*.wud -File).Count } }
  $out += [ordered]@{ name = 'Cemu'; platform = 'Wii U'; games = $n }
}

[ordered]@{ machine = $env:COMPUTERNAME; emulators = $out } | ConvertTo-Json -Depth 4 -Compress
