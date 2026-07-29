// Ecrãs de Treinos + Séries — porta da funcionalidade do backend FastAPI
// (app/routers/treinos.py, app/routers/gerar.py) para a PWA offline.
// Depende de db.js (DB, FASES, ROTULOS_FASE, CATEGORIAS_TREINO), gerador.js
// (gerarTreinoItens) e timer.js (iniciarTimers). Usa esc()/tpl() de app.js.

function fmtData(iso) {
  if (!iso) return "";
  const [a, m, d] = iso.split("-");
  return `${d}/${m}/${a}`;
}

async function itensDoTreino(treinoId) {
  const itens = (await DB.porIndice("treino_itens", "treino_id", Number(treinoId))).sort((a, b) => a.ordem - b.ordem);
  const resultado = [];
  for (const item of itens) {
    const exercicio = await DB.obter("exercicios", item.exercicio_id);
    const series = (await DB.porIndice("series", "treino_item_id", item.id)).sort((a, b) => a.numero - b.numero);
    resultado.push({ item, exercicio, series });
  }
  return resultado;
}

async function renderTreinos() {
  try {
    const treinos = (await DB.listar("treinos")).sort((a, b) => (a.data < b.data ? 1 : a.data > b.data ? -1 : (b.id - a.id)));
    app.innerHTML = tpl`
      <div class="wrap">
        <div class="head"><h2>Treinos</h2></div>
        <a href="#/treinos/gerar" class="btn" style="display:block;margin-bottom:14px">🤖 Gerar treino</a>
        ${treinos.length ? `<ul class="list">${treinos.map((t) => `
          <li><a class="row card" href="#/treinos/${t.id}">
            <span class="grow"><span class="t">${esc(t.nome || "Treino")}</span>
            <span class="s">${fmtData(t.data)}</span></span>
            <span class="chev">›</span></a></li>`).join("")}</ul>`
          : `<div class="empty"><div class="big">💪</div>Ainda sem treinos. Gera o primeiro.</div>`}
      </div>
    `;
  } catch (err) {
    app.innerHTML = `<div class="wrap"><div class="empty"><div class="big">⚠️</div>Erro ao carregar treinos.</div></div>`;
    console.error(err);
  }
}

async function renderTreinoGerarForm() {
  app.innerHTML = tpl`
    <div class="wrap">
      <a href="#/treinos" class="btn-link">&larr; Voltar</a>
      <div class="spacer"></div>
      <h2>Gerar treino</h2>
      <p class="muted" style="margin:8px 0 14px">Monta um treino a partir da tua biblioteca: aquecimento, treino principal e alongamento.</p>
      <form class="stack" id="form-gerar">
        <label class="field"><span>Foco</span>
          <select name="categoria">
            ${CATEGORIAS_TREINO.map(([v, r]) => `<option value="${esc(v)}">${esc(r)}</option>`).join("")}
          </select>
        </label>
        <label class="field"><span>Duração (min)</span>
          <input type="number" name="duracao_min" value="45" min="5" required>
        </label>
        <button class="btn" type="submit">Gerar</button>
      </form>
    </div>
  `;
  document.getElementById("form-gerar").addEventListener("submit", async (ev) => {
    ev.preventDefault();
    const fd = new FormData(ev.target);
    const categoria = fd.get("categoria");
    const duracaoMin = parseInt(fd.get("duracao_min"), 10) || 45;
    try {
      const exercicios = await DB.listar("exercicios");
      const rotulo = (CATEGORIAS_TREINO.find(([v]) => v === categoria) || [])[1] || categoria;
      const treinoId = await DB.criar("treinos", { data: new Date().toISOString().slice(0, 10), nome: rotulo });
      const itens = gerarTreinoItens(exercicios, categoria, duracaoMin);
      for (const it of itens) await DB.criar("treino_itens", { ...it, treino_id: treinoId });
      location.hash = "#/treinos/" + treinoId;
    } catch (err) {
      alert("Não consegui gerar o treino.");
      console.error(err);
    }
  });
}

function _itemAlvoTexto(item) {
  const partes = [];
  if (item.series_alvo) partes.push(`${item.series_alvo} séries`);
  if (item.reps_alvo) partes.push(`${item.reps_alvo} reps`);
  if (item.tempo_alvo_seg) partes.push(`${item.tempo_alvo_seg} s`);
  return partes.join(" · ");
}

function _itemHTML(entry, exercicios) {
  const { item, exercicio, series } = entry;
  const timerExercicio = item.tempo_alvo_seg ? tpl`
    <div class="js-timer" data-role="serie" data-seconds="${item.tempo_alvo_seg}" style="display:flex;align-items:center;gap:8px;margin-top:6px">
      <span class="muted" style="font-size:12px;width:56px">Exercício</span>
      <span class="js-timer-display" style="font-family:monospace;font-weight:700;width:48px">${String(Math.floor(item.tempo_alvo_seg / 60)).padStart(2, "0")}:${String(item.tempo_alvo_seg % 60).padStart(2, "0")}</span>
      <button type="button" class="btn sm js-timer-start">Iniciar</button>
      <button type="button" class="btn sm ghost js-timer-reset">Reset</button>
    </div>` : "";
  const descanso = item.descanso_seg || 90;
  const timerDescanso = item.fase !== "alongamento" ? tpl`
    <div class="js-timer" data-role="descanso" data-seconds="${descanso}" style="display:flex;align-items:center;gap:8px;margin-top:6px">
      <span class="muted" style="font-size:12px;width:56px">Descanso</span>
      <input type="number" class="js-timer-seconds-input" value="${descanso}" style="width:56px;padding:4px 6px;border-radius:8px;border:1px solid var(--slate-300)">
      <span class="js-timer-display" style="font-family:monospace;font-weight:700;width:48px">${String(Math.floor(descanso / 60)).padStart(2, "0")}:${String(descanso % 60).padStart(2, "0")}</span>
      <button type="button" class="btn sm js-timer-start">Iniciar</button>
      <button type="button" class="btn sm ghost js-timer-reset">Reset</button>
    </div>` : "";
  const listaSeries = series.length ? tpl`
    <ul class="list" style="margin-top:8px;padding-top:8px;border-top:1px solid var(--slate-100)">
      ${series.map((s) => `
        <li style="display:flex;justify-content:space-between;align-items:center;font-size:14px;color:var(--slate-600)">
          <span>Série ${s.numero}:
            ${s.reps_feitas != null ? `${s.reps_feitas} reps` : ""}
            ${s.tempo_seg != null ? ` · ${s.tempo_seg} s` : ""}
            ${s.peso_extra_kg != null ? ` · +${s.peso_extra_kg} kg` : ""}
          </span>
          <button type="button" class="btn-link red" data-apagar-serie="${s.id}" style="font-size:12px">apagar</button>
        </li>`).join("")}
    </ul>` : "";
  return tpl`
    <li class="card" data-item="${item.id}" style="margin-bottom:10px">
      <div style="display:flex;justify-content:space-between;gap:8px">
        <div style="flex:1;min-width:0">
          <span style="font-weight:700">${exercicio ? esc(exercicio.titulo) : "Exercício removido"}</span>
          <p class="muted" style="font-size:12px;margin-top:2px">${_itemAlvoTexto(item)}</p>
        </div>
        <div style="display:flex;gap:4px;flex-shrink:0" class="reorder">
          <button type="button" class="btn-link" data-mover="${item.id}:cima">↑</button>
          <button type="button" class="btn-link" data-mover="${item.id}:baixo">↓</button>
          <button type="button" class="x" data-apagar-item="${item.id}">×</button>
        </div>
      </div>
      ${exercicio && (exercicio.imagem_url || exercicio.imagem_url_fim) ? tpl`
        <div style="display:flex;gap:6px;margin-top:8px">
          ${exercicio.imagem_url ? tpl`<img src="${exercicio.imagem_url}" alt="início" style="width:${exercicio.imagem_url_fim ? "50%" : "100%"};border-radius:10px;max-height:140px;object-fit:contain;background:var(--slate-100)">` : ""}
          ${exercicio.imagem_url_fim ? tpl`<img src="${exercicio.imagem_url_fim}" alt="fim" style="width:${exercicio.imagem_url ? "50%" : "100%"};border-radius:10px;max-height:140px;object-fit:contain;background:var(--slate-100)">` : ""}
        </div>` : ""}
      <form class="row" data-substituir="${item.id}" style="gap:6px;margin-top:8px">
        <select name="novo_exercicio_id" style="flex:1;font-size:13px;padding:6px 8px">
          ${exercicios.map((e) => `<option value="${e.id}" ${exercicio && e.id === exercicio.id ? "selected" : ""}>${esc(e.titulo)}</option>`).join("")}
        </select>
        <button type="submit" class="btn sm ghost">Trocar</button>
      </form>
      ${timerExercicio}
      ${timerDescanso}
      ${listaSeries}
      <form class="grid3" data-registar="${item.id}" style="gap:6px;margin-top:8px;padding-top:8px;border-top:1px solid var(--slate-100)">
        <input type="number" name="reps_feitas" placeholder="reps" style="padding:8px">
        <input type="number" name="tempo_seg" placeholder="s" style="padding:8px">
        <input type="number" step="0.5" name="peso_extra_kg" placeholder="+kg" style="padding:8px">
        <button type="submit" class="btn sm" style="grid-column:1/4">Registar série</button>
      </form>
    </li>
  `;
}

async function renderTreinoDetail(id) {
  try {
    const treino = await DB.obter("treinos", id);
    if (!treino) return (location.hash = "#/treinos");
    const entradas = await itensDoTreino(id);
    const exercicios = (await DB.listar("exercicios")).sort((a, b) => a.titulo.localeCompare(b.titulo));

    const secoes = FASES.map((fase) => {
      const doFase = entradas.filter((e) => e.item.fase === fase);
      if (!doFase.length) return "";
      return tpl`
        <h3 style="font-weight:600;margin-bottom:8px">${ROTULOS_FASE[fase]}</h3>
        <ul class="list" style="list-style:none">${doFase.map((e) => _itemHTML(e, exercicios)).join("")}</ul>
      `;
    }).join("");

    app.innerHTML = tpl`
      <div class="wrap">
        <a href="#/treinos" class="btn-link">&larr; Voltar</a>
        <div class="spacer"></div>
        <div class="card" style="margin-bottom:14px">
          <h2>${esc(treino.nome || "Treino")}</h2>
          <p class="muted">${fmtData(treino.data)}</p>
          <div class="actions" style="margin-top:10px">
            <a href="#/treinos/${treino.id}/play" class="btn">▶ Modo treino</a>
            <a href="#/treinos/${treino.id}/editar" class="btn ghost">Editar</a>
            <button type="button" class="btn danger" id="btn-apagar-treino">Apagar</button>
          </div>
        </div>
        ${secoes || `<p class="muted" style="margin-bottom:14px">Ainda sem exercícios neste treino.</p>`}
        <h3 style="font-weight:600;margin-bottom:8px">Adicionar exercício</h3>
        <form class="stack card" id="form-add-item">
          <select name="exercicio_id" id="add-item-exercicio" required>
            ${exercicios.map((e) => `<option value="${e.id}">${esc(e.titulo)}</option>`).join("")}
          </select>
          <select name="fase">
            ${FASES.map((f) => `<option value="${f}" ${f === "treino" ? "selected" : ""}>${ROTULOS_FASE[f]}</option>`).join("")}
          </select>
          <div class="grid2">
            <input type="number" name="series_alvo" placeholder="séries">
            <input type="number" name="reps_alvo" placeholder="reps">
          </div>
          <div class="grid2">
            <input type="number" name="tempo_alvo_seg" placeholder="tempo (s)">
            <input type="number" name="descanso_seg" placeholder="descanso (s)">
          </div>
          <button type="submit" class="btn">+ Adicionar</button>
        </form>
      </div>
    `;

    window.iniciarTimers && window.iniciarTimers(app);

    const _preencherAlvoPredefinido = () => {
      const form = document.getElementById("form-add-item");
      const exId = Number(document.getElementById("add-item-exercicio").value);
      const ex = exercicios.find((e) => e.id === exId);
      if (!ex) return;
      if (ex.series_predefinido != null) form.series_alvo.value = ex.series_predefinido;
      if (ex.tipo_alvo === "tempo") {
        if (ex.tempo_predefinido_seg != null) form.tempo_alvo_seg.value = ex.tempo_predefinido_seg;
        form.reps_alvo.value = "";
      } else {
        if (ex.reps_predefinido != null) form.reps_alvo.value = ex.reps_predefinido;
        form.tempo_alvo_seg.value = "";
      }
      if (ex.descanso_predefinido_seg != null) form.descanso_seg.value = ex.descanso_predefinido_seg;
    };
    document.getElementById("add-item-exercicio").addEventListener("change", _preencherAlvoPredefinido);
    _preencherAlvoPredefinido();

    document.getElementById("btn-apagar-treino").onclick = async () => {
      if (!confirm("Apagar este treino?")) return;
      await apagarTreinoCascata(treino.id);
      location.hash = "#/treinos";
    };

    document.getElementById("form-add-item").addEventListener("submit", async (ev) => {
      ev.preventDefault();
      const fd = new FormData(ev.target);
      const itensAtuais = await DB.porIndice("treino_itens", "treino_id", Number(id));
      const proximaOrdem = itensAtuais.length ? Math.max(...itensAtuais.map((i) => i.ordem)) + 1 : 0;
      const numOrNull = (v) => (v === "" || v == null ? null : Number(v));
      await DB.criar("treino_itens", {
        treino_id: Number(id),
        exercicio_id: Number(fd.get("exercicio_id")),
        ordem: proximaOrdem,
        fase: fd.get("fase"),
        series_alvo: numOrNull(fd.get("series_alvo")),
        reps_alvo: numOrNull(fd.get("reps_alvo")),
        tempo_alvo_seg: numOrNull(fd.get("tempo_alvo_seg")),
        descanso_seg: numOrNull(fd.get("descanso_seg")),
      });
      renderTreinoDetail(id);
    });

    app.querySelectorAll("[data-substituir]").forEach((form) => {
      form.addEventListener("submit", async (ev) => {
        ev.preventDefault();
        const itemId = Number(form.dataset.substituir);
        const novoId = Number(new FormData(form).get("novo_exercicio_id"));
        await substituirItem(itemId, novoId);
        renderTreinoDetail(id);
      });
    });

    app.querySelectorAll("[data-registar]").forEach((form) => {
      form.addEventListener("submit", async (ev) => {
        ev.preventDefault();
        const itemId = Number(form.dataset.registar);
        const fd = new FormData(form);
        const numOrNull = (v) => (v === "" || v == null ? null : Number(v));
        await registarSerie(itemId, {
          reps_feitas: numOrNull(fd.get("reps_feitas")),
          tempo_seg: numOrNull(fd.get("tempo_seg")),
          peso_extra_kg: numOrNull(fd.get("peso_extra_kg")),
        });
        renderTreinoDetail(id);
      });
    });

    app.querySelectorAll("[data-mover]").forEach((btn) => {
      btn.onclick = async () => {
        const [itemId, dir] = btn.dataset.mover.split(":");
        await moverItem(id, Number(itemId), dir);
        renderTreinoDetail(id);
      };
    });
    app.querySelectorAll("[data-apagar-item]").forEach((btn) => {
      btn.onclick = async () => {
        if (!confirm("Remover este exercício do treino?")) return;
        await apagarItemCascata(Number(btn.dataset.apagarItem));
        renderTreinoDetail(id);
      };
    });
    app.querySelectorAll("[data-apagar-serie]").forEach((btn) => {
      btn.onclick = async () => {
        await DB.apagar("series", Number(btn.dataset.apagarSerie));
        renderTreinoDetail(id);
      };
    });
  } catch (err) {
    app.innerHTML = `<div class="wrap"><div class="empty"><div class="big">⚠️</div>Erro ao carregar o treino.</div></div>`;
    console.error(err);
  }
}

// ---------- Modo treino: percorre os exercícios do treino um de cada vez ----------

async function renderTreinoPlay(id) {
  try {
    const treino = await DB.obter("treinos", id);
    if (!treino) return (location.hash = "#/treinos");
    const entradas = (await itensDoTreino(id)).filter((e) => e.exercicio);
    if (!entradas.length) {
      app.innerHTML = `<div class="wrap"><a href="#/treinos/${id}" class="btn-link">&larr; Voltar</a><div class="empty" style="margin-top:14px"><div class="big">🏋️</div>Este treino ainda não tem exercícios.</div></div>`;
      return;
    }

    let indice = window._playIndice ?? 0;
    if (indice >= entradas.length) indice = 0;
    const entry = entradas[indice];
    const seriesFeitas = entry.series.length;
    const seriesAlvo = entry.item.series_alvo || 1;
    const serieAtual = Math.min(seriesFeitas + 1, seriesAlvo);
    const concluido = seriesFeitas >= seriesAlvo;
    const { item, exercicio } = entry;

    const descanso = item.descanso_seg || 90;
    const timerDescanso = tpl`
      <div class="js-timer" data-role="descanso" data-seconds="${descanso}" style="display:flex;align-items:center;gap:8px;margin-top:12px">
        <span class="muted" style="font-size:12px;width:56px">Descanso</span>
        <span class="js-timer-display" style="font-family:monospace;font-weight:700;font-size:18px;width:60px">${String(Math.floor(descanso / 60)).padStart(2, "0")}:${String(descanso % 60).padStart(2, "0")}</span>
        <button type="button" class="btn sm js-timer-start">Iniciar</button>
        <button type="button" class="btn sm ghost js-timer-reset">Reset</button>
      </div>`;

    app.innerHTML = tpl`
      <div class="wrap">
        <a href="#/treinos/${id}" class="btn-link">&larr; Sair do modo treino</a>
        <div class="spacer"></div>
        <p class="muted">Exercício ${indice + 1} de ${entradas.length} · ${ROTULOS_FASE[item.fase]}</p>
        <div class="card" style="margin-top:8px">
          <h2>${esc(exercicio.titulo)}</h2>
          ${exercicio.imagem_url || exercicio.imagem_url_fim ? tpl`
            <div style="display:flex;gap:6px;margin-top:10px">
              ${exercicio.imagem_url ? tpl`<img src="${exercicio.imagem_url}" alt="início" style="width:${exercicio.imagem_url_fim ? "50%" : "100%"};border-radius:10px;max-height:220px;object-fit:contain;background:var(--slate-100)">` : ""}
              ${exercicio.imagem_url_fim ? tpl`<img src="${exercicio.imagem_url_fim}" alt="fim" style="width:${exercicio.imagem_url ? "50%" : "100%"};border-radius:10px;max-height:220px;object-fit:contain;background:var(--slate-100)">` : ""}
            </div>` : ""}
          <p style="font-size:20px;font-weight:700;margin-top:14px">
            ${concluido ? "Séries concluídas ✅" : `Série ${serieAtual} de ${seriesAlvo}`}
          </p>
          <p class="muted">${_itemAlvoTexto(item)}</p>
          ${!concluido ? tpl`
            <button type="button" class="btn" id="btn-concluir-serie" style="margin-top:12px;width:100%">✓ Concluir série</button>
            ${seriesFeitas > 0 ? timerDescanso : ""}
          ` : `<button type="button" class="btn" id="btn-proximo" style="margin-top:12px;width:100%">Próximo exercício →</button>`}
        </div>
        <div class="row" style="justify-content:space-between;margin-top:14px">
          <button type="button" class="btn-link" id="btn-anterior" ${indice === 0 ? "disabled" : ""}>&larr; Anterior</button>
          <button type="button" class="btn-link" id="btn-saltar">Saltar →</button>
        </div>
      </div>
    `;

    window.iniciarTimers && window.iniciarTimers(app);
    window._playIndice = indice;

    const irPara = (novoIndice) => {
      if (novoIndice >= entradas.length) {
        app.innerHTML = `<div class="wrap"><div class="empty"><div class="big">🎉</div>Treino concluído!<div class="spacer"></div><a href="#/treinos/${id}" class="btn">Voltar ao treino</a></div></div>`;
        window._playIndice = 0;
        return;
      }
      window._playIndice = Math.max(0, novoIndice);
      renderTreinoPlay(id);
    };

    const btnConcluir = document.getElementById("btn-concluir-serie");
    if (btnConcluir) btnConcluir.onclick = async () => {
      await registarSerie(item.id, {
        reps_feitas: item.reps_alvo ?? null,
        tempo_seg: item.tempo_alvo_seg ?? null,
        peso_extra_kg: null,
      });
      if (seriesFeitas + 1 >= seriesAlvo) irPara(indice + 1);
      else renderTreinoPlay(id);
    };
    const btnProximo = document.getElementById("btn-proximo");
    if (btnProximo) btnProximo.onclick = () => irPara(indice + 1);
    document.getElementById("btn-saltar").onclick = () => irPara(indice + 1);
    const btnAnterior = document.getElementById("btn-anterior");
    if (btnAnterior && indice > 0) btnAnterior.onclick = () => irPara(indice - 1);
  } catch (err) {
    app.innerHTML = `<div class="wrap"><div class="empty"><div class="big">⚠️</div>Erro no modo treino.</div></div>`;
    console.error(err);
  }
}

async function renderTreinoEditForm(id) {
  const treino = await DB.obter("treinos", id);
  if (!treino) return (location.hash = "#/treinos");
  app.innerHTML = tpl`
    <div class="wrap">
      <a href="#/treinos/${id}" class="btn-link">&larr; Voltar</a>
      <div class="spacer"></div>
      <h2>Editar treino</h2>
      <div class="spacer"></div>
      <form class="stack" id="form-editar-treino">
        <label class="field"><span>Data</span><input type="date" name="data" value="${esc(treino.data)}" required></label>
        <label class="field"><span>Nome</span><input name="nome" value="${esc(treino.nome || "")}"></label>
        <button class="btn" type="submit">Guardar</button>
      </form>
    </div>
  `;
  document.getElementById("form-editar-treino").addEventListener("submit", async (ev) => {
    ev.preventDefault();
    const fd = new FormData(ev.target);
    treino.data = fd.get("data");
    treino.nome = fd.get("nome") || null;
    await DB.atualizar("treinos", treino);
    location.hash = "#/treinos/" + id;
  });
}

// ---------- helpers de escrita (cascata: séries seguem o item/treino) ----------

async function apagarTreinoCascata(treinoId) {
  const itens = await DB.porIndice("treino_itens", "treino_id", Number(treinoId));
  for (const item of itens) {
    const series = await DB.porIndice("series", "treino_item_id", item.id);
    for (const s of series) await DB.apagar("series", s.id);
    await DB.apagar("treino_itens", item.id);
  }
  await DB.apagar("treinos", treinoId);
}

async function apagarItemCascata(itemId) {
  const series = await DB.porIndice("series", "treino_item_id", itemId);
  for (const s of series) await DB.apagar("series", s.id);
  await DB.apagar("treino_itens", itemId);
}

async function substituirItem(itemId, novoExercicioId) {
  const item = await DB.obter("treino_itens", itemId);
  if (!item || item.exercicio_id === novoExercicioId) return;
  // As séries já registadas pertencem ao exercício antigo — saem junto com a troca.
  const series = await DB.porIndice("series", "treino_item_id", itemId);
  for (const s of series) await DB.apagar("series", s.id);
  item.exercicio_id = novoExercicioId;
  await DB.atualizar("treino_itens", item);
}

async function moverItem(treinoId, itemId, dir) {
  const itens = (await DB.porIndice("treino_itens", "treino_id", Number(treinoId))).sort((a, b) => a.ordem - b.ordem);
  const idx = itens.findIndex((i) => i.id === itemId);
  if (idx === -1) return;
  const alvo = dir === "cima" ? idx - 1 : idx + 1;
  if (alvo < 0 || alvo >= itens.length) return;
  const ordemA = itens[idx].ordem, ordemB = itens[alvo].ordem;
  itens[idx].ordem = ordemB;
  itens[alvo].ordem = ordemA;
  await DB.atualizar("treino_itens", itens[idx]);
  await DB.atualizar("treino_itens", itens[alvo]);
}

async function registarSerie(itemId, dados) {
  const series = await DB.porIndice("series", "treino_item_id", itemId);
  const proximoNumero = series.length ? Math.max(...series.map((s) => s.numero)) + 1 : 1;
  await DB.criar("series", { treino_item_id: itemId, numero: proximoNumero, ...dados, nota: null });
}
