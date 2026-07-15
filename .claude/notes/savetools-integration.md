# 研究:把 PalworldSaveTools 整合進 Node SEA agent

日期:2026-07-15。來源皆用 GitHub API / raw.githubusercontent.com 直接查證(WebFetch 的 AI 摘要有一處內部矛盾,已用 curl 讀原始檔核實,見下方標註)。

## 子題 1:授權

- **deafdudecomputers/PalworldSaveTools**(頂層 repo):MIT。`license` 檔(注意檔名小寫,非 `LICENSE`,`raw/LICENSE` 會 404)標記 2026, Pylar。GitHub API `license.spdx_id = "MIT"`。
  來源:https://raw.githubusercontent.com/deafdudecomputers/PalworldSaveTools/main/license
- **cheahjs/palworld-save-tools**:MIT(`license.spdx_id = "MIT"`,API 確認)。
  來源:https://api.github.com/repos/cheahjs/palworld-save-tools
- **關鍵發現(頂層 MIT 不等於全部)**:PalworldSaveTools 內嵌的存檔引擎子專案 `src/palsav`(套件名 `palsav-flex`,是 oMaN-Rod/palworld-save-tools 的 fork)**LICENSE 檔是 GPL-3.0-or-later 全文**,`pyproject.toml` 也明寫 `license = "GPL-3.0-or-later"`。(注意:同一份 README.md 尾端寫「License: MIT」——這是 repo 自己 metadata 前後矛盾,以 LICENSE 檔與 pyproject.toml 為準,GPLv3 才是實際授權。)
  來源:https://raw.githubusercontent.com/deafdudecomputers/PalworldSaveTools/main/src/palsav/pyproject.toml,同目錄 `LICENSE`
- 負責 Oodle 解壓的原生 C++ binding 子套件 `palooz`(`palooz_bindings.cpp`)**同樣是 GPL-3.0-or-later**。
  來源:https://raw.githubusercontent.com/deafdudecomputers/PalworldSaveTools/main/src/palsav/palooz/pyproject.toml
- **結論**:能實際處理現行 Oodle 存檔格式的程式碼是 GPL-3.0,不是 MIT。這跟專案已有的 ooz-wasm(GPL)先例性質完全一樣——**不能靜態 vendor 進 PolyForm Noncommercial 的原始碼樹或連結進同一個可執行檔**(GPL copyleft 會要求整個組合作品開源)。合法作法是維持 ooz-wasm 現有模式:當獨立下載的執行檔/子行程呼叫,不與 agent 自身程式碼連結、不隨包發行原始碼。GUI 頂層雖是 MIT,但沒有 CLI/API 可用(見子題 2),vendor 它也沒意義。

## 子題 2:功能面(可程式化呼叫的進入點)

- **deafdudecomputers/PalworldSaveTools 頂層**:純 GUI(PySide6,非 Tkinter),`start.py` 只是啟動器,無 CLI/headless 模式。清理功能(刪空公會/不活躍玩家/重複玩家/未參照資料)在 `src/palworld_toolsets/`(`modify_save.py`、`fix_host_save.py`、`save_diagnostic.py` 等),這些腳本目前是為 GUI 呼叫設計,不保證能直接 headless import(需逐一確認是否耦合 Qt)。
- **真正乾淨的整合點是 `src/palsav`(palsav-flex)**:GUI 無關的獨立 Python library + CLI。
  - CLI:`palsav Level.sav --to-json` / `--from-json`,支援 `--library libooz|zlib`、`--custom-properties`、`--minify-json` 等旗標。
  - Library API:`from palsav.core import decompress_sav_to_gvas, compress_gvas_to_sav`、`palsav.gvas.GvasFile`、`palsav.json_tools` ——可直接程式化組出「SAV→JSON→(清理邏輯)→JSON→SAV」的管線,不依賴 Qt。
  - 來源:https://raw.githubusercontent.com/deafdudecomputers/PalworldSaveTools/main/src/palsav/README.md
- **cheahjs/palworld-save-tools**:有 `convert.py` CLI(`--to-json`/`--from-json`/`--output`/`--force` 等),PyPI 可 `pip install`,但無 Oodle 支援(見子題 3),對現行存檔已不適用。

## 子題 3:存檔格式支援(Oodle / PlM)

- **cheahjs/palworld-save-tools**:最新版 v0.24.0(2024-10-06 發布),repo `pushed_at` 也停在 2024-10-06(近兩年未更新)。GitHub code search 對 "oodle" 回傳 0 筆結果,文件/PyPI 頁面皆無 Oodle 或 PlM 字樣。**判定:不支援現行 Oodle 壓縮存檔,已停滯。**
- **deafdudecomputers/PalworldSaveTools(palsav-flex)**:`core.py` 明確依格式分派——`SaveType.PLZ | CNK` 走 zlib,`SaveType.PLM` 走原生 `palooz`(Oodle)binding,CLI 也提供 `--library` 手動切換 fallback。repo `pushed_at` 是 2026-07-14(近乎即時維護中)。**判定:目前唯一支援新版 Oodle(PLM)存檔的路徑**,但此模組是 GPL-3.0(見子題 1)。

## 子題 4:Python 執行環境嵌入方案比較

| 路線 | 下載體積 | 首次啟動成本 | 後續維護 | 風險 |
|---|---|---|---|---|
| (a) uv 單一執行檔 | uv 本體約 15–20MB(單一 Rust binary);另需下載 python-build-standalone 直譯器(每平台約 25–45MB,快取後離線可用,位置 `UV_PYTHON_INSTALL_DIR`) | 首次需連網下載直譯器+依賴 | 版本靠 pin 檔案更新,低 | **致命問題**:`palooz` 是原生 C++ extension,repo 內以 `path = "./palooz"` 本地相依(未發佈到 PyPI 的預編譯 wheel)。`uv run`/`uv sync` 會嘗試從原始碼建置,等於要求使用者機器有 C++ 編譯工具鏈——直接違反「不能假設使用者有開發環境」的前提,除非自己預先建置好各平台 wheel 再餵給 uv。 |
| (b) python-build-standalone + pip | 與(a)同源(uv 底層也是拉這個),每平台約 25–45MB | 解壓即用,pip 另裝依賴 | 同(a) | 同樣卡在 `palooz` 原生擴充需要編譯或預建 wheel,退化成方案(d)的子問題 |
| (c) Pyodide(WASM,in-process) | 中(Pyodide runtime 本身數十 MB) | 免安裝、in-process | 上游更新需重新打包成 wasm | **不可行**:`palooz` 是原生 C++ binding(非純 Python),沒有對應 wasm32 build,等於要重做一次 ooz-wasm 等級的 Emscripten 移植工程;另外解壓後 Level.sav 動輒數百 MB,wasm32 線性記憶體實務上限(常見設定 ~2–4GB、預設更低)對大存檔是風險 |
| (d) CI 預先凍結(PyInstaller/Nuitka)→ GitHub Releases 下載,比照 ooz-wasm | 每平台一個獨立執行檔,體積可控(只凍結 `palsav-flex` 這個子專案,不含整包 PySide6 GUI,遠小於官方完整 GUI 版) | 執行期下載+SHA-256 驗證(與 ooz-wasm 完全相同流程),使用者機器零 Python/工具鏈假設 | 上游 palsav-flex/palooz 更新時,在自己 CI 重新 build+republish,pin 版本號即可;操作與現有 ooz-wasm 維運完全同構 | 需要自己維護跨平台(Win/Linux,含 arm64)CI build matrix,一次性建置成本,之後是既有肌肉記憶 |

補充:PalworldSaveTools 自己的 `pyproject.toml` 已依賴 `cx-freeze`、`nuitka`,代表上游本來就用這兩個工具凍結**整包 GUI** 發行版——但那是 GUI 執行檔,不能拿來 headless 呼叫。正確做法是只凍結 `src/palsav`(palsav-flex,本身就是乾淨的 CLI/library,見子題 2),而不是凍結整個 GUI。

## 子題 5:結論與建議

**建議路線(d):在自己的 CI 對 `src/palsav`(palsav-flex,含 `palooz` 原生 Oodle binding)用 PyInstaller/Nuitka 跨平台(Windows/Linux,x64+arm64)凍結成獨立執行檔,發佈到自己的 GitHub Releases;Node agent 比照現有 ooz-wasm 模式,首次使用時下載+SHA-256 驗證+快取,執行期以子行程呼叫(stdin/stdout 傳 JSON 或呼叫其 CLI),不隨包發行、不靜態連結。**

理由:(1)授權面唯一乾淨解——`palsav-flex`/`palooz` 是 GPL-3.0,子行程呼叫獨立下載的執行檔是專案已驗證合法的模式(ooz-wasm 先例),不會讓 PolyForm Noncommercial 的程式碼被 copyleft 感染;(2)功能面——這是目前唯一支援新版 Oodle(PLM)存檔、且仍在積極維護(昨天才 push)的實作,cheahjs 版已停滯兩年且不支援;(3)使用者環境零假設——不像 uv/python-build-standalone 路線會撞上 `palooz` 需要編譯工具鏈的問題,也不像 Pyodide 路線需要不存在的 wasm 移植;(4)可持續整合——之後每多包一個 palsav-flex/toolsets 功能,只是在凍結腳本裡多 import 一個函式、重新 build+republish,跟現有 ooz-wasm 維運模式完全同構,團隊已有操作經驗。
