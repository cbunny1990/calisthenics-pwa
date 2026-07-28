// Cronómetro de exercício/descanso — porta direta do backend FastAPI (já era JS vanilla).
(function () {
  function formatMMSS(totalSeconds) {
    const s = Math.max(0, totalSeconds);
    const m = Math.floor(s / 60);
    const r = s % 60;
    return String(m).padStart(2, "0") + ":" + String(r).padStart(2, "0");
  }

  function beep() {
    try {
      const ctx = new (window.AudioContext || window.webkitAudioContext)();
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.connect(gain);
      gain.connect(ctx.destination);
      osc.frequency.value = 880;
      gain.gain.setValueAtTime(0.2, ctx.currentTime);
      osc.start();
      osc.stop(ctx.currentTime + 0.3);
      osc.onended = () => ctx.close();
    } catch (e) { /* Web Audio indisponível — falha em silêncio */ }
  }

  function vibrate() {
    try { navigator.vibrate && navigator.vibrate([200, 100, 200]); }
    catch (e) { /* iOS não suporta vibrate — falha em silêncio */ }
  }

  function initTimer(el) {
    const display = el.querySelector(".js-timer-display");
    const startBtn = el.querySelector(".js-timer-start");
    const resetBtn = el.querySelector(".js-timer-reset");
    const secondsInput = el.querySelector(".js-timer-seconds-input");
    const isDescanso = el.dataset.role === "descanso";

    function totalSeconds() {
      if (secondsInput) {
        const v = parseInt(secondsInput.value, 10);
        if (!isNaN(v) && v > 0) return v;
      }
      return parseInt(el.dataset.seconds, 10) || 0;
    }

    let remaining = totalSeconds();
    display.textContent = formatMMSS(remaining);

    function preencherTempoSerie() {
      if (isDescanso) return; // descanso não corresponde a uma série executada
      const li = el.closest("li");
      const input = li && li.querySelector('input[name="tempo_seg"]');
      if (input) input.value = el.dataset.seconds;
    }

    function parar(concluido) {
      if (el._handle) { clearInterval(el._handle); el._handle = null; }
      startBtn.textContent = "Iniciar";
      if (concluido) {
        display.textContent = "00:00";
        beep();
        vibrate();
        preencherTempoSerie();
      }
    }

    function tick() {
      remaining -= 1;
      if (remaining <= 0) { parar(true); return; }
      display.textContent = formatMMSS(remaining);
    }

    let iniciado = false;

    startBtn.addEventListener("click", function () {
      if (el._handle) { parar(false); return; } // pausa — mantém "remaining" para retomar
      if (!iniciado || remaining <= 0) remaining = totalSeconds(); // arranque de raiz, não retoma
      iniciado = true;
      display.textContent = formatMMSS(remaining);
      startBtn.textContent = "Parar";
      el._handle = setInterval(tick, 1000);
    });

    if (resetBtn) {
      resetBtn.addEventListener("click", function () {
        parar(false);
        remaining = totalSeconds();
        display.textContent = formatMMSS(remaining);
      });
    }
  }

  // Ao contrário da versão FastAPI (uma página por load), a PWA re-renderiza
  // o ecrã via innerHTML a cada navegação — expõe-se a função para o app.js
  // chamar depois de cada render, em vez de um DOMContentLoaded único.
  window.iniciarTimers = function (raiz) {
    (raiz || document).querySelectorAll(".js-timer").forEach(initTimer);
  };
})();
