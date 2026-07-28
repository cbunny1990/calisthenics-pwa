// Camada de dados offline (IndexedDB). Sem servidor: tudo vive no telemóvel.
const DB_NOME = "calisthenics";
const DB_VERSAO = 1;
const STORES = ["exercicios", "treinos", "treino_itens", "series"];

let _db = null;

function abrirDB() {
  return new Promise((resolve, reject) => {
    if (_db) return resolve(_db);
    const req = indexedDB.open(DB_NOME, DB_VERSAO);
    req.onupgradeneeded = (e) => {
      const db = e.target.result;
      if (!db.objectStoreNames.contains("exercicios"))
        db.createObjectStore("exercicios", { keyPath: "id", autoIncrement: true });
      if (!db.objectStoreNames.contains("treinos"))
        db.createObjectStore("treinos", { keyPath: "id", autoIncrement: true });
      if (!db.objectStoreNames.contains("treino_itens")) {
        const s = db.createObjectStore("treino_itens", { keyPath: "id", autoIncrement: true });
        s.createIndex("treino_id", "treino_id", { unique: false });
      }
      if (!db.objectStoreNames.contains("series")) {
        const s = db.createObjectStore("series", { keyPath: "id", autoIncrement: true });
        s.createIndex("treino_item_id", "treino_item_id", { unique: false });
      }
    };
    req.onsuccess = () => { _db = req.result; resolve(_db); };
    req.onerror = () => reject(req.error);
  });
}

function _tx(store, modo) {
  return abrirDB().then((db) => db.transaction(store, modo).objectStore(store));
}
function _prom(req) {
  return new Promise((resolve, reject) => {
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

const DB = {
  async listar(store) {
    const os = await _tx(store, "readonly");
    return _prom(os.getAll());
  },
  async obter(store, id) {
    const os = await _tx(store, "readonly");
    return _prom(os.get(Number(id)));
  },
  async criar(store, obj) {
    const os = await _tx(store, "readwrite");
    return _prom(os.add(obj));
  },
  async atualizar(store, obj) {
    const os = await _tx(store, "readwrite");
    return _prom(os.put(obj));
  },
  async apagar(store, id) {
    const os = await _tx(store, "readwrite");
    return _prom(os.delete(Number(id)));
  },
  async porIndice(store, indice, valor) {
    const os = await _tx(store, "readonly");
    return _prom(os.index(indice).getAll(valor));
  },
  async exportarTudo() {
    const dados = {};
    for (const s of STORES) dados[s] = await this.listar(s);
    return { versao: DB_VERSAO, exportado_em: new Date().toISOString(), dados };
  },
  async importarTudo(payload, substituir = true) {
    const db = await abrirDB();
    const tx = db.transaction(STORES, "readwrite");
    for (const s of STORES) {
      const os = tx.objectStore(s);
      if (substituir) os.clear();
      for (const registo of (payload.dados[s] || [])) os.put(registo);
    }
    return new Promise((resolve, reject) => {
      tx.oncomplete = () => resolve(true);
      tx.onerror = () => reject(tx.error);
    });
  },
};

const CATEGORIAS = ["empurrar", "puxar", "pernas", "core"];
const NIVEIS = ["iniciante", "intermedio", "avancado"];

// ------- self-check (corre só em Node) -------
if (typeof window === "undefined" && typeof process !== "undefined") {
  const assert = (c, m) => { if (!c) { console.error("FALHOU:", m); process.exit(1); } };
  assert(STORES.length === 4, "4 stores definidos");
  assert(CATEGORIAS.includes("empurrar") && NIVEIS.includes("avancado"), "constantes de domínio ok");
  console.log("ok db.js: estrutura de stores e constantes");
}
