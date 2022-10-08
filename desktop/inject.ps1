$DESKTOP_APP_PATH = "$env:LOCALAPPDATA\Programs\mattermost-desktop\resources"
rasar  --version | Out-Null
if (-Not $?) {
  Write-Output "[!] install rasar, https://github.com/Zerthox/rasar"
  exit
}

Write-Output "[*] Stopping Mattermost"
Stop-Process -Force -Name "Mattermost"

if (-Not (Test-Path %DESKTOP_APP_PATH%\app.asar.bak)) {
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
$modifiedIndexJs += $indexJs | select-Object -First ($mattermostViewClassLine - 1)
$modifiedIndexJs += Select-String -Path "$DESKTOP_APP_PATH\app.asar.extracted\index.js" -Pattern 'var _fs = ' -List | select-object -First 1 | Select-Object -ExpandProperty Line
$modifiedIndexJs += Select-String -Path "$DESKTOP_APP_PATH\app.asar.extracted\index.js" -Pattern 'var _TabView = ' -List | select-object -First 1 | Select-Object -ExpandProperty Line
$modifiedIndexJs += $indexJs | Select-Object -Skip ($mattermostViewClassLine - 1) -First ($finishedLoadingLine - $mattermostViewClassLine + 2)
$modifiedIndexJs += ("if (this.tab.type == _TabView.TAB_MESSAGING) {
  this.view.webContents.executeJavaScript(_fs.default.readFileSync((0, _utils.getLocalPreload)('antiRevoke.js')).toString().replace('{{BASE_URL}}', this.tab.url.toString()));
}")
$modifiedIndexJs +=  $indexJs | Select-Object -Skip ($finishedLoadingLine + 1)
Set-Content -Force "$DESKTOP_APP_PATH\app.asar.extracted\index.js" $modifiedIndexJs

Write-Output "[*] deleting old app.asar"
Remove-Item -Force -Path "$DESKTOP_APP_PATH\app.asar"

Write-Output "[*] packing new app.asar"
rasar p "$DESKTOP_APP_PATH\app.asar.extracted" "$DESKTOP_APP_PATH\app.asar"

Write-Output "[*] deleting extracted app.asar"
Remove-Item -Force -Recurse -Path "$DESKTOP_APP_PATH\app.asar.extracted"

Write-Output "[*] Finished"
Pause