/**
 * game.js
 * -----------------------------------------------------------------------
 * All game state transitions live here. Every function name here is
 * written to be a 1:1 stand-in for a future API/WebSocket call — e.g.
 * Game.callNumber() today mutates local state; tomorrow it can become
 * `await api.post('/games/:id/call-number')` without the UI layer
 * changing at all. See FUTURE_EVENTS below for the event names this
 * maps to once a real WebSocket server exists.
 *
 * NOTE ON "MULTIPLAYER" IN THIS PROTOTYPE:
 * There is no backend yet, so Host and Player are two views onto the same
 * in-memory `State.game` object within one browser tab. `game.myPlayerId`
 * marks which player is "you" when viewing the Player screens. Demo Mode
 * adds extra simulated ("bot") players so the lobby, calling, and
 * achievement-claim flows can be demonstrated without extra devices.
 * -----------------------------------------------------------------------
 */

const Game = (() => {
  // Events a future WebSocket layer would emit; kept here as documentation
  // of the seam between this prototype and the real-time backend.
  const FUTURE_EVENTS = [
    "PLAYER_JOINED", "PLAYER_LEFT", "GAME_STARTED", "NUMBER_CALLED",
    "ACHIEVEMENT_CLAIMED", "ACHIEVEMENT_VERIFIED", "ACHIEVEMENT_REJECTED",
    "ACHIEVEMENT_AWARDED", "GAME_ENDED",
  ];

  const CODE_CHARS = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789"; // no 0/O/1/I ambiguity
  const AUTO_CALL_INTERVAL_MS = 3200;
  const MAX_NAME_LENGTH = 24;
  const BOT_NAMES = ["Aarav", "Riya", "Dev", "Meera", "Karan", "Sana", "Vikram", "Priya", "Ishaan", "Nisha"];

  let autoCallTimer = null;

  function generateGroupCode() {
    let code = "";
    for (let i = 0; i < 5; i++) {
      code += CODE_CHARS[Math.floor(Math.random() * CODE_CHARS.length)];
    }
    return code;
  }

  function generateId(prefix) {
    return `${prefix}_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`;
  }

  function cleanName(name) {
    return (name || "").trim().replace(/\s+/g, " ").slice(0, MAX_NAME_LENGTH);
  }

  function initialsFor(name) {
    const parts = name.trim().split(" ").filter(Boolean);
    if (parts.length === 0) return "?";
    if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
    return (parts[0][0] + parts[1][0]).toUpperCase();
  }

  // ----------------------------------------------------------------- //
  // GAME CREATION (Host)
  // ----------------------------------------------------------------- //

  function createGame({ hostName, freeSpace, achievementTypes }) {
    const cleanedHost = cleanName(hostName);
    const game = {
      gameId: generateId("game"),
      groupCode: generateGroupCode(),
      hostName: cleanedHost || "Host",
      status: "lobby", // lobby | playing | finished
      createdAt: Date.now(),
      startedAt: null,
      endedAt: null,
      settings: {
        cardSize: 5,
        freeSpace: freeSpace !== false,
        numberRange: 75,
        achievementTypes: achievementTypes && achievementTypes.length ? achievementTypes : ["firstRow", "fourCorners"],
      },
      players: [],
      calledNumbers: [],
      remainingNumbers: BingoCard.rangeArray(1, 75),
      achievements: {},
      autoCall: { active: false, intervalMs: AUTO_CALL_INTERVAL_MS },
      myPlayerId: null, // host has no player card
      myRole: "host",
    };
    game.achievements = Achievements.createInitialAchievementState(game.settings.achievementTypes);
    State.setGame(game);
    Storage.saveLastRole("host");
    return game;
  }

  // ----------------------------------------------------------------- //
  // JOINING (Player)
  // ----------------------------------------------------------------- //

  /**
   * Validates and joins the current in-memory game (simulated network).
   * Returns { ok: true, playerId } or { ok: false, error: string }.
   */
  function joinGame({ groupCode, playerName }) {
    const game = State.getGame();
    const code = (groupCode || "").trim().toUpperCase();
    const name = cleanName(playerName);

    if (!code) return { ok: false, field: "code", error: "Enter a group code." };
    if (!game) return { ok: false, field: "code", error: "That group code doesn't match an active game." };
    if (game.groupCode.toUpperCase() !== code) {
      return { ok: false, field: "code", error: "That group code doesn't match an active game." };
    }
    if (!name) return { ok: false, field: "name", error: "Enter your name." };
    if (name.length > MAX_NAME_LENGTH) {
      return { ok: false, field: "name", error: `Names must be ${MAX_NAME_LENGTH} characters or fewer.` };
    }
    if (game.status === "finished") {
      return { ok: false, field: "code", error: "This game has already ended." };
    }

    const nameTaken = game.players.some((p) => p.name.toLowerCase() === name.toLowerCase());
    const finalName = nameTaken ? `${name} (${game.players.length + 1})` : name;

    const player = buildPlayer(finalName, game.settings.freeSpace, false);

    State.update((g) => {
      g.players.push(player);
      g.myPlayerId = player.id;
      g.myRole = "player";
    });

    Storage.saveLastRole("player");
    Storage.saveLastPlayerName(name);

    if (game.status === "playing") {
      Notifications.info("The host already started — you'll catch the next call.");
    }

    return { ok: true, playerId: player.id };
  }

  function buildPlayer(name, freeSpace, isBot) {
    return {
      id: generateId("player"),
      name,
      initials: initialsFor(name),
      card: BingoCard.generateCard({ freeSpace }),
      markedNumbers: [],
      joinedAt: Date.now(),
      connected: true,
      isBot: !!isBot,
    };
  }

  function leaveGame() {
    const game = State.getGame();
    if (!game || !game.myPlayerId) return;
    State.update((g) => {
      g.players = g.players.filter((p) => p.id !== g.myPlayerId);
      g.myPlayerId = null;
      g.myRole = null;
    });
  }

  // ----------------------------------------------------------------- //
  // STARTING / CALLING
  // ----------------------------------------------------------------- //

  function startGame() {
    const game = State.getGame();
    if (!game || game.players.length === 0) return;
    State.update((g) => {
      g.status = "playing";
      g.startedAt = Date.now();
    });
  }

  function callNextNumber() {
    const game = State.getGame();
    if (!game || game.status !== "playing") return null;
    if (game.remainingNumbers.length === 0) {
      Notifications.warning("All 75 numbers have been called.");
      stopAutoCall();
      return null;
    }

    let called;
    State.update((g) => {
      const idx = Math.floor(Math.random() * g.remainingNumbers.length);
      called = g.remainingNumbers.splice(idx, 1)[0];
      g.calledNumbers.push(called);

      // Bots "play along" instantly so demo claims are meaningful.
      for (const player of g.players) {
        if (player.isBot && !player.markedNumbers.includes(called) && BingoCard.isNumberOnCard(player.card, called)) {
          player.markedNumbers.push(called);
        }
      }
    });

    if (game.remainingNumbers.length === 0) {
      Notifications.info("Last number called — 75 / 75.");
      stopAutoCall();
    }

    return called;
  }

  function startAutoCall() {
    const game = State.getGame();
    if (!game || autoCallTimer) return;
    State.update((g) => { g.autoCall.active = true; });
    autoCallTimer = setInterval(() => {
      const g = State.getGame();
      if (!g || g.remainingNumbers.length === 0) {
        stopAutoCall();
        return;
      }
      callNextNumber();
    }, game.autoCall.intervalMs);
  }

  function stopAutoCall() {
    if (autoCallTimer) {
      clearInterval(autoCallTimer);
      autoCallTimer = null;
    }
    const game = State.getGame();
    if (game && game.autoCall.active) {
      State.update((g) => { g.autoCall.active = false; });
    }
  }

  // ----------------------------------------------------------------- //
  // MARKING
  // ----------------------------------------------------------------- //

  /**
   * Attempts to mark `number` on the given player's card.
   * Returns { ok: true } or { ok: false, reason: 'not-called'|'already-marked'|'not-on-card' }
   */
  function markNumber(playerId, number) {
    const game = State.getGame();
    if (!game) return { ok: false, reason: "no-game" };
    const player = State.getPlayer(playerId);
    if (!player) return { ok: false, reason: "no-player" };

    if (!BingoCard.isNumberOnCard(player.card, number)) {
      return { ok: false, reason: "not-on-card" };
    }
    if (player.markedNumbers.includes(number)) {
      return { ok: false, reason: "already-marked" };
    }
    if (!game.calledNumbers.includes(number)) {
      return { ok: false, reason: "not-called" };
    }

    State.update((g) => {
      const p = g.players.find((pl) => pl.id === playerId);
      p.markedNumbers.push(number);
    });
    return { ok: true };
  }

  // ----------------------------------------------------------------- //
  // ACHIEVEMENTS: CLAIM -> VERIFY / REJECT -> AWARD
  // ----------------------------------------------------------------- //

  function submitClaim(playerId, achievementType) {
    const game = State.getGame();
    if (!game) return { ok: false, error: "No active game." };
    const player = State.getPlayer(playerId);
    const achievement = game.achievements[achievementType];
    if (!player || !achievement) return { ok: false, error: "Couldn't find that achievement." };

    if (achievement.status === "awarded") {
      return { ok: false, error: `${achievement.label} has already been awarded.` };
    }
    const alreadyClaimedByPlayer = achievement.claims.some(
      (c) => c.playerId === playerId && c.status === "pending"
    );
    if (alreadyClaimedByPlayer) {
      return { ok: false, error: "Your claim is already waiting on the host." };
    }
    if (!Achievements.playerQualifies(achievementType, player.card, player.markedNumbers)) {
      return { ok: false, error: "Your card doesn't complete that achievement yet." };
    }

    const claim = {
      id: generateId("claim"),
      playerId,
      playerName: player.name,
      claimedAt: Date.now(),
      status: "pending",
    };

    State.update((g) => {
      const a = g.achievements[achievementType];
      a.claims.push(claim);
      if (a.status === "available") a.status = "pending";
    });

    return { ok: true, claim };
  }

  function verifyClaim(achievementType, claimId) {
    const game = State.getGame();
    if (!game) return;
    const achievement = game.achievements[achievementType];
    if (!achievement || achievement.status === "awarded") return;
    const claim = achievement.claims.find((c) => c.id === claimId);
    if (!claim) return;

    State.update((g) => {
      const a = g.achievements[achievementType];
      for (const c of a.claims) {
        c.status = c.id === claimId ? "verified" : (c.status === "pending" ? "superseded" : c.status);
      }
      a.status = "awarded";
      a.winnerId = claim.playerId;
      a.winnerName = claim.playerName;
      a.resolvedAt = Date.now();
    });
  }

  function rejectClaim(achievementType, claimId) {
    const game = State.getGame();
    if (!game) return;
    const achievement = game.achievements[achievementType];
    if (!achievement) return;

    State.update((g) => {
      const a = g.achievements[achievementType];
      const claim = a.claims.find((c) => c.id === claimId);
      if (claim) claim.status = "rejected";
      const stillPending = a.claims.some((c) => c.status === "pending");
      a.status = stillPending ? "pending" : (a.status === "awarded" ? "awarded" : "available");
    });
  }

  // Note on tie-breaking (see brief §20): when two claims for the same
  // achievement are both pending, the host resolves it manually by
  // choosing which claim to Verify — verifyClaim() below already marks
  // every other pending claim on that achievement as "superseded", so
  // "Verify" doubles as the host's manual "declare winner" action.

  // ----------------------------------------------------------------- //
  // GAME END / RESET
  // ----------------------------------------------------------------- //

  function endGame() {
    const game = State.getGame();
    if (!game) return;
    stopAutoCall();
    State.update((g) => {
      g.status = "finished";
      g.endedAt = Date.now();
    });
  }

  function playAgain() {
    const game = State.getGame();
    if (!game) return;
    stopAutoCall();
    State.update((g) => {
      g.status = "lobby";
      g.startedAt = null;
      g.endedAt = null;
      g.calledNumbers = [];
      g.remainingNumbers = BingoCard.rangeArray(1, 75);
      g.achievements = Achievements.createInitialAchievementState(g.settings.achievementTypes);
      g.groupCode = generateGroupCode();
      for (const p of g.players) {
        p.card = BingoCard.generateCard({ freeSpace: g.settings.freeSpace });
        p.markedNumbers = [];
      }
    });
  }

  function resetToHome() {
    stopAutoCall();
    State.reset();
  }

  // ----------------------------------------------------------------- //
  // DEMO MODE
  // ----------------------------------------------------------------- //

  function demoAddBotPlayer() {
    const game = State.getGame();
    if (!game) {
      Notifications.warning("Create a game first, then add demo players.");
      return;
    }
    const usedNames = new Set(game.players.map((p) => p.name));
    const available = BOT_NAMES.filter((n) => !usedNames.has(n));
    const name = available.length ? available[Math.floor(Math.random() * available.length)] : `Guest ${game.players.length + 1}`;
    const bot = buildPlayer(name, game.settings.freeSpace, true);

    // Bots that join mid-game instantly "catch up" on already-called numbers.
    for (const num of game.calledNumbers) {
      if (BingoCard.isNumberOnCard(bot.card, num)) bot.markedNumbers.push(num);
    }

    State.update((g) => { g.players.push(bot); });
    Notifications.info(`${name} joined (demo player).`);
  }

  /**
   * Finds a bot player who currently qualifies for `achievementType` and
   * submits a claim on their behalf, so the host-side verification flow
   * can be demonstrated without a second device.
   */
  function demoSimulateClaim(achievementType) {
    const game = State.getGame();
    if (!game) return { ok: false, error: "Create a game first." };
    const bots = game.players.filter((p) => p.isBot);
    if (!bots.length) return { ok: false, error: "Add a demo player first." };

    const qualifying = bots.find((p) => Achievements.playerQualifies(achievementType, p.card, p.markedNumbers));
    if (!qualifying) {
      return { ok: false, error: "No demo player qualifies for that yet — call a few more numbers." };
    }
    return submitClaim(qualifying.id, achievementType);
  }

  return {
    FUTURE_EVENTS,
    generateGroupCode,
    createGame,
    joinGame,
    leaveGame,
    startGame,
    callNextNumber,
    startAutoCall,
    stopAutoCall,
    markNumber,
    submitClaim,
    verifyClaim,
    rejectClaim,
    endGame,
    playAgain,
    resetToHome,
    demoAddBotPlayer,
    demoSimulateClaim,
  };
})();
