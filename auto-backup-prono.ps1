$ProjectPath = "C:\Users\MANUE\Downloads\prono-ligue1-lm-vite"
$BackupPath = "C:\Users\MANUE\Downloads\BACKUP-prono-ligue1"

if (!(Test-Path $BackupPath)) {
  New-Item -ItemType Directory -Path $BackupPath | Out-Null
}

Write-Host "✅ Sauvegarde auto lancée toutes les 5 minutes"
Write-Host "📁 Dossier sauvegarde : $BackupPath"
Write-Host "⛔ Pour arrêter : CTRL + C"
Write-Host ""

while ($true) {
  $date = Get-Date -Format "yyyy-MM-dd_HH-mm-ss"
  $zipName = "prono-ligue1-backup_$date.zip"
  $zipPath = Join-Path $BackupPath $zipName
  $tempPath = Join-Path $env:TEMP "prono-backup-temp"

  if (Test-Path $tempPath) {
    Remove-Item $tempPath -Recurse -Force
  }

  New-Item -ItemType Directory -Path $tempPath | Out-Null

  robocopy $ProjectPath $tempPath /E /XD node_modules .git dist /XF *.log | Out-Null

  Compress-Archive -Path "$tempPath\*" -DestinationPath $zipPath -Force

  Remove-Item $tempPath -Recurse -Force

  Write-Host "✅ Sauvegarde créée : $zipName"

  $oldBackups = Get-ChildItem $BackupPath -Filter "prono-ligue1-backup_*.zip" | Sort-Object LastWriteTime -Descending | Select-Object -Skip 20

  foreach ($old in $oldBackups) {
    Remove-Item $old.FullName -Force
  }

  Write-Host "⏳ Prochaine sauvegarde dans 5 minutes..."
  Start-Sleep -Seconds 300
}
