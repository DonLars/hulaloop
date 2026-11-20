// Verhindert, dass sich die Liste unter dem Finger/der Maus neu aufbaut:
// Solange jemand gerade auf einen Button zielt, tippt oder wischt, werden
// neue Daten nur zwischengespeichert und erst kurz danach gezeichnet.
// So landet ein Klick immer auf dem Eintrag, den man auch gesehen hat.
(function () {
  const RELEASE_DELAY = 300;   // Nachlauf nach dem Loslassen
  const MAX_FREEZE = 8000;     // Sicherheitsnetz, falls ein Loslass-Event fehlt
  const canHover = window.matchMedia('(hover: hover) and (pointer: fine)').matches;

  let frozen = false;
  let pending = null;
  let releaseTimer = null;
  let failsafeTimer = null;

  function freeze() {
    clearTimeout(releaseTimer);
    clearTimeout(failsafeTimer);
    frozen = true;
    failsafeTimer = setTimeout(unfreeze, MAX_FREEZE);
  }

  function unfreeze() {
    clearTimeout(releaseTimer);
    clearTimeout(failsafeTimer);
    frozen = false;
    if (pending) {
      const fn = pending;
      pending = null;
      fn();
    }
  }

  function release(delay) {
    clearTimeout(releaseTimer);
    releaseTimer = setTimeout(unfreeze, delay);
  }

  // Führt fn sofort aus oder – falls gerade interagiert wird – danach.
  // Es zählt nur der jeweils neueste Stand.
  window.runWhenStable = function (fn) {
    if (frozen) pending = fn;
    else fn();
  };

  // Hält die Liste für ms Millisekunden an (z.B. solange "Wirklich löschen?" offen ist).
  window.holdRendering = function (ms) {
    freeze();
    release(ms);
  };

  window.watchInteraction = function (el) {
    el.addEventListener('pointerdown', freeze);
    el.addEventListener('pointerup', () => release(RELEASE_DELAY));
    el.addEventListener('pointercancel', () => release(RELEASE_DELAY));
    el.addEventListener('touchstart', freeze, { passive: true });
    el.addEventListener('touchend', () => release(RELEASE_DELAY));
    el.addEventListener('touchcancel', () => release(RELEASE_DELAY));
    if (canHover) {
      // Maus: schon das Zielen auf einen Button friert die Liste ein.
      el.addEventListener('mouseover', (e) => { if (e.target.closest('button, a')) freeze(); });
      el.addEventListener('mouseout', (e) => { if (e.target.closest('button, a')) release(RELEASE_DELAY); });
    }
  };
})();
