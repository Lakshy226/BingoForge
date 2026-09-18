/**
 * app.js
 * -----------------------------------------------------------------------
 * Wires DOM events to Game (state transitions) and UI (rendering).
 * Also owns the tiny routing rule that keeps whichever screen is shown
 * in sync with `State.game.status` + `myRole`.
 * -----------------------------------------------------------------------
 */

(function bootstrap() {
  document.addEventListener("DOMContentLoaded", init);

  function init() {
    UI.cacheScreens();
    hydrateExistingGame();
    wireHomeAndNav();
    wireHostSetup();
    wireHostLobby();
    wireHostGame();
    wireHostResults();
    wireJoinForm();
    wirePlayerLobby();
    wirePlayerGame();
    wirePlayerResults();

    State.subscribe((game) => {
      UI.renderAll(game);
      autoRoute(game);
    });

    // Kick off an initial render for the home hero card even with no game.
    UI.renderAll(State.getGame());
  }

  // ----------------------------------------------------------------- //
  // ROUTING
  // ----------------------------------------------------------------- //

  function routeFor(game) {
    if (!game) return null;
    if (game.myRole === "host") {
      if (game.status === "lobby") return "host-lobby";
      if (game.status === "playing") return "host-game";
      if (game.status === "finished") return "host-results";
    }
    if (game.myRole === "player") {
      if (game.status === "lobby") return "player-lobby";
      if (game.status === "playing") return "player-game";
      if (game.status === "finished") return "player-results";
    }
    return null;
  }

  function autoRoute(game) {
    const target = routeFor(game);
    if (target && UI.getActiveScreen() !== target) {
      UI.showScreen(target);
    }
  }

  function hydrateExistingGame() {
    const game = State.hydrateFromStorage();
    if (game && game.autoCall) game.autoCall.active = false; // no timer survives reload
    const target = routeFor(game);
    if (target) UI.showScreen(target);
  }

  // ----------------------------------------------------------------- //
  // HOME + GLOBAL NAV
  // ----------------------------------------------------------------- //

  function wireHomeAndNav() {
    document.getElementById("brand-home-btn").addEventListener("click", () => UI.showScreen("home"));
    document.getElementById("go-host-btn").addEventListener("click", () => UI.showScreen("host-setup"));
    document.getElementById("go-join-btn").addEventListener("click", () => UI.showScreen("join"));
    document.getElementById("help-btn").addEventListener("click", () => UI.openHelpModal());
    document.getElementById("demo-toggle-btn").addEventListener("click", () => UI.openDemoModal());

    document.querySelectorAll("[data-back]").forEach((btn) => {
      btn.addEventListener("click", () => UI.showScreen(btn.dataset.back));
    });
  }

  // ----------------------------------------------------------------- //
  // HOST SETUP
  // ----------------------------------------------------------------- //

  function wireHostSetup() {
    const form = document.getElementById("host-setup-form");
    const nameInput = document.getElementById("host-name-input");
    const nameError = document.getElementById("host-name-error");

    form.addEventListener("submit", (e) => {
      e.preventDefault();
      nameError.textContent = "";
      nameInput.classList.remove("has-error");

      const hostName = nameInput.value.trim();
      if (!hostName) {
        nameError.textContent = "Enter a name so players know who's running the game.";
        nameInput.classList.add("has-error");
        nameInput.focus();
        return;
      }

      const freeSpace = document.getElementById("free-space-toggle").checked;
      const achievementTypes = Array.from(
        document.querySelectorAll('input[name="achievement"]:checked')
      ).map((el) => el.value);

      UI.resetSeenTracking();
      Game.createGame({ hostName, freeSpace, achievementTypes });
      Notifications.success("Game created — share your code with the room.");
      form.reset();
      document.getElementById("free-space-toggle").checked = true;
    });
  }

  // ----------------------------------------------------------------- //
  // HOST LOBBY
  // ----------------------------------------------------------------- //

  function wireHostLobby() {
    document.getElementById("copy-code-btn").addEventListener("click", async () => {
      const game = State.getGame();
      if (!game) return;
      try {
        await navigator.clipboard.writeText(game.groupCode);
        Notifications.success("Code copied.");
      } catch (err) {
        Notifications.warning(`Copy this manually: ${game.groupCode}`);
      }
    });

    document.getElementById("start-game-btn").addEventListener("click", () => {
      const game = State.getGame();
      if (!game || game.players.length === 0) return;
      Game.startGame();
      Notifications.success("Game started — good luck!");
    });
  }

  // ----------------------------------------------------------------- //
  // HOST GAME
  // ----------------------------------------------------------------- //

  function wireHostGame() {
    document.getElementById("call-next-btn").addEventListener("click", () => {
      Game.callNextNumber();
    });

    document.getElementById("auto-call-btn").addEventListener("click", () => {
      const game = State.getGame();
      if (!game) return;
      if (game.autoCall.active) {
        Game.stopAutoCall();
        Notifications.info("Auto-call paused.");
      } else {
        Game.startAutoCall();
        Notifications.info("Auto-call started.");
      }
    });

    document.getElementById("claim-inbox-body").addEventListener("click", (e) => {
      const verifyBtn = e.target.closest(".btn-verify-claim");
      const rejectBtn = e.target.closest(".btn-reject-claim");
      if (verifyBtn) {
        const { claimId, achievement } = verifyBtn.dataset;
        Game.verifyClaim(achievement, claimId);
        Notifications.success(`${Achievements.label(achievement)} verified!`);
      } else if (rejectBtn) {
        const { claimId, achievement } = rejectBtn.dataset;
        Game.rejectClaim(achievement, claimId);
        Notifications.warning("Claim rejected.");
      }
    });

    document.getElementById("end-game-btn").addEventListener("click", () => {
      const game = State.getGame();
      if (!game) return;
      const hasPending = Object.values(game.achievements).some(
        (a) => a.claims.some((c) => c.status === "pending")
      );
      UI.openConfirmModal({
        title: "End this game?",
        body: hasPending
          ? "There's a claim still waiting for verification. Ending now will leave it unresolved."
          : "Players will see the final results screen.",
        confirmLabel: "End game",
        onConfirm: () => Game.endGame(),
      });
    });
  }

  // ----------------------------------------------------------------- //
  // HOST RESULTS
  // ----------------------------------------------------------------- //

  function wireHostResults() {
    document.getElementById("return-home-btn").addEventListener("click", () => {
      Game.resetToHome();
      UI.resetSeenTracking();
      UI.showScreen("home");
    });
    document.getElementById("play-again-btn").addEventListener("click", () => {
      UI.resetSeenTracking();
      Game.playAgain();
      Notifications.success("Fresh cards dealt — new group code too.");
    });
  }

  // ----------------------------------------------------------------- //
  // JOIN
  // ----------------------------------------------------------------- //

  function wireJoinForm() {
    const form = document.getElementById("join-form");
    const codeInput = document.getElementById("join-code-input");
    const nameInput = document.getElementById("join-name-input");
    const codeError = document.getElementById("join-code-error");
    const nameError = document.getElementById("join-name-error");

    const lastName = Storage.loadLastPlayerName();
    if (lastName) nameInput.value = lastName;

    form.addEventListener("submit", (e) => {
      e.preventDefault();
      codeError.textContent = "";
      nameError.textContent = "";
      codeInput.classList.remove("has-error");
      nameInput.classList.remove("has-error");

      const result = Game.joinGame({
        groupCode: codeInput.value,
        playerName: nameInput.value,
      });

      if (!result.ok) {
        if (result.field === "code") {
          codeError.textContent = result.error;
          codeInput.classList.add("has-error");
          codeInput.focus();
        } else {
          nameError.textContent = result.error;
          nameInput.classList.add("has-error");
          nameInput.focus();
        }
        return;
      }

      UI.resetSeenTracking();
      Notifications.success("Joined game successfully.");
      form.reset();
    });
  }

  // ----------------------------------------------------------------- //
  // PLAYER LOBBY
  // ----------------------------------------------------------------- //

  function wirePlayerLobby() {
    document.getElementById("leave-lobby-btn").addEventListener("click", () => {
      UI.openConfirmModal({
        title: "Leave game?",
        body: "You'll need the group code again to rejoin.",
        confirmLabel: "Leave",
        onConfirm: () => {
          Game.leaveGame();
          UI.showScreen("home");
        },
      });
    });
  }

  // ----------------------------------------------------------------- //
  // PLAYER GAME
  // ----------------------------------------------------------------- //

  function wirePlayerGame() {
    document.getElementById("player-card-grid").addEventListener("click", (e) => {
      const cellBtn = e.target.closest(".bingo-cell");
      if (!cellBtn || cellBtn.disabled) return;
      const me = State.getMyPlayer();
      if (!me) return;

      const value = Number(cellBtn.dataset.value);
      const result = Game.markNumber(me.id, value);

      if (!result.ok) {
        if (result.reason === "not-called") {
          Notifications.warning("That number hasn't been called yet.");
          cellBtn.classList.remove("is-shake");
          void cellBtn.offsetWidth;
          cellBtn.classList.add("is-shake");
        }
        return;
      }
      Notifications.success("Mark it! ✓", { duration: 1200 });
    });

    document.getElementById("player-claim-buttons").addEventListener("click", (e) => {
      const btn = e.target.closest(".btn-claim");
      if (!btn) return;
      const me = State.getMyPlayer();
      if (!me) return;

      const result = Game.submitClaim(me.id, btn.dataset.achievement);
      if (!result.ok) {
        Notifications.warning(result.error);
        return;
      }
      Notifications.achievement("Claim sent! Show your card to the host.");
    });
  }

  // ----------------------------------------------------------------- //
  // PLAYER RESULTS
  // ----------------------------------------------------------------- //

  function wirePlayerResults() {
    document.getElementById("player-return-home-btn").addEventListener("click", () => {
      Game.leaveGame();
      Game.resetToHome();
      UI.resetSeenTracking();
      UI.showScreen("home");
    });
  }
})();
