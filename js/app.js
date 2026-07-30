// Router simples por hash + render dos ecrãs.
const app = document.getElementById("app");

function esc(s) {
  return String(s ?? "").replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;").replace(/'/g, "&#39;");
}

// Primeiro arranque: se a BD local estiver vazia, semeia a partir de export.json
// (servido ao lado da app) — evita ter de transferir o ficheiro manualmente para o telemóvel.
let _semeado = false;
async function semearSeVazio() {
  if (_semeado) return false;
  const existentes = await DB.listar("exercicios");
  if (existentes.length) { _semeado = true; return false; }
  try {
    const res = await fetch("export.json");
    if (!res.ok) return false;
    const payload = await res.json();
    await DB.importarTudo(payload, true);
    _semeado = true;
    return true;
  } catch {
    return false;
  }
}

function atualizarNav() {
  const hash = location.hash || "#/dashboard";
  let sec = hash;
  if (hash.indexOf("#/exercicios") === 0) sec = "#/exercicios";
  else if (hash.indexOf("#/treinos") === 0) sec = "#/treinos";
  document.querySelectorAll("nav.tab a").forEach((a) => {
    const ativo = a.getAttribute("href") === sec;
    a.classList.toggle("ativo", ativo);
    if (ativo) a.setAttribute("aria-current", "page");
    else a.removeAttribute("aria-current");
  });
}

async function render() {
  if (typeof _pararDescansoPlay === "function") _pararDescansoPlay();
  atualizarNav();
  app.innerHTML = `<div class="wrap"><p class="muted">A carregar…</p></div>`;
  await semearSeVazio();
  const hash = location.hash || "#/dashboard";
  if (hash === "#/dashboard") return renderDashboard();
  if (hash === "#/exercicios/novo") return renderExercicioForm(null);
  let mEx = hash.match(/^#\/exercicios\/(\d+)\/editar$/);
  if (mEx) return renderExercicioForm(mEx[1]);
  if (hash.startsWith("#/exercicios/")) return renderExercicioDetail(hash.split("/")[2]);
  if (hash === "#/treinos/gerar") return renderTreinoGerarForm();
  let m = hash.match(/^#\/treinos\/(\d+)\/editar$/);
  if (m) return renderTreinoEditForm(m[1]);
  m = hash.match(/^#\/treinos\/(\d+)\/play$/);
  if (m) return renderTreinoPlay(m[1]);
  m = hash.match(/^#\/treinos\/(\d+)$/);
  if (m) return renderTreinoDetail(m[1]);
  if (hash === "#/treinos") return renderTreinos();
  if (hash === "#/dados") return renderDados();
  return renderExercicios();
}

function tpl(strings, ...vals) { return strings.reduce((s, str, i) => s + str + (vals[i] ?? ""), ""); }

async function renderExercicios() {
  try {
    const todos = (await DB.listar("exercicios")).sort((a, b) => a.titulo.localeCompare(b.titulo, "pt"));
    const filtro = window._filtroCategoria || null;
    const lista = filtro ? todos.filter(e => e.categoria === filtro) : todos;
    app.innerHTML = tpl`
      <div class="wrap">
        <div class="head"><h2>Biblioteca</h2><span class="muted">${lista.length} de ${todos.length}</span></div>
        <a href="#/exercicios/novo" class="btn" style="display:block;margin-bottom:14px">+ Novo exercício</a>
        <div class="pills" id="pills" style="margin-bottom:14px">
          <button type="button" class="pill ${!filtro ? "on" : ""}" data-cat="" aria-pressed="${!filtro}">Todos</button>
          ${CATEGORIAS.map(c => `<button type="button" class="pill ${filtro === c ? "on" : ""}" data-cat="${esc(c)}" aria-pressed="${filtro === c}">${esc(c)}</button>`).join("")}
        </div>
        ${lista.length ? `<ul class="list">${lista.map(exCard).join("")}</ul>` : `<div class="empty"><div class="big">🏋️</div>Sem exercícios${filtro ? " nesta categoria" : ""}.</div>`}
      </div>
    `;
    app.querySelectorAll("#pills .pill").forEach(p => p.onclick = () => { window._filtroCategoria = p.dataset.cat || null; renderExercicios(); });
  } catch (err) {
    app.innerHTML = `<div class="wrap"><div class="empty"><div class="big">⚠️</div>Erro ao carregar exercícios.</div></div>`;
    console.error(err);
  }
}

function exCard(e) {
  return tpl`
    <li class="card ex-card">
      <a href="#/exercicios/${e.id}" style="text-decoration:none;color:inherit;display:flex;flex-direction:column;gap:8px">
        <div class="ex-cat">
          <span class="t" style="font-weight:700;font-size:16px">${esc(e.titulo)}</span>
          ${e.usa_equipamento ? `<span class="tag" title="Precisa de equipamento">🏋️ equip.</span>` : ""}
          <span class="tag marca" style="margin-left:auto">${esc(e.nivel ?? "")}</span>
        </div>
        <div class="ex-imgs">
          ${e.imagem_url ? `<img src="${e.imagem_url}" alt="${esc(e.titulo)} — início" loading="lazy" onerror="this.style.visibility='hidden'">` : ""}
          ${e.imagem_url_fim ? `<img src="${e.imagem_url_fim}" alt="${esc(e.titulo)} — fim" loading="lazy" onerror="this.style.visibility='hidden'">` : ""}
        </div>
      </a>
    </li>
  `;
}

async function renderExercicioDetail(id) {
  try {
    const e = await DB.obter("exercicios", id);
    if (!e) { app.innerHTML = `<div class="wrap"><div class="empty">Exercício não encontrado.</div></div>`; return; }
    app.innerHTML = tpl`
      <div class="wrap">
        <a href="#/exercicios" class="btn-link">&larr; Voltar</a>
        <div class="spacer"></div>
        <h2>${esc(e.titulo)}</h2>
        <div class="pills" style="margin:8px 0"><span class="tag marca">${esc(e.nivel ?? "")}</span><span class="tag">${esc(e.categoria ?? "")}</span>${e.usa_equipamento ? `<span class="tag">🏋️ precisa de equipamento</span>` : ""}</div>
        <div class="ex-imgs" style="margin-bottom:14px">
          ${e.imagem_url ? `<img src="${e.imagem_url}" alt="${esc(e.titulo)} — início">` : ""}
          ${e.imagem_url_fim ? `<img src="${e.imagem_url_fim}" alt="${esc(e.titulo)} — fim">` : ""}
        </div>
        ${e.descricao ? `<p>${esc(e.descricao)}</p>` : ""}
        ${e.video_url ? `<div class="spacer"></div><a class="btn ghost" href="${esc(e.video_url)}" target="_blank">▶ Ver vídeo</a>` : ""}
        <div class="spacer"></div>
        <dl class="info">
          <dt>Séries pré-definidas</dt><dd>${e.series_predefinido ?? "—"}</dd>
          <dt>${e.tipo_alvo === "tempo" ? "Tempo pré-definido" : "Reps pré-definidas"}</dt>
          <dd>${e.tipo_alvo === "tempo" ? (e.tempo_predefinido_seg ?? "—") + (e.tempo_predefinido_seg ? " s" : "") : (e.reps_predefinido ?? "—")}</dd>
          <dt>Descanso pré-definido</dt><dd>${e.descanso_predefinido_seg ?? "—"}${e.descanso_predefinido_seg ? " s" : ""}</dd>
        </dl>
        <div class="spacer"></div>
        <a href="#/exercicios/${e.id}/editar" class="btn ghost">✎ Editar</a>
      </div>
    `;
  } catch (err) {
    app.innerHTML = `<div class="wrap"><div class="empty"><div class="big">⚠️</div>Erro ao carregar o exercício.</div></div>`;
    console.error(err);
  }
}

function _lerFicheiroComoDataURL(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result);
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });
}

async function renderExercicioForm(id) {
  const e = id ? await DB.obter("exercicios", id) : null;
  if (id && !e) return (location.hash = "#/exercicios");
  const voltar = id ? `#/exercicios/${id}` : "#/exercicios";
  app.innerHTML = tpl`
    <div class="wrap">
      <a href="${voltar}" class="btn-link">&larr; Voltar</a>
      <div class="spacer"></div>
      <h2>${id ? "Editar exercício" : "Novo exercício"}</h2>
      <div class="spacer"></div>
      <form class="stack" id="form-exercicio">
        <label class="field"><span>Título</span><input name="titulo" value="${esc(e?.titulo ?? "")}" required></label>
        <label class="field"><span>Categoria</span>
          <select name="categoria">${CATEGORIAS.map((c) => `<option value="${c}" ${e?.categoria === c ? "selected" : ""}>${esc(c)}</option>`).join("")}</select>
        </label>
        <label class="field"><span>Nível</span>
          <select name="nivel">${NIVEIS.map((n) => `<option value="${n}" ${e?.nivel === n ? "selected" : ""}>${esc(n)}</option>`).join("")}</select>
        </label>
        <label class="field"><span>Tipo de alvo</span>
          <select name="tipo_alvo">
            <option value="reps" ${e?.tipo_alvo !== "tempo" ? "selected" : ""}>Repetições</option>
            <option value="tempo" ${e?.tipo_alvo === "tempo" ? "selected" : ""}>Tempo</option>
          </select>
        </label>
        <label class="field row" style="align-items:center;gap:8px">
          <input type="checkbox" name="usa_equipamento" style="width:auto" ${e?.usa_equipamento ? "checked" : ""}>
          <span>🏋️ Precisa de equipamento</span>
        </label>
        <div class="grid3">
          <label class="field"><span>Séries pré-def.</span><input type="number" name="series_predefinido" value="${e ? (e.series_predefinido ?? "") : 3}"></label>
          <label class="field"><span>Reps/Tempo(s) pré-def.</span><input type="number" name="alvo_predefinido" value="${e ? (e.tipo_alvo === "tempo" ? (e.tempo_predefinido_seg ?? "") : (e.reps_predefinido ?? "")) : 12}"></label>
          <label class="field"><span>Descanso (s) pré-def.</span><input type="number" name="descanso_predefinido_seg" value="${e ? (e.descanso_predefinido_seg ?? "") : 120}"></label>
        </div>
        <label class="field"><span>Descrição</span><textarea name="descricao" rows="3">${esc(e?.descricao ?? "")}</textarea></label>
        <label class="field"><span>Vídeo (URL)</span><input name="video_url" value="${esc(e?.video_url ?? "")}"></label>
        <label class="field"><span>Imagem início</span><input type="file" name="imagem_url" accept="image/*"></label>
        <label class="field"><span>Imagem fim (opcional)</span><input type="file" name="imagem_url_fim" accept="image/*"></label>
        <button class="btn" type="submit">Guardar</button>
      </form>
    </div>
  `;
  document.getElementById("form-exercicio").addEventListener("submit", async (ev) => {
    ev.preventDefault();
    const fd = new FormData(ev.target);
    const tipoAlvo = fd.get("tipo_alvo");
    const alvoPredefinido = fd.get("alvo_predefinido") ? Number(fd.get("alvo_predefinido")) : null;
    const dados = {
      titulo: fd.get("titulo"),
      categoria: fd.get("categoria"),
      nivel: fd.get("nivel"),
      tipo_alvo: tipoAlvo,
      usa_equipamento: fd.get("usa_equipamento") === "on",
      series_predefinido: fd.get("series_predefinido") ? Number(fd.get("series_predefinido")) : null,
      reps_predefinido: tipoAlvo === "tempo" ? null : alvoPredefinido,
      tempo_predefinido_seg: tipoAlvo === "tempo" ? alvoPredefinido : null,
      descanso_predefinido_seg: fd.get("descanso_predefinido_seg") ? Number(fd.get("descanso_predefinido_seg")) : null,
      descricao: fd.get("descricao") || null,
      video_url: fd.get("video_url") || null,
      imagem_url: e?.imagem_url ?? null,
      imagem_url_fim: e?.imagem_url_fim ?? null,
      progressao_anterior_id: e?.progressao_anterior_id ?? null,
      notas: e?.notas ?? null,
    };
    const fImagem = fd.get("imagem_url");
    if (fImagem && fImagem.size) dados.imagem_url = await _lerFicheiroComoDataURL(fImagem);
    const fImagemFim = fd.get("imagem_url_fim");
    if (fImagemFim && fImagemFim.size) dados.imagem_url_fim = await _lerFicheiroComoDataURL(fImagemFim);
    try {
      if (id) {
        await DB.atualizar("exercicios", { ...dados, id: Number(id) });
        location.hash = `#/exercicios/${id}`;
      } else {
        const novoId = await DB.criar("exercicios", dados);
        location.hash = `#/exercicios/${novoId}`;
      }
    } catch (err) {
      alert("Não consegui guardar o exercício.");
      console.error(err);
    }
  });
}

async function renderDados() {
  try {
    const contagens = {};
    for (const s of STORES) contagens[s] = (await DB.listar(s)).length;
    app.innerHTML = tpl`
      <div class="wrap">
        <h2>Dados</h2>
        <div class="spacer"></div>
        <dl class="info">
          ${STORES.map(s => `<dt>${esc(s)}</dt><dd>${contagens[s]}</dd>`).join("")}
        </dl>
        <div class="spacer"></div>
        <button class="btn" id="btn-exportar">⬇ Exportar backup (JSON)</button>
        <div class="spacer"></div>
        <button class="btn ghost" id="btn-sync-exercicios">🔄 Atualizar biblioteca de exercícios</button>
        <p class="muted" style="font-size:12px;margin-top:6px">Vai buscar a versão mais recente dos exercícios ao servidor (imagens, vídeos, etc.) sem tocar nos teus treinos e séries já registados.</p>
        <div class="spacer"></div>
        <label class="field"><span>Importar backup / dados iniciais</span>
          <input type="file" id="input-importar" accept="application/json">
        </label>
      </div>
    `;
    document.getElementById("btn-exportar").onclick = async () => {
      const payload = await DB.exportarTudo();
      const blob = new Blob([JSON.stringify(payload, null, 2)], { type: "application/json" });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `calisthenics-backup-${new Date().toISOString().slice(0, 10)}.json`;
      a.click();
      URL.revokeObjectURL(url);
    };
    document.getElementById("btn-sync-exercicios").onclick = async () => {
      try {
        const res = await fetch("export.json?" + Date.now());
        if (!res.ok) throw new Error("HTTP " + res.status);
        const payload = await res.json();
        for (const ex of payload.dados.exercicios || []) {
          const local = await DB.obter("exercicios", ex.id);
          // Nunca substituir uma foto carregada manualmente (data:...) pela do servidor.
          const imagemUrl = local?.imagem_url?.startsWith("data:") ? local.imagem_url : ex.imagem_url;
          const imagemUrlFim = local?.imagem_url_fim?.startsWith("data:") ? local.imagem_url_fim : ex.imagem_url_fim;
          await DB.atualizar("exercicios", { ...ex, imagem_url: imagemUrl, imagem_url_fim: imagemUrlFim });
        }
        alert("Biblioteca de exercícios atualizada.");
        renderDados();
      } catch (err) {
        alert("Não consegui atualizar — verifica a ligação à internet.");
        console.error(err);
      }
    };
    document.getElementById("input-importar").onchange = async (ev) => {
      const file = ev.target.files[0];
      if (!file) return;
      let payload;
      try {
        payload = JSON.parse(await file.text());
      } catch {
        alert("Ficheiro inválido: não foi possível ler o JSON.");
        return;
      }
      await DB.importarTudo(payload, true);
      alert("Importado.");
      renderDados();
    };
  } catch (err) {
    app.innerHTML = `<div class="wrap"><div class="empty"><div class="big">⚠️</div>Erro ao carregar a página de dados.</div></div>`;
    console.error(err);
  }
}

window.addEventListener("hashchange", render);
render();
