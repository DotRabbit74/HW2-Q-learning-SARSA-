# Cliff Walking: Q-learning vs SARSA

這是一個可直接在瀏覽器執行的靜態專案，用來完成以下作業要求：

- 在同一個 Cliff Walking 環境比較 Q-learning 與 SARSA
- 使用相同參數（epsilon-greedy、alpha、gamma、episodes）
- 顯示每回合總獎勵曲線
- 視覺化最終策略路徑
- 提供自動化分析（收斂速度、穩定性、策略偏好）

## 1. 本機驗證（localhost）

在專案目錄執行：

```powershell
cd d:\.HW\RL\HW2
python -m http.server 8000

```powershell
py -m http.server 8000
```

或（本專案 venv）：

```powershell
d:/.HW/RL/HW2/.venv/Scripts/python.exe -m http.server 8000
```

瀏覽器開啟：

- http://localhost:8000

## 2. 參數建議

- Episodes: 500
- Runs: 50
- Epsilon: 0.1
- Alpha: 0.1
- Gamma: 0.9

這組參數對應課堂常見設定，且可重現 Cliff Walking 中 Q-learning 與 SARSA 的典型差異。

## 3. GitHub Pages 部署

1. 建立 GitHub repository（例如 `rl-hw2-cliffwalking`）
2. 推送本專案內容
3. 到 GitHub 專案頁面 `Settings > Pages`
4. 在 `Build and deployment` 設定：
   - Source: `Deploy from a branch`
   - Branch: `main` / root
5. 儲存後等待部署完成
6. 取得網址：`https://<你的帳號>.github.io/<repo名稱>/`

## 4. 你可以在報告中怎麼寫

- **學習表現**：引用圖表比較兩者收斂速度和最終回報
- **策略行為**：比較兩種最終策略是否貼近懸崖
- **穩定性分析**：引用最後 100 回合標準差與曲線波動
- **理論對照**：
  - Q-learning（Off-policy）更新看 `max_a Q(s',a)`
  - SARSA（On-policy）更新看實際採樣 `Q(s',a')`

## 5. 備註

- 本專案為純前端，無需安裝 Node.js 套件
- 適合直接部署到 GitHub Pages
