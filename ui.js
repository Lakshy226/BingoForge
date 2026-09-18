/**
 * ui.js
 * -----------------------------------------------------------------------
 * Screen navigation, modal system, and all state -> DOM rendering.
 * app.js owns event wiring (form submits, button clicks); this module
 * owns turning `State.game` into what's on screen.
 * -----------------------------------------------------------------------
 */

const UI = (() => {
  const screens = {};
  let activeScreen = "home";

  // Tracks what the UI has already reacted to, so re-renders don't
  // re-trigger animations/toasts/modals for things already shown.
  const seen = {
    calledCount: 0,
    claimIds: new Set(),
    awardedTypes: new Set(),
    playerIds: new Set(),
  };

  function cacheScreens() {
    document.querySelectorAll(".screen").forEach((el) => {
      screens[el.dataset.screen] = el;
    });
  }

  function showScreen(name) {
    if (!screens[name]) return;
    Object.values(screens).forEach((el) => el.classList.remove("active"));
    screens[name].classList.add("active");
    activeScreen = name;
    window.scrollTo({ top: 0, behavior: "smooth" });
  }

  function getActiveScreen() {
    return activeScreen;
  }

  // --------------------------------------------------------------- //
  // MODALS
  // --------------------------------------------------------------- //

  function openModal(innerHtml, { onOpen, labelledBy } = {}) {
    const root = document.getElementById("modal-root");
    root.innerHTML = `<div class="modal-box" role="dialog" aria-modal="true" ${labelledBy ? `aria-labelledby="${labelledBy}"` : ""}>${innerHtml}</div>`;
    root.hidden = false;
    const closeTargets = root.querySelectorAll("[data-modal-close]");
    closeTargets.forEach((btn) => btn.addEventListener("click", closeModal));
    root.onclick = (e) => { if (e.target === root) closeModal(); };
    document.addEventListener("keydown", onEscClose);
    if (onOpen) onOpen(root);
    const focusable = root.querySelector("button, input, [tabindex]");
    if (focusable) focusable.focus();
  }

  function onEscClose(e) {
    if (e.key === "Escape") closeModal();
  }

  function closeModal() {
    const root = document.getElementById("modal-root");
    root.hidden = true;
    root.innerHTML = "";
    document.removeEventListener("keydown", onEscClose);
  }

  function openConfirmModal({ title, body, confirmLabel = "Confirm", cancelLabel = "Cancel", onConfirm, danger = false }) {
    openModal(`
      <h2 id="confirm-title">${title}</h2>
      <p>${body}</p>
      <div class="modal-actions">
        <button class="btn btn-ghost" data-modal-close>${cancelLabel}</button>
        <button class="btn ${danger ? "btn-primary" : "btn-primary"}" id="confirm-modal-yes">${confirmLabel}</button>
      </div>
    `, {
      labelledBy: "confirm-title",
      onOpen: (root) => {
        root.querySelector("#confirm-modal-yes").addEventListener("click", () => {
          closeModal();
          onConfirm();
        });
      },
    });
  }

  function openHelpModal() {
    openModal(`
      <h2 id="help-title">How BingoForge works</h2>
      <div class="help-columns">
        <div>
          <h3>For the host</h3>
          <ol>
            <li>Create a game.</li>
            <li>Share the group code.</li>
            <li>Wait for players.</li>
            <li>Start the game.</li>
            <li>Call numbers.</li>
            <li>Verify achievement claims.</li>
            <li>End the game.</li>
          </ol>
        </div>
        <div>
          <h3>For players</h3>
          <ol>
            <li>Enter the group code.</li>
            <li>Enter your name.</li>
            <li>Join the game.</li>
            <li>Wait for the host.</li>
            <li>Mark called numbers.</li>
            <li>Claim First Row or Four Corners.</li>
            <li>Show your card to the host.</li>
            <li>Wait for verification.</li>
          </ol>
        </div>
      </div>
      <div class="modal-actions">
        <button class="btn btn-primary" data-modal-close>Got it</button>
      </div>
    `, { labelledBy: "help-title" });
  }

  function openDemoModal() {
    const game = State.getGame();
    const hasGame = !!game;
    const botCount = hasGame ? game.players.filter((p) => p.isBot).length : 0;

    openModal(`
      <h2 id="demo-title">Demo mode</h2>
      <div class="demo-panel-body">
        <p>BingoForge has no backend yet, so use these tools to demonstrate the full product — lobby, calling, and achievement claims — from one browser.</p>
        <button class="btn btn-secondary btn-block" id="demo-add-player-btn" ${hasGame ? "" : "disabled"}>Add simulated player</button>
        <button class="btn btn-secondary btn-block" id="demo-claim-row-btn" ${hasGame ? "" : "disabled"}>Simulate a First Row claim</button>
        <button class="btn btn-secondary btn-block" id="demo-claim-corners-btn" ${hasGame ? "" : "disabled"}>Simulate a Four Corners claim</button>
        <p class="field-hint" style="text-align:left;margin-top:4px;">${hasGame ? `${botCount} simulated player${botCount === 1 ? "" : "s"} in this game.` : "Create a game first."}</p>
      </div>
      <div class="modal-actions">
        <button class="btn btn-ghost" data-modal-close>Close</button>
      </div>
    `, {
      labelledBy: "demo-title",
      onOpen: (root) => {
        const addBtn = root.querySelector("#demo-add-player-btn");
        const rowBtn = root.querySelector("#demo-claim-row-btn");
        const cornersBtn = root.querySelector("#demo-claim-corners-btn");
        if (addBtn) addBtn.addEventListener("click", () => { Game.demoAddBotPlayer(); closeModal(); });
        if (rowBtn) rowBtn.addEventListener("click", () => {
          const res = Game.demoSimulateClaim("firstRow");
          closeModal();
          if (!res.ok) Notifications.warning(res.error);
        });
        if (cornersBtn) cornersBtn.addEventListener("click", () => {
          const res = Game.demoSimulateClaim("fourCorners");
          closeModal();
          if (!res.ok) Notifications.warning(res.error);
        });
      },
    });
  }

  function openAchievementCelebration(label, winnerName, isMe) {
    openModal(`
      <div class="modal-celebrate">
        <span class="modal-trophy" aria-hidden="true">🏆</span>
        <h2 id="celebrate-title">${label} verified!</h2>
        <p>${isMe ? "Nice work — you got it first." : `${escapeHtml(winnerName)} claimed it first.`}</p>
        <div class="modal-actions" style="justify-content:center;">
          <button class="btn btn-primary" data-modal-close>Keep playing</button>
        </div>
      </div>
    `, { labelledBy: "celebrate-title" });
  }

  // --------------------------------------------------------------- //
  // SMALL HELPERS
  // --------------------------------------------------------------- //

  function escapeHtml(str) {
    const div = document.createElement("div");
    div.textContent = str == null ? "" : String(str);
    return div.innerHTML;
  }

  function timeAgo(ts) {
    const secs = Math.max(0, Math.floor((Date.now() - ts) / 1000));
    if (secs < 5) return "just now";
    if (secs < 60) return `${secs}s ago`;
    const mins = Math.floor(secs / 60);
    if (mins < 60) return `${mins}m ago`;
    const hrs = Math.floor(mins / 60);
    return `${hrs}h ago`;
  }

  function playerListItemHtml(player, { showFlag } = {}) {
    let flag = "";
    if (showFlag) {
      flag = player.isBot ? "Demo" : "";
    }
    return `
      <li class="player-item">
        <span class="player-avatar" aria-hidden="true">${escapeHtml(player.initials || player.name.slice(0, 2).toUpperCase())}</span>
        <span class="player-name">${escapeHtml(player.name)}</span>
        <span class="player-flag">${flag}</span>
      </li>
    `;
  }

  // --------------------------------------------------------------- //
  // HOME (cosmetic hero card)
  // --------------------------------------------------------------- //

  function renderHeroDemo() {
    const grid = document.getElementById("hero-mini-grid");
    if (!grid || grid.dataset.rendered) return;
    const card = BingoCard.generateCard({ freeSpace: true });
    const markedGuess = new Set([card[6].value, card[12].value, card[18].value]);
    grid.innerHTML = card.map((cell) => {
      const isMarked = cell.isFree || markedGuess.has(cell.value);
      return `<div class="mini-cell ${isMarked ? "is-marked" : ""}">${cell.isFree ? "★" : cell.value}</div>`;
    }).join("");
    grid.dataset.rendered = "1";
  }

  // --------------------------------------------------------------- //
  // HOST LOBBY
  // --------------------------------------------------------------- //

  function renderHostLobby(game) {
    document.getElementById("host-group-code").textContent = game.groupCode;
    document.getElementById("lobby-code-echo").textContent = game.groupCode;
    document.getElementById("lobby-host-name-line").textContent = `Hosted by ${game.hostName}`;

    const list = document.getElementById("host-player-list");
    document.getElementById("player-count-badge").textContent = game.players.length;

    list.innerHTML = game.players.length === 0
      ? `<li class="player-list-empty">Waiting for players…</li>`
      : game.players.map((p) => playerListItemHtml(p, { showFlag: true })).join("");

    const startBtn = document.getElementById("start-game-btn");
    const startHint = document.getElementById("start-hint");
    startBtn.disabled = game.players.length === 0;
    startHint.textContent = game.players.length === 0
      ? "Waiting for at least one player to join…"
      : `Ready when you are — ${game.players.length} player${game.players.length === 1 ? "" : "s"} in the room.`;
  }

  // --------------------------------------------------------------- //
  // HOST GAME
  // --------------------------------------------------------------- //

  function renderHostGame(game) {
    const display = document.getElementById("host-call-display");
    const latest = game.calledNumbers[game.calledNumbers.length - 1];
    const isNewCall = game.calledNumbers.length > seen.calledCount;

    display.innerHTML = latest != null
      ? BingoCard.formatCall(latest)
      : `<span class="call-placeholder">Ready</span>`;
    if (isNewCall) {
      display.classList.remove("is-calling");
      void display.offsetWidth;
      display.classList.add("is-calling");
    }

    document.getElementById("calls-progress-text").textContent = `${game.calledNumbers.length} / 75 called`;
    document.getElementById("calls-progress-fill").style.width = `${(game.calledNumbers.length / 75) * 100}%`;

    const callBtn = document.getElementById("call-next-btn");
    callBtn.disabled = game.remainingNumbers.length === 0;
    callBtn.textContent = game.remainingNumbers.length === 0 ? "All numbers called" : "Call next number";

    const autoBtn = document.getElementById("auto-call-btn");
    autoBtn.textContent = game.autoCall.active ? "Pause auto-call" : "Start auto-call";
    autoBtn.disabled = game.remainingNumbers.length === 0;

    const calledGrid = document.getElementById("host-called-grid");
    calledGrid.innerHTML = game.calledNumbers
      .slice()
      .reverse()
      .map((n, i) => `<div class="called-chip ${i === 0 ? "is-latest" : ""}">${BingoCard.formatCall(n)}</div>`)
      .join("") || `<p class="field-hint">No numbers called yet.</p>`;

    document.getElementById("host-game-player-count").textContent = game.players.length;
    document.getElementById("host-game-player-list").innerHTML = game.players
      .map((p) => playerListItemHtml(p, { showFlag: true }))
      .join("") || `<li class="player-list-empty">No players.</li>`;

    renderAchievementStatusList(game);
    renderClaimInbox(game);

    if (game.calledNumbers.length > seen.calledCount) {
      seen.calledCount = game.calledNumbers.length;
    }
  }

  function renderAchievementStatusList(game) {
    const list = document.getElementById("host-achievement-list");
    list.innerHTML = Object.values(game.achievements).map((a) => `
      <li class="achievement-status-row">
        <div>
          <span class="achievement-name">${escapeHtml(a.label)}</span>
          ${a.status === "awarded" ? `<span class="achievement-winner">🏆 ${escapeHtml(a.winnerName)}</span>` : ""}
        </div>
        <span class="status-tag status-${a.status}">${statusLabel(a.status)}</span>
      </li>
    `).join("");
  }

  function statusLabel(status) {
    return { available: "Available", pending: "Claim pending", awarded: "Awarded", rejected: "Rejected" }[status] || status;
  }

  function renderClaimInbox(game) {
    const card = document.getElementById("claim-inbox-card");
    const body = document.getElementById("claim-inbox-body");

    const pendingByAchievement = Object.values(game.achievements)
      .map((a) => ({ a, pending: a.claims.filter((c) => c.status === "pending") }))
      .filter((x) => x.pending.length > 0 && x.a.status !== "awarded");

    if (pendingByAchievement.length === 0) {
      card.hidden = true;
      body.innerHTML = "";
      return;
    }
    card.hidden = false;

    body.innerHTML = pendingByAchievement.map(({ a, pending }) => pending.map((claim) => `
      <div class="claim-row" data-claim-id="${claim.id}" data-achievement="${a.type}">
        <div class="claim-row-head">
          <strong>${escapeHtml(claim.playerName)}</strong>
          <span>${timeAgo(claim.claimedAt)}</span>
        </div>
        <div>claims <strong>${escapeHtml(a.label)}</strong>${pending.length > 1 ? " <em>(multiple claims — verify the one who showed you their card first)</em>" : ""}</div>
        <div class="claim-row-actions">
          <button class="btn btn-primary btn-verify-claim" data-claim-id="${claim.id}" data-achievement="${a.type}">Verify</button>
          <button class="btn btn-secondary btn-reject-claim" data-claim-id="${claim.id}" data-achievement="${a.type}">Reject</button>
        </div>
      </div>
    `).join("")).join("");

    // Toast once per newly-seen claim.
    for (const { a, pending } of pendingByAchievement) {
      for (const claim of pending) {
        if (!seen.claimIds.has(claim.id)) {
          seen.claimIds.add(claim.id);
          Notifications.achievement(`🏆 ${claim.playerName} claims ${a.label} — show their card to verify.`);
        }
      }
    }
  }

  // --------------------------------------------------------------- //
  // HOST RESULTS
  // --------------------------------------------------------------- //

  function renderHostResults(game) {
    const durationMs = (game.endedAt || Date.now()) - (game.startedAt || game.endedAt || Date.now());
    const minutes = Math.max(1, Math.round(durationMs / 60000));
    const lastCall = game.calledNumbers[game.calledNumbers.length - 1];

    document.getElementById("results-stats").innerHTML = `
      <div class="stat-box"><strong>${game.players.length}</strong><span>Players</span></div>
      <div class="stat-box"><strong>${game.calledNumbers.length}</strong><span>Numbers called</span></div>
      <div class="stat-box"><strong>${minutes}m</strong><span>Duration</span></div>
      <div class="stat-box"><strong>${lastCall != null ? BingoCard.formatCall(lastCall) : "—"}</strong><span>Final call</span></div>
    `;

    document.getElementById("results-achievements").innerHTML = Object.values(game.achievements).map((a) => `
      <div class="result-achievement-row">
        <span class="trophy" aria-hidden="true">${a.status === "awarded" ? "🏆" : "▫️"}</span>
        <div>
          <strong>${escapeHtml(a.label)}</strong>
          <span>${a.status === "awarded" ? `Won by ${escapeHtml(a.winnerName)}` : "Not claimed this game"}</span>
        </div>
      </div>
    `).join("");
  }

  // --------------------------------------------------------------- //
  // PLAYER LOBBY
  // --------------------------------------------------------------- //

  function renderPlayerLobby(game) {
    const me = State.getMyPlayer();
    if (!me) return;
    document.getElementById("player-lobby-avatar").textContent = me.initials;
    document.getElementById("player-lobby-code").textContent = game.groupCode;
    document.getElementById("player-lobby-count").textContent = game.players.length;
    document.getElementById("player-lobby-list").innerHTML = game.players
      .map((p) => playerListItemHtml(p, { showFlag: true }))
      .join("");
  }

  // --------------------------------------------------------------- //
  // PLAYER GAME
  // --------------------------------------------------------------- //

  function renderPlayerGame(game) {
    const me = State.getMyPlayer();
    if (!me) return;

    const latest = game.calledNumbers[game.calledNumbers.length - 1];
    const callValue = document.getElementById("player-last-call");
    const isNewCall = game.calledNumbers.length > (seen.calledCount || 0);
    callValue.textContent = latest != null ? BingoCard.formatCall(latest) : "—";
    if (isNewCall) {
      callValue.classList.remove("is-calling");
      void callValue.offsetWidth;
      callValue.classList.add("is-calling");
    }
    document.getElementById("player-call-progress").textContent = `${game.calledNumbers.length} called`;

    document.getElementById("player-called-strip").innerHTML = game.calledNumbers
      .slice()
      .reverse()
      .map((n, i) => `<div class="called-chip ${i === 0 ? "is-latest" : ""}">${BingoCard.formatCall(n)}</div>`)
      .join("");

    renderPlayerCard(me, game);
    renderPlayerClaimButtons(me, game);

    if (game.calledNumbers.length > seen.calledCount) {
      seen.calledCount = game.calledNumbers.length;
    }
  }

  function renderPlayerCard(player, game) {
    const grid = document.getElementById("player-card-grid");
    const cornerIds = new Set([
      BingoCard.cellAt(player.card, 0, 0).id,
      BingoCard.cellAt(player.card, 0, 4).id,
      BingoCard.cellAt(player.card, 4, 0).id,
      BingoCard.cellAt(player.card, 4, 4).id,
    ]);

    grid.innerHTML = player.card.map((cell) => {
      const isMarked = BingoCard.isCellMarked(cell, player.markedNumbers);
      const classes = ["bingo-cell"];
      if (cell.isFree) classes.push("is-free");
      if (isMarked) classes.push("is-marked");
      if (cornerIds.has(cell.id)) classes.push("is-corner-highlight");
      const label = cell.isFree ? "FREE" : cell.value;
      return `<button type="button" class="${classes.join(" ")}" data-cell-id="${cell.id}" data-value="${cell.isFree ? "" : cell.value}" ${cell.isFree ? "disabled" : ""} aria-pressed="${isMarked}" aria-label="${cell.isFree ? "Free space, always marked" : `Number ${cell.value}${isMarked ? ", marked" : ", not marked"}`}">${label}</button>`;
    }).join("");
  }

  function renderPlayerClaimButtons(player, game) {
    const container = document.getElementById("player-claim-buttons");
    container.innerHTML = Object.values(game.achievements).map((a) => {
      const myPendingClaim = a.claims.find((c) => c.playerId === player.id && c.status === "pending");
      const qualifies = Achievements.playerQualifies(a.type, player.card, player.markedNumbers);

      let buttonLabel = `Claim ${a.label}`;
      let disabled = true;
      let statusText = "Keep marking your card.";

      if (a.status === "awarded") {
        disabled = true;
        statusText = a.winnerId === player.id ? "You won this! 🏆" : `Already won by ${a.winnerName}.`;
      } else if (myPendingClaim) {
        disabled = true;
        buttonLabel = "Claim sent";
        statusText = "Show your card to the host for verification.";
      } else if (qualifies) {
        disabled = false;
        statusText = "You qualify — send your claim.";
      }

      return `
        <div class="claim-btn-row">
          <div class="claim-btn-info">
            <strong>${escapeHtml(a.label)}</strong>
            <span>${statusText}</span>
          </div>
          <button class="btn ${disabled ? "btn-secondary" : "btn-primary"} btn-sm btn-claim" data-achievement="${a.type}" ${disabled ? "disabled" : ""}>${buttonLabel}</button>
        </div>
      `;
    }).join("");

    // Celebrate newly-awarded achievements exactly once.
    for (const a of Object.values(game.achievements)) {
      if (a.status === "awarded" && !seen.awardedTypes.has(a.type)) {
        seen.awardedTypes.add(a.type);
        const isMe = a.winnerId === player.id;
        if (isMe) {
          openAchievementCelebration(a.label, a.winnerName, true);
        }
      }
    }
  }

  // --------------------------------------------------------------- //
  // PLAYER RESULTS
  // --------------------------------------------------------------- //

  function renderPlayerResults(game) {
    const me = State.getMyPlayer();
    const wonAny = me ? Object.values(game.achievements).some((a) => a.winnerId === me.id) : false;
    document.getElementById("player-results-title").textContent = wonAny ? "You won an achievement! 🏆" : "Thanks for playing!";
    document.getElementById("player-results-achievements").innerHTML = Object.values(game.achievements).map((a) => `
      <div class="result-achievement-row">
        <span class="trophy" aria-hidden="true">${a.status === "awarded" ? "🏆" : "▫️"}</span>
        <div>
          <strong>${escapeHtml(a.label)}</strong>
          <span>${a.status === "awarded" ? `Won by ${escapeHtml(a.winnerName)}${me && a.winnerId === me.id ? " (you!)" : ""}` : "Not claimed this game"}</span>
        </div>
      </div>
    `).join("");
  }

  // --------------------------------------------------------------- //
  // MASTER RENDER
  // --------------------------------------------------------------- //

  function renderAll(game) {
    renderHeroDemo();
    if (!game) return;

    if (game.myRole === "host") {
      if (game.status === "lobby") renderHostLobby(game);
      else if (game.status === "playing") renderHostGame(game);
      else if (game.status === "finished") renderHostResults(game);
    } else if (game.myRole === "player") {
      if (game.status === "lobby") renderPlayerLobby(game);
      else if (game.status === "playing") renderPlayerGame(game);
      else if (game.status === "finished") renderPlayerResults(game);
    }
  }

  function resetSeenTracking() {
    seen.calledCount = 0;
    seen.claimIds = new Set();
    seen.awardedTypes = new Set();
    seen.playerIds = new Set();
  }

  return {
    cacheScreens,
    showScreen,
    getActiveScreen,
    openModal,
    closeModal,
    openConfirmModal,
    openHelpModal,
    openDemoModal,
    openAchievementCelebration,
    renderAll,
    resetSeenTracking,
    escapeHtml,
  };
})();
