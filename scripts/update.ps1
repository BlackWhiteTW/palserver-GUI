# palserver GUI - Windows 更新腳本
# 用法:在 repo 目錄執行  .\scripts\update.ps1
# 做的事:拉最新程式碼 -> 安裝依賴 -> 重建(含 Web UI)
# 注意:agent 若以 `pnpm dev:agent`(tsx watch)執行,程式碼變更會自動重載,
#       不需要手動重啟;正在運行的 PalServer 也不受影響。

$ErrorActionPreference = "Stop"
Set-Location (Join-Path $PSScriptRoot "..")

Write-Host "[1/3] git pull ..."
git pull

Write-Host "[2/3] pnpm install ..."
pnpm install

Write-Host "[3/3] pnpm build ..."
pnpm build

Write-Host ""
Write-Host "[OK] 更新完成。瀏覽器按 Ctrl+Shift+R 強制重新整理即可看到新版 UI。"
