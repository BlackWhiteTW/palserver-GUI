# palserver GUI - Windows 更新腳本
# 用法: 在 repo 任意位置執行  .\scripts\update.ps1
# 做的事: 拉最新程式碼 -> 安裝依賴 -> 重建 (含 Web UI) -> 印出結果供核對
#
# 注意:
#  - agent 若以 `pnpm dev:agent` (tsx watch) 執行, 程式碼變更會自動重載;
#    否則 (node dist / exe) 更新後要「手動重啟 agent」新功能才會生效.
#  - 瀏覽器更新後按 Ctrl+Shift+R 強制重新整理.
#
# 本檔以 UTF-8 with BOM 儲存, 否則 Windows PowerShell 5.1 會誤判編碼.

$ErrorActionPreference = "Stop"
Set-Location (Join-Path $PSScriptRoot "..")

$before = (git rev-parse --short HEAD)
Write-Host "[目前版本] $before" -ForegroundColor DarkGray

# package.json / pnpm-lock.yaml 常因 Windows 上跑 pnpm install 而漂移, 這會讓
# git pull 每次中止 -> 卡在舊版. 這兩個檔不該手改, 直接還原成 repo 版本再 pull.
$drift = (git status --porcelain -- package.json pnpm-lock.yaml)
if ($drift) {
  Write-Host "[修正] package.json / pnpm-lock.yaml 有本機漂移, 還原以便更新 ..." -ForegroundColor Yellow
  git checkout -- package.json pnpm-lock.yaml
}

# 其餘若還有未提交改動, 明確提示 (不自動丟棄, 可能是你要保留的)
$dirty = (git status --porcelain)
if ($dirty) {
  Write-Host "[警告] 本機仍有未提交改動, git pull 可能中止:" -ForegroundColor Yellow
  Write-Host $dirty
  Write-Host "若不需保留, 執行  git stash  後再跑本腳本." -ForegroundColor Yellow
}

Write-Host "[1/3] git pull ..." -ForegroundColor Cyan
git pull

Write-Host "[2/3] pnpm install ..." -ForegroundColor Cyan
pnpm install

# Windows 下 dist 裡的檔案偶爾被鎖住 (防毒即時掃描剛寫入的檔 / agent 正在送檔),
# vite 清空 dist 會 EPERM 中斷. 先自行清空, 鎖住就等 2 秒重試, 最多 3 次.
$dist = "packages\web\dist"
if (Test-Path $dist) {
  for ($i = 1; $i -le 3; $i++) {
    try { Remove-Item -Recurse -Force $dist -ErrorAction Stop; break }
    catch {
      Write-Host ("[等待] {0} 被其他程式占用 (第 {1}/3 次), 2 秒後重試 ..." -f $dist, $i) -ForegroundColor Yellow
      if ($i -eq 3) { Write-Host "  仍被占用 - 若接下來 build 失敗, 請關閉 agent 與瀏覽器分頁後重跑本腳本." -ForegroundColor Yellow }
      Start-Sleep -Seconds 2
    }
  }
}

Write-Host "[3/3] pnpm build ..." -ForegroundColor Cyan
pnpm build

$after = (git rev-parse --short HEAD)
$webJs = (Get-ChildItem "packages\web\dist\assets\index-*.js" | Select-Object -First 1).Name

Write-Host ""
Write-Host "==================== 更新結果 ====================" -ForegroundColor Green
Write-Host ("  版本:  {0}  ->  {1}" -f $before, $after)
Write-Host ("  Web:   {0}" -f $webJs)
if ($before -eq $after) {
  Write-Host "  註: 版本沒有變化 — 可能已是最新, 或 git pull 沒拉到 (見上方警告)." -ForegroundColor Yellow
}
Write-Host "=================================================" -ForegroundColor Green
Write-Host ""
Write-Host "接著:" -ForegroundColor Cyan
Write-Host "  1) 若 agent 不是用 'pnpm dev:agent' 跑的, 請重啟 agent (新後端功能才會生效)."
Write-Host "  2) 瀏覽器按 Ctrl+Shift+R 強制重新整理."
Write-Host ("  3) 核對: 瀏覽器 DevTools 載入的 JS 應為  {0}" -f $webJs)
