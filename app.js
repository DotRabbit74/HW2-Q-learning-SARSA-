const ACTIONS = [
  { dr: -1, dc: 0, arrow: "↑" },
  { dr: 0, dc: 1, arrow: "→" },
  { dr: 1, dc: 0, arrow: "↓" },
  { dr: 0, dc: -1, arrow: "←" },
];

const envConfig = {
  rows: 4,
  cols: 12,
};

const ui = {
  episodes: document.getElementById("episodes"),
  runs: document.getElementById("runs"),
  epsilon: document.getElementById("epsilon"),
  alpha: document.getElementById("alpha"),
  gamma: document.getElementById("gamma"),
  seed: document.getElementById("seed"),
  runBtn: document.getElementById("runBtn"),
  resetBtn: document.getElementById("resetBtn"),
  status: document.getElementById("status"),
  qPolicy: document.getElementById("qPolicy"),
  sarsaPolicy: document.getElementById("sarsaPolicy"),
  analysis: document.getElementById("analysis"),
};

let rewardChart;

function createRng(seed) {
  let x = seed >>> 0;
  return function rand() {
    x ^= x << 13;
    x ^= x >>> 17;
    x ^= x << 5;
    return ((x >>> 0) / 4294967296);
  };
}

function clamp(v, min, max) {
  return Math.max(min, Math.min(max, v));
}

function posToState(r, c, cols) {
  return r * cols + c;
}

function stateToPos(s, cols) {
  return {
    r: Math.floor(s / cols),
    c: s % cols,
  };
}

function getEnv(rows, cols) {
  return {
    rows,
    cols,
    start: posToState(rows - 1, 0, cols),
    goal: posToState(rows - 1, cols - 1, cols),
    isCliff(state) {
      const { r, c } = stateToPos(state, cols);
      return r === rows - 1 && c > 0 && c < cols - 1;
    },
    step(state, action) {
      const p = stateToPos(state, cols);
      const a = ACTIONS[action];
      const nr = clamp(p.r + a.dr, 0, rows - 1);
      const nc = clamp(p.c + a.dc, 0, cols - 1);
      const next = posToState(nr, nc, cols);

      if (this.isCliff(next)) {
        return { nextState: this.start, reward: -100, done: false, fell: true };
      }

      if (next === this.goal) {
        return { nextState: next, reward: -1, done: true, fell: false };
      }

      return { nextState: next, reward: -1, done: false, fell: false };
    },
  };
}

function argmaxRow(row) {
  let max = row[0];
  const idx = [0];
  for (let i = 1; i < row.length; i += 1) {
    if (row[i] > max) {
      max = row[i];
      idx.length = 0;
      idx.push(i);
    } else if (row[i] === max) {
      idx.push(i);
    }
  }
  return idx;
}

function chooseAction(q, state, epsilon, rand) {
  if (rand() < epsilon) {
    return Math.floor(rand() * ACTIONS.length);
  }
  const best = argmaxRow(q[state]);
  return best[Math.floor(rand() * best.length)];
}

function initQ(stateCount) {
  return Array.from({ length: stateCount }, () => Array(ACTIONS.length).fill(0));
}

function runEpisode(env, q, params, algo, rand) {
  const { alpha, gamma, epsilon } = params;
  let state = env.start;
  let action = chooseAction(q, state, epsilon, rand);
  let totalReward = 0;

  for (let t = 0; t < 1000; t += 1) {
    const step = env.step(state, action);
    totalReward += step.reward;

    if (algo === "qlearning") {
      const maxNext = Math.max(...q[step.nextState]);
      q[state][action] += alpha * (step.reward + gamma * maxNext - q[state][action]);

      if (step.done) {
        break;
      }

      state = step.nextState;
      action = chooseAction(q, state, epsilon, rand);
    } else {
      const nextAction = chooseAction(q, step.nextState, epsilon, rand);
      const target = step.done
        ? step.reward
        : step.reward + gamma * q[step.nextState][nextAction];
      q[state][action] += alpha * (target - q[state][action]);

      if (step.done) {
        break;
      }

      state = step.nextState;
      action = nextAction;
    }
  }

  return totalReward;
}

function trainSingle(algo, cfg) {
  const env = getEnv(cfg.rows, cfg.cols);
  const stateCount = cfg.rows * cfg.cols;
  const q = initQ(stateCount);
  const rewards = Array(cfg.episodes).fill(0);
  const rand = createRng(cfg.seed);

  for (let ep = 0; ep < cfg.episodes; ep += 1) {
    rewards[ep] = runEpisode(env, q, cfg, algo, rand);
  }

  return { q, rewards, env };
}

function meanCurve(curves) {
  const len = curves[0].length;
  const out = Array(len).fill(0);
  for (let i = 0; i < len; i += 1) {
    let sum = 0;
    for (let r = 0; r < curves.length; r += 1) {
      sum += curves[r][i];
    }
    out[i] = sum / curves.length;
  }
  return out;
}

function movingAverage(values, window = 10) {
  const out = Array(values.length).fill(0);
  let sum = 0;
  for (let i = 0; i < values.length; i += 1) {
    sum += values[i];
    if (i >= window) {
      sum -= values[i - window];
    }
    out[i] = sum / Math.min(window, i + 1);
  }
  return out;
}

function std(values) {
  const m = values.reduce((a, b) => a + b, 0) / values.length;
  const v = values.reduce((a, b) => a + (b - m) ** 2, 0) / values.length;
  return Math.sqrt(v);
}

function convergenceEpisode(curve) {
  const ma = movingAverage(curve, 20);
  const tail = ma.slice(Math.max(0, ma.length - 50));
  const target = tail.reduce((a, b) => a + b, 0) / tail.length;
  const threshold = target - 2;

  for (let i = 19; i < ma.length; i += 1) {
    if (ma[i] >= threshold) {
      return i + 1;
    }
  }
  return ma.length;
}

function greedyPolicy(q, env) {
  const policy = Array(env.rows * env.cols).fill(-1);
  for (let s = 0; s < policy.length; s += 1) {
    if (env.isCliff(s) || s === env.goal) {
      continue;
    }
    policy[s] = argmaxRow(q[s])[0];
  }
  return policy;
}

function rolloutPath(policy, env) {
  const path = new Set();
  let state = env.start;
  path.add(state);

  for (let i = 0; i < 100; i += 1) {
    if (state === env.goal) {
      break;
    }
    const action = policy[state];
    if (action < 0) {
      break;
    }
    const step = env.step(state, action);
    state = step.nextState;
    path.add(state);
    if (step.done) {
      break;
    }
  }

  return path;
}

function renderPolicy(container, policy, env, path, pathClass) {
  container.innerHTML = "";

  for (let r = 0; r < env.rows; r += 1) {
    for (let c = 0; c < env.cols; c += 1) {
      const s = posToState(r, c, env.cols);
      const cell = document.createElement("div");
      cell.className = "cell";

      if (s === env.start) {
        cell.classList.add("start");
        cell.textContent = "Start";
      } else if (s === env.goal) {
        cell.classList.add("goal");
        cell.textContent = "Goal";
      } else if (env.isCliff(s)) {
        cell.classList.add("cliff");
        cell.textContent = "Cliff";
      } else {
        const a = policy[s];
        cell.textContent = a >= 0 ? ACTIONS[a].arrow : "";
      }

      if (path.has(s) && s !== env.start && s !== env.goal && !env.isCliff(s)) {
        cell.classList.add(pathClass);
      }

      container.appendChild(cell);
    }
  }
}

function renderChart(episodes, qCurve, sCurve) {
  const labels = Array.from({ length: episodes }, (_, i) => i + 1);
  const ctx = document.getElementById("rewardChart");

  if (rewardChart) {
    rewardChart.destroy();
  }

  rewardChart = new Chart(ctx, {
    type: "line",
    data: {
      labels,
      datasets: [
        {
          label: "SARSA",
          data: sCurve,
          borderColor: "#0ea5a5",
          backgroundColor: "rgba(14, 165, 165, 0.15)",
          borderWidth: 2,
          pointRadius: 0,
          tension: 0.2,
        },
        {
          label: "Q-learning",
          data: qCurve,
          borderColor: "#d11f1f",
          backgroundColor: "rgba(209, 31, 31, 0.15)",
          borderWidth: 2,
          pointRadius: 0,
          tension: 0.2,
        },
      ],
    },
    options: {
      responsive: true,
      maintainAspectRatio: true,
      interaction: {
        intersect: false,
        mode: "index",
      },
      plugins: {
        legend: {
          position: "bottom",
        },
      },
      scales: {
        y: {
          title: {
            display: true,
            text: "Reward Sum for Episode",
          },
        },
        x: {
          title: {
            display: true,
            text: "Episodes",
          },
        },
      },
    },
  });
}

function renderAnalysis(summary) {
  const lines = [
    `<p><strong>收斂速度：</strong>${summary.faster} 較快，估計在第 ${summary.fastEp} 回合附近進入穩定區。</p>`,
    `<p><strong>穩定性：</strong>${summary.stable} 較穩定（最後 100 回合標準差較小）。</p>`,
    `<p><strong>最終表現：</strong>Q-learning 平均 ${summary.qLast.toFixed(2)}，SARSA 平均 ${summary.sLast.toFixed(2)}（最後 50 回合）。</p>`,
    `<p><strong>策略傾向：</strong>${summary.policyText}</p>`,
  ];

  ui.analysis.innerHTML = lines.join("\n");
}

function runExperiment() {
  const episodes = Number(ui.episodes.value);
  const runs = Number(ui.runs.value);
  const epsilon = Number(ui.epsilon.value);
  const alpha = Number(ui.alpha.value);
  const gamma = Number(ui.gamma.value);
  const seed = Number(ui.seed.value);

  if (!Number.isFinite(episodes) || episodes < 100) {
    ui.status.textContent = "Episodes 需至少 100。";
    return;
  }

  ui.status.textContent = "訓練中，請稍候...";

  setTimeout(() => {
    const qCurves = [];
    const sCurves = [];
    let qFinal;
    let sFinal;

    for (let i = 0; i < runs; i += 1) {
      const base = seed + i * 9973;
      const cfg = {
        rows: envConfig.rows,
        cols: envConfig.cols,
        episodes,
        epsilon,
        alpha,
        gamma,
        seed: base,
      };

      const qRes = trainSingle("qlearning", cfg);
      const sRes = trainSingle("sarsa", cfg);
      qCurves.push(qRes.rewards);
      sCurves.push(sRes.rewards);

      if (i === runs - 1) {
        qFinal = qRes;
        sFinal = sRes;
      }
    }

    const qMean = meanCurve(qCurves);
    const sMean = meanCurve(sCurves);
    const qMa = movingAverage(qMean, 10);
    const sMa = movingAverage(sMean, 10);

    renderChart(episodes, qMa, sMa);

    const qPolicy = greedyPolicy(qFinal.q, qFinal.env);
    const sPolicy = greedyPolicy(sFinal.q, sFinal.env);
    const qPath = rolloutPath(qPolicy, qFinal.env);
    const sPath = rolloutPath(sPolicy, sFinal.env);

    renderPolicy(ui.qPolicy, qPolicy, qFinal.env, qPath, "path-q");
    renderPolicy(ui.sarsaPolicy, sPolicy, sFinal.env, sPath, "path-s");

    const qConv = convergenceEpisode(qMean);
    const sConv = convergenceEpisode(sMean);
    const qLast = qMean.slice(-50).reduce((a, b) => a + b, 0) / 50;
    const sLast = sMean.slice(-50).reduce((a, b) => a + b, 0) / 50;
    const qStd = std(qMean.slice(-100));
    const sStd = std(sMean.slice(-100));

    const summary = {
      faster: qConv < sConv ? "Q-learning" : "SARSA",
      fastEp: Math.min(qConv, sConv),
      stable: qStd < sStd ? "Q-learning" : "SARSA",
      qLast,
      sLast,
      policyText:
        qLast > sLast
          ? "Q-learning 常給出更高理論報酬，但通常更靠近懸崖；SARSA 更保守。"
          : "SARSA 在此設定下展現較穩健表現，通常路徑更遠離懸崖。",
    };

    renderAnalysis(summary);

    ui.status.textContent = `完成：${runs} runs × ${episodes} episodes。`;
  }, 30);
}

function resetDefaults() {
  ui.episodes.value = 500;
  ui.runs.value = 50;
  ui.epsilon.value = 0.1;
  ui.alpha.value = 0.1;
  ui.gamma.value = 0.9;
  ui.seed.value = 42;
  ui.status.textContent = "已重設為作業建議參數。";
}

ui.runBtn.addEventListener("click", runExperiment);
ui.resetBtn.addEventListener("click", resetDefaults);

runExperiment();
