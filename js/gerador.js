// Gera os itens de um treino a partir de categoria + duração — porta 1:1 do
// app/gerador.py (backend FastAPI descontinuado). Função pura: recebe a lista
// de exercícios (já carregada do IndexedDB) e devolve os treino_itens prontos
// a gravar (sem treino_id, atribuído por quem chamar).

const CATEGORIAS_PRINCIPAIS = ["empurrar", "puxar", "pernas", "core"];

const _ORDEM_PREFERENCIA_NIVEL = { intermedio: 0, avancado: 1, iniciante: 2, elite: 3 };
const _REPS_POR_NIVEL = { iniciante: 12, intermedio: 10, avancado: 8, elite: 6 };
const _TEMPO_POR_NIVEL_SEG = { iniciante: 30, intermedio: 25, avancado: 20, elite: 15 };

const SERIES_TREINO = 3;
const DESCANSO_TREINO_SEG = 75;
const DESCANSO_AQUECIMENTO_SEG = 20;
const DESCANSO_ALONGAMENTO_SEG = 10;
const MAX_EXERCICIOS_TREINO = 6;

const _AQUECIMENTO_TITULOS = new Set([
  "Mobilidade de ombro (dislocates)", "Rotação de ancas", "Marcha no lugar com joelhos altos",
]);
const _ALONGAMENTO_TITULOS = new Set([
  "Ponte de ombros (bridge)", "Alongamento de isquiotibiais", "Alongamento de quadríceps",
]);

function _embaralhar(lista) {
  const a = lista.slice();
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

function _candidatos(exercicios, categoria) {
  return exercicios
    .filter((e) => e.categoria === categoria)
    .sort((a, b) => {
      const pa = _ORDEM_PREFERENCIA_NIVEL[a.nivel] ?? 4, pb = _ORDEM_PREFERENCIA_NIVEL[b.nivel] ?? 4;
      return pa !== pb ? pa - pb : a.titulo.localeCompare(b.titulo);
    });
}

function _item(exercicio_id, fase, ordem, series, { reps = null, tempo_seg = null, descanso = null } = {}) {
  return { exercicio_id, fase, ordem, series_alvo: series, reps_alvo: reps, tempo_alvo_seg: tempo_seg, descanso_seg: descanso };
}

function _duracaoExercicioSeg(series, reps, tempoSeg, descanso) {
  const trabalho = tempoSeg != null ? tempoSeg : (reps || 0) * 3; // ~3s por repetição
  return series * trabalho + (series - 1) * descanso;
}

// Devolve a lista de treino_itens (sem treino_id) com fases
// aquecimento -> treino -> alongamento, ajustados à duração pedida.
function gerarTreinoItens(exercicios, categoria, duracaoMin) {
  const duracaoSeg = Math.max(duracaoMin, 5) * 60;
  const aquecimentoSeg = Math.min(300, Math.max(90, Math.round(duracaoSeg * 0.15)));
  const alongamentoSeg = Math.min(300, Math.max(90, Math.round(duracaoSeg * 0.15)));
  const treinoSeg = Math.max(180, duracaoSeg - aquecimentoSeg - alongamentoSeg);

  const itens = [];
  let ordem = 0;
  const usadosMobilidade = new Set();

  // --- Aquecimento: mobilidade dinâmica ---
  const mobilidade = _candidatos(exercicios, "mobilidade");
  const aquecPool = _embaralhar(mobilidade.filter((e) => _AQUECIMENTO_TITULOS.has(e.titulo)));
  let tempoUsado = 0;
  for (const ex of aquecPool.slice(0, 2)) {
    if (ex.tipo_alvo === "tempo") {
      const t = _TEMPO_POR_NIVEL_SEG.iniciante;
      itens.push(_item(ex.id, "aquecimento", ordem, 1, { tempo_seg: t, descanso: DESCANSO_AQUECIMENTO_SEG }));
      tempoUsado += t;
    } else {
      const r = _REPS_POR_NIVEL.iniciante;
      itens.push(_item(ex.id, "aquecimento", ordem, 1, { reps: r, descanso: DESCANSO_AQUECIMENTO_SEG }));
      tempoUsado += r * 3;
    }
    usadosMobilidade.add(ex.id);
    ordem++;
    if (tempoUsado >= aquecimentoSeg) break;
  }

  // --- Treino principal ---
  const categoriasAlvo = categoria === "all" ? CATEGORIAS_PRINCIPAIS : [categoria];
  const pools = Object.fromEntries(categoriasAlvo.map((c) => [c, _candidatos(exercicios, c)]));
  const posicao = Object.fromEntries(categoriasAlvo.map((c) => [c, 0]));
  tempoUsado = 0;
  let nExercicios = 0, i = 0;
  while (tempoUsado < treinoSeg && nExercicios < MAX_EXERCICIOS_TREINO) {
    const cat = categoriasAlvo[i % categoriasAlvo.length];
    i++;
    if (posicao[cat] >= pools[cat].length) {
      if (categoriasAlvo.every((c) => posicao[c] >= pools[c].length)) break;
      continue;
    }
    const ex = pools[cat][posicao[cat]];
    posicao[cat]++;
    const nivel = ex.nivel || "intermedio";
    const series = ex.series_predefinido ?? SERIES_TREINO;
    const descanso = ex.descanso_predefinido_seg ?? DESCANSO_TREINO_SEG;
    if (ex.tipo_alvo === "tempo") {
      const t = ex.tempo_predefinido_seg ?? (_TEMPO_POR_NIVEL_SEG[nivel] ?? 25);
      itens.push(_item(ex.id, "treino", ordem, series, { tempo_seg: t, descanso }));
      tempoUsado += _duracaoExercicioSeg(series, null, t, descanso);
    } else {
      const r = ex.reps_predefinido ?? (_REPS_POR_NIVEL[nivel] ?? 10);
      itens.push(_item(ex.id, "treino", ordem, series, { reps: r, descanso }));
      tempoUsado += _duracaoExercicioSeg(series, r, null, descanso);
    }
    ordem++;
    nExercicios++;
  }
  // Garante pelo menos 1 exercício de treino mesmo com duração muito curta.
  if (nExercicios === 0) {
    for (const c of categoriasAlvo) {
      if (pools[c].length) {
        const ex = pools[c][0];
        const nivel = ex.nivel || "intermedio";
        if (ex.tipo_alvo === "tempo") {
          itens.push(_item(ex.id, "treino", ordem, SERIES_TREINO, { tempo_seg: _TEMPO_POR_NIVEL_SEG[nivel] ?? 25, descanso: DESCANSO_TREINO_SEG }));
        } else {
          itens.push(_item(ex.id, "treino", ordem, SERIES_TREINO, { reps: _REPS_POR_NIVEL[nivel] ?? 10, descanso: DESCANSO_TREINO_SEG }));
        }
        ordem++;
        break;
      }
    }
  }

  // --- Alongamento: mobilidade estática (diferente das dinâmicas do aquecimento) ---
  const alongPool = _embaralhar(mobilidade.filter((e) => _ALONGAMENTO_TITULOS.has(e.titulo) && !usadosMobilidade.has(e.id)));
  tempoUsado = 0;
  for (const ex of alongPool.slice(0, 2)) {
    const t = 25;
    itens.push(_item(ex.id, "alongamento", ordem, 1, { tempo_seg: t, descanso: DESCANSO_ALONGAMENTO_SEG }));
    ordem++;
    tempoUsado += t;
    if (tempoUsado >= alongamentoSeg) break;
  }

  return itens;
}

// ------- self-check (corre só em Node) -------
if (typeof window === "undefined" && typeof process !== "undefined") {
  const assert = (c, m) => { if (!c) { console.error("FALHOU:", m); process.exit(1); } };

  const mockExercicios = [
    { id: 1, categoria: "empurrar", nivel: "iniciante", titulo: "Flexão", tipo_alvo: "reps" },
    { id: 2, categoria: "puxar", nivel: "intermedio", titulo: "Remada", tipo_alvo: "reps" },
    { id: 3, categoria: "pernas", nivel: "avancado", titulo: "Pistol", tipo_alvo: "reps" },
    { id: 4, categoria: "core", nivel: "intermedio", titulo: "Prancha", tipo_alvo: "tempo" },
    { id: 22, categoria: "mobilidade", nivel: "iniciante", titulo: "Mobilidade de ombro (dislocates)", tipo_alvo: "reps" },
    { id: 23, categoria: "mobilidade", nivel: "iniciante", titulo: "Ponte de ombros (bridge)", tipo_alvo: "tempo" },
    { id: 24, categoria: "mobilidade", nivel: "iniciante", titulo: "Rotação de ancas", tipo_alvo: "reps" },
    { id: 26, categoria: "mobilidade", nivel: "iniciante", titulo: "Alongamento de isquiotibiais", tipo_alvo: "tempo" },
  ];

  const r1 = gerarTreinoItens(mockExercicios, "core", 30);
  assert(r1.some((i) => i.fase === "aquecimento"), "core 30min: tem aquecimento");
  assert(r1.some((i) => i.fase === "treino" && i.exercicio_id === 4), "core 30min: treino usa o exercício core");
  assert(r1.some((i) => i.fase === "alongamento"), "core 30min: tem alongamento");
  assert(r1.every((i, idx) => i.ordem === idx), "ordem sequencial sem saltos");

  const r2 = gerarTreinoItens(mockExercicios, "all", 45);
  const catsUsadas = new Set(r2.filter((i) => i.fase === "treino").map((i) => mockExercicios.find((e) => e.id === i.exercicio_id).categoria));
  assert(catsUsadas.size > 1, "all: mistura mais que 1 categoria no treino");

  const r3 = gerarTreinoItens(mockExercicios, "empurrar", 5);
  assert(r3.filter((i) => i.fase === "treino").length >= 1, "duração mínima: pelo menos 1 exercício de treino");

  const r4 = gerarTreinoItens([], "core", 30);
  assert(r4.filter((i) => i.fase === "treino").length === 0, "sem exercícios: sem itens de treino (não rebenta)");

  console.log("ok gerador.js: fases, categorias, duração mínima, sem exercícios");
}
