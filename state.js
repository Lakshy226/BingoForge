/**
 * state.js
 * -----------------------------------------------------------------------
 * Single source of truth for BingoForge's simulated game.
 *
 * In this frontend-only prototype, "Host" and "Player" are just two
 * different views over the SAME in-memory game object (there's no real
 * network yet). That's intentional: it keeps game logic centralized and
 * makes it straightforward to later swap this module's internals for
 * calls to a real backend / WebSocket without touching UI code, because
 * every mutation already goes through named functions here.
 *
 * Shape (kept close to the brief's spec):
 *
 * State.game = {
 *   gameId, groupCode, hostName, status, createdAt, startedAt, endedAt,
 *   settings: { cardSize, freeSpace, numberRange, achievementTypes },
 *   players: [ Player ],
 *   calledNumbers: [Number],
 *   remainingNumbers: [Number],
 *   achievements: { [type]: AchievementState },
 *   autoCall: { active, intervalId, intervalMs },
 *   myPlayerId: string | null   // which player in `players` is "you" in this browser
 * }
 *
 * Player = {
 *   id, name, card, markedNumbers: [Number], joinedAt, connected, isBot
 * }
 *
 * AchievementState = {
 *   type, label, status: 'available'|'pending'|'awarded'|'rejected',
 *   claims: [ { id, playerId, playerName, claimedAt, status } ],
 *   winnerId, winnerName, resolvedAt
 * }
 * -----------------------------------------------------------------------
 */

const State = (() => {
  let game = null;
  const listeners = new Set();

  function emit() {
    for (const fn of listeners) {
      try {
        fn(game);
      } catch (err) {
        console.error("BingoForge: state listener error", err);
      }
    }
    if (game) Storage.saveGameState(game);
  }

  function subscribe(fn) {
    listeners.add(fn);
    return () => listeners.delete(fn);
  }

  function getGame() {
    return game;
  }

  function setGame(nextGame) {
    game = nextGame;
    emit();
  }

  function update(mutatorFn) {
    if (!game) return;
    mutatorFn(game);
    emit();
  }

  function reset() {
    game = null;
    Storage.clearGameState();
    emit();
  }

  function getPlayer(playerId) {
    if (!game) return null;
    return game.players.find((p) => p.id === playerId) || null;
  }

  function getMyPlayer() {
    if (!game || !game.myPlayerId) return null;
    return getPlayer(game.myPlayerId);
  }

  function hydrateFromStorage() {
    const saved = Storage.loadGameState();
    if (saved) game = saved;
    return game;
  }

  return {
    subscribe,
    getGame,
    setGame,
    update,
    reset,
    getPlayer,
    getMyPlayer,
    hydrateFromStorage,
  };
})();
