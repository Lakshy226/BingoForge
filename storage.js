/**
 * storage.js
 * -----------------------------------------------------------------------
 * Temporary client-side persistence layer for the BingoForge prototype.
 *
 * This is explicitly NOT the eventual backend. When a real backend exists,
 * these functions are the only place that needs to change — everything
 * else in the app calls Storage.save/load/clear and doesn't know or care
 * where the data actually lives.
 * -----------------------------------------------------------------------
 */

const Storage = (() => {
  const NAMESPACE = "bingoforge";
  const KEYS = {
    GAME_STATE: `${NAMESPACE}:gameState`,
    LAST_ROLE: `${NAMESPACE}:lastRole`,
    LAST_PLAYER_NAME: `${NAMESPACE}:lastPlayerName`,
    THEME: `${NAMESPACE}:theme`,
  };

  function isAvailable() {
    try {
      const testKey = `${NAMESPACE}:__test__`;
      window.localStorage.setItem(testKey, "1");
      window.localStorage.removeItem(testKey);
      return true;
    } catch (err) {
      return false;
    }
  }

  const available = isAvailable();

  function saveGameState(gameState) {
    if (!available) return false;
    try {
      window.localStorage.setItem(KEYS.GAME_STATE, JSON.stringify(gameState));
      return true;
    } catch (err) {
      console.warn("BingoForge: could not save game state", err);
      return false;
    }
  }

  function loadGameState() {
    if (!available) return null;
    try {
      const raw = window.localStorage.getItem(KEYS.GAME_STATE);
      return raw ? JSON.parse(raw) : null;
    } catch (err) {
      console.warn("BingoForge: could not load game state", err);
      return null;
    }
  }

  function clearGameState() {
    if (!available) return;
    window.localStorage.removeItem(KEYS.GAME_STATE);
  }

  function saveLastRole(role) {
    if (!available) return;
    window.localStorage.setItem(KEYS.LAST_ROLE, role);
  }

  function loadLastRole() {
    if (!available) return null;
    return window.localStorage.getItem(KEYS.LAST_ROLE);
  }

  function saveLastPlayerName(name) {
    if (!available) return;
    window.localStorage.setItem(KEYS.LAST_PLAYER_NAME, name);
  }

  function loadLastPlayerName() {
    if (!available) return "";
    return window.localStorage.getItem(KEYS.LAST_PLAYER_NAME) || "";
  }

  return {
    available,
    saveGameState,
    loadGameState,
    clearGameState,
    saveLastRole,
    loadLastRole,
    saveLastPlayerName,
    loadLastPlayerName,
  };
})();
