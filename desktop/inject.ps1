$currentPrincipal = New-Object Security.Principal.WindowsPrincipal([Security.Principal.WindowsIdentity]::GetCurrent())
if (-Not $currentPrincipal.IsInRole([Security.Principal.WindowsBuiltInRole]::Administrator)) {
  Write-Output "[!] Run as admin"
  exit
}

$DESKTOP_APP_PATH = "C:\Program Files\Mattermost\Desktop\resources"
if (Test-Path -Path "$env:LOCALAPPDATA\Programs\mattermost-desktop\resources\app.asar") {
  DESKTOP_APP_PATH = "$env:LOCALAPPDATA\Programs\mattermost-desktop\resources"
}
Write-Output "[*] Mattermost installation path: $DESKTOP_APP_PATH"

rasar  --version | Out-Null
if (-Not $?) {
  Write-Output "[!] install rasar, https://github.com/Zerthox/rasar"
  exit
}

Write-Output "[*] Stopping Mattermost"
Stop-Process -Force -Name "Mattermost"

if (Test-Path "$DESKTOP_APP_PATH\app.asar.bak") {
  Write-Output "[*] Restoring original app.asar from backup"
  Copy-Item -Force -Path "$DESKTOP_APP_PATH\app.asar.bak" -Destination "$DESKTOP_APP_PATH\app.asar"
} else {
  Write-Output "[*] Backing up app.asar -> app.asar.bak"
  Copy-Item -Force -Path "$DESKTOP_APP_PATH\app.asar" -Destination "$DESKTOP_APP_PATH\app.asar.bak"
}


Write-Output "[*] Extracting app.asar -> app.asar.extracted"
rasar e "$DESKTOP_APP_PATH\app.asar" "$DESKTOP_APP_PATH\app.asar.extracted"

Write-Output "[*] Inserting antiRevoke.js"
Copy-Item -Force -Path "antiRevoke.js" -Destination "$DESKTOP_APP_PATH\app.asar.extracted\antiRevoke.js"

Write-Output "[*] Inserting injection for antiRevoke.js"
$indexJs = Get-Content "$DESKTOP_APP_PATH\app.asar.extracted\index.js"
[String[]] $modifiedIndexJs = @()
$mattermostViewClassLine = $indexJs | Select-String -List -SimpleMatch -Pattern "class MattermostView extends _events.EventEmitter {" | Select-Object -Last 1 | Select-Object -ExpandProperty LineNumber
$finishedLoadingLine = $indexJs | Select-String -List -SimpleMatch -Pattern "if (!this.view.webContents.isLoading()) {" | Select-Object -Last 1 | Select-Object -ExpandProperty LineNumber
$modifiedIndexJs += $indexJs | select-Object -First ($mattermostViewClassLine - 1)
$modifiedIndexJs += Select-String -Path "$DESKTOP_APP_PATH\app.asar.extracted\index.js" -Pattern 'var _fs = ' -List | select-object -First 1 | Select-Object -ExpandProperty Line
$modifiedIndexJs += Select-String -Path "$DESKTOP_APP_PATH\app.asar.extracted\index.js" -Pattern 'var _TabView = ' -List | select-object -First 1 | Select-Object -ExpandProperty Line
$modifiedIndexJs += $indexJs | Select-Object -Skip ($mattermostViewClassLine - 1) -First ($finishedLoadingLine - $mattermostViewClassLine + 2)
$modifiedIndexJs += ("
            if (this.tab.type == _TabView.TAB_MESSAGING) {
              this.view.webContents.executeJavaScript(_fs.default.readFileSync((0, _utils.getLocalPreload)('antiRevoke.js')).toString().replace('{{BASE_URL}}', this.tab.url.toString()));
            }
")
$modifiedIndexJs += $indexJs | Select-Object -Skip ($finishedLoadingLine + 1)
Set-Content -Force "$DESKTOP_APP_PATH\app.asar.extracted\index.js" $modifiedIndexJs

Write-Output "[*] Deleting old app.asar"
Remove-Item -Force -Path "$DESKTOP_APP_PATH\app.asar"

Write-Output "[*] Packing new app.asar"
rasar p "$DESKTOP_APP_PATH\app.asar.extracted" "$DESKTOP_APP_PATH\app.asar"

Write-Output "[*] Deleting extracted app.asar"
Remove-Item -Force -Recurse -Path "$DESKTOP_APP_PATH\app.asar.extracted"

Write-Output "[*] Finished"
Pause