# palserver GUI - 啟動 agent(開發模式,tsx watch 自動重載)
# 用法:.\scripts\start-agent.ps1
# 首次啟動會在終端機印出 API token(也存於 ~\.palserver-agent\token)。

$ErrorActionPreference = "Stop"
Set-Location (Join-Path $PSScriptRoot "..")

$Host.UI.RawUI.WindowTitle = "palserver agent"
pnpm dev:agent
