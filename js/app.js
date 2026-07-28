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
  const hash = location.hash || "#/exercicios";
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
  atualizarNav();
  app.innerHTML = `<div class="wrap"><p class="muted">A carregar…</p></div>`;
  await semearSeVazio();
  const hash = location.hash || "#/exercicios";
  if (hash.startsWith("#/exercicios/")) return renderExercicioDetail(hash.split("/")[2]);
  if (hash === "#/treinos/gerar") return renderTreinoGerarForm();
  let m = hash.match(/^#\/treinos\/(\d+)\/editar$/);
  if (m) return renderTreinoEditForm(m[1]);
  m = hash.match(/^#\/treinos\/(\d+)$/);
  if (m) return renderTreinoDetail(m[1]);
  if (hash === "#/treinos") return renderTreinos();
  if (hash === "#/dados") return renderDados();
  return renderExercicios();
}

function tpl(strings, ...vals) { return strings.reduce((s, str, i) => s + str + (vals[i] ?? ""), ""); }

async function renderExercicios() {
  try {
    const todos = await DB.listar("exercicios");
    const filtro = window._filtroCategoria || null;
    const lista = filtro ? todos.filter(e => e.categoria === filtro) : todos;
    app.innerHTML = tpl`
      <div class="wrap">
        <div class="head"><h2>Biblioteca</h2><span class="muted">${lista.length} de ${todos.length}</span></div>
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
          <span class="tag marca" style="margin-left:auto">${esc(e.nivel ?? "")}</span>
        </div>
        <div class="ex-imgs">
          <img src="${e.imagem_url || ""}" alt="${esc(e.titulo)} — início" loading="lazy" onerror="this.style.visibility='hidden'">
          <img src="${e.imagem_url_fim || e.imagem_url || ""}" alt="${esc(e.titulo)} — fim" loading="lazy" onerror="this.style.visibility='hidden'">
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
        <div class="pills" style="margin:8px 0"><span class="tag marca">${esc(e.nivel ?? "")}</span><span class="tag">${esc(e.categoria ?? "")}</span></div>
        <div class="ex-imgs" style="margin-bottom:14px">
          <img src="${e.imagem_url || ""}" alt="${esc(e.titulo)} — início">
          <img src="${e.imagem_url_fim || e.imagem_url || ""}" alt="${esc(e.titulo)} — fim">
        </div>
        ${e.descricao ? `<p>${esc(e.descricao)}</p>` : ""}
        ${e.video_url ? `<div class="spacer"></div><a class="btn ghost" href="${esc(e.video_url)}" target="_blank">▶ Ver vídeo</a>` : ""}
      </div>
    `;
  } catch (err) {
    app.innerHTML = `<div class="wrap"><div class="empty"><div class="big">⚠️</div>Erro ao carregar o exercício.</div></div>`;
    console.error(err);
  }
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
