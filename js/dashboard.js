// Dashboard principal — histórico, estatísticas, frequência e recordes pessoais.
// Lê treinos/treino_itens/series/exercicios do IndexedDB e agrega tudo em memória
// (volumes de dados pequenos o suficiente para não precisar de índices extra).

function _semanaISO(dataISO) {
  const d = new Date(dataISO + "T00:00:00");
  const diaSemana = (d.getUTCDay() + 6) % 7; // segunda=0
  d.setUTCDate(d.getUTCDate() - diaSemana + 3);
  const primeiraQuinta = new Date(Date.UTC(d.getUTCFullYear(), 0, 4));
  const semana = 1 + Math.round(((d - primeiraQuinta) / 86400000 - 3 + ((primeiraQuinta.getUTCDay() + 6) % 7)) / 7);
  return `${d.getUTCFullYear()}-W${String(semana).padStart(2, "0")}`;
}

function _calcularStreak(datasUnicas) {
  let streak = 0;
  const cursor = new Date();
  for (;;) {
    const iso = cursor.toISOString().slice(0, 10);
    if (!datasUnicas.has(iso)) break;
    streak++;
    cursor.setDate(cursor.getDate() - 1);
  }
  return streak;
}

async function renderDashboard() {
  try {
    const [treinos, itens, series, exercicios] = await Promise.all([
      DB.listar("treinos"), DB.listar("treino_itens"), DB.listar("series"), DB.listar("exercicios"),
    ]);

    if (!treinos.length) {
      app.innerHTML = tpl`
        <div class="wrap">
          <div class="empty"><div class="big">📊</div>Ainda sem treinos registados.
            <div class="spacer"></div>
            <a href="#/treinos/gerar" class="btn">🤖 Gerar o primeiro treino</a>
          </div>
        </div>
      `;
      return;
    }

    const itemById = new Map(itens.map((i) => [i.id, i]));
    const exById = new Map(exercicios.map((e) => [e.id, e]));

    const totalSeries = series.length;
    const totalReps = series.reduce((s, x) => s + (x.reps_feitas || 0), 0);
    const totalTempoSeg = series.reduce((s, x) => s + (x.tempo_seg || 0), 0);

    const datasUnicas = new Set(treinos.map((t) => t.data));
    const streak = _calcularStreak(datasUnicas);

    // Frequência das últimas 8 semanas
    const semanas = [];
    const hoje = new Date();
    for (let i = 7; i >= 0; i--) {
      const d = new Date(hoje);
      d.setDate(d.getDate() - i * 7);
      semanas.push(_semanaISO(d.toISOString().slice(0, 10)));
    }
    const contagemPorSemana = {};
    for (const t of treinos) {
      const sem = _semanaISO(t.data);
      contagemPorSemana[sem] = (contagemPorSemana[sem] || 0) + 1;
    }
    const maxSemana = Math.max(1, ...semanas.map((s) => contagemPorSemana[s] || 0));

    // Recordes pessoais por exercício
    const recordes = new Map();
    for (const s of series) {
      const item = itemById.get(s.treino_item_id);
      if (!item) continue;
      const atual = recordes.get(item.exercicio_id) || { reps: 0, tempo: 0, peso: 0 };
      if ((s.reps_feitas || 0) > atual.reps) atual.reps = s.reps_feitas;
      if ((s.tempo_seg || 0) > atual.tempo) atual.tempo = s.tempo_seg;
      if ((s.peso_extra_kg || 0) > atual.peso) atual.peso = s.peso_extra_kg;
      recordes.set(item.exercicio_id, atual);
    }
    const listaRecordes = [...recordes.entries()]
      .map(([exId, r]) => ({ exercicio: exById.get(exId), ...r }))
      .filter((r) => r.exercicio)
      .sort((a, b) => a.exercicio.titulo.localeCompare(b.exercicio.titulo, "pt"));

    const recentes = [...treinos].sort((a, b) => (a.data < b.data ? 1 : a.data > b.data ? -1 : b.id - a.id)).slice(0, 8);

    app.innerHTML = tpl`
      <div class="wrap">
        <h2 style="margin-bottom:12px">📊 O teu progresso</h2>

        <div class="grid2" style="gap:8px;margin-bottom:14px">
          <div class="card" style="text-align:center"><div style="font-size:24px;font-weight:700">${treinos.length}</div><div class="muted" style="font-size:12px">treinos feitos</div></div>
          <div class="card" style="text-align:center"><div style="font-size:24px;font-weight:700">${streak}</div><div class="muted" style="font-size:12px">dias seguidos</div></div>
          <div class="card" style="text-align:center"><div style="font-size:24px;font-weight:700">${totalSeries}</div><div class="muted" style="font-size:12px">séries registadas</div></div>
          <div class="card" style="text-align:center"><div style="font-size:24px;font-weight:700">${totalReps}</div><div class="muted" style="font-size:12px">reps totais</div></div>
        </div>

        <h3 style="font-weight:600;margin-bottom:8px">Frequência (últimas 8 semanas)</h3>
        <div class="card" style="display:flex;align-items:flex-end;gap:6px;height:80px;margin-bottom:14px">
          ${semanas.map((s) => {
            const n = contagemPorSemana[s] || 0;
            const alturaPct = Math.round((n / maxSemana) * 100);
            return `<div style="flex:1;display:flex;flex-direction:column;align-items:center;justify-content:flex-end;height:100%">
              <div style="width:100%;background:var(--laranja,#ea580c);border-radius:4px 4px 0 0;height:${Math.max(alturaPct, n ? 8 : 2)}%" title="${n} treino(s)"></div>
            </div>`;
          }).join("")}
        </div>

        <h3 style="font-weight:600;margin-bottom:8px">Últimos treinos</h3>
        <ul class="list" style="margin-bottom:14px">
          ${recentes.map((t) => `
            <li><a class="row card" href="#/treinos/${t.id}">
              <span class="grow"><span class="t">${esc(t.nome || "Treino")}</span>
              <span class="s">${fmtData(t.data)}</span></span>
              <span class="chev">›</span></a></li>`).join("")}
        </ul>

        <h3 style="font-weight:600;margin-bottom:8px">Recordes pessoais</h3>
        ${listaRecordes.length ? `<ul class="list">${listaRecordes.map((r) => `
          <li class="row card">
            <span class="grow">${esc(r.exercicio.titulo)}</span>
            <span class="muted" style="font-size:13px">
              ${[r.reps ? `${r.reps} reps` : "", r.tempo ? `${r.tempo}s` : "", r.peso ? `+${r.peso}kg` : ""].filter(Boolean).join(" · ") || "—"}
            </span>
          </li>`).join("")}</ul>` : `<p class="muted">Ainda sem séries registadas.</p>`}
      </div>
    `;
  } catch (err) {
    app.innerHTML = `<div class="wrap"><div class="empty"><div class="big">⚠️</div>Erro ao carregar o dashboard.</div></div>`;
    console.error(err);
  }
}

// ------- self-check (corre só em Node) -------
if (typeof window === "undefined" && typeof process !== "undefined") {
  const assert = (c, m) => { if (!c) { console.error("FALHOU:", m); process.exit(1); } };
  assert(_semanaISO("2026-07-30").match(/^\d{4}-W\d{2}$/), "_semanaISO devolve formato ISO válido");
  assert(_calcularStreak(new Set()) === 0, "streak vazio devolve 0");
  const hoje = new Date().toISOString().slice(0, 10);
  assert(_calcularStreak(new Set([hoje])) === 1, "streak com treino hoje devolve 1");
  console.log("ok dashboard.js: semanaISO e streak");
}
