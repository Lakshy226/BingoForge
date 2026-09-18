/**
 * achievements.js
 * -----------------------------------------------------------------------
 * Achievement definitions + pure detection logic + the claim/verify state
 * machine. Achievements are configurable (an array of type keys) rather
 * than hardcoded throughout the app, so adding "Full House" or "Blackout"
 * later means adding one entry to DEFINITIONS plus a detector function.
 * -----------------------------------------------------------------------
 */

const Achievements = (() => {
  const DEFINITIONS = {
    firstRow: {
      type: "firstRow",
      label: "First Row",
      description: "Any one complete horizontal row.",
      detect: detectFirstRow,
    },
    fourCorners: {
      type: "fourCorners",
      label: "Four Corners",
      description: "All four corner squares marked.",
      detect: detectFourCorners,
    },
  };

  function detectFirstRow(card, markedNumbers) {
    for (let row = 0; row < 5; row++) {
      const rowCells = card.filter((c) => c.row === row);
      if (rowCells.every((cell) => BingoCard.isCellMarked(cell, markedNumbers))) {
        return true;
      }
    }
    return false;
  }

  function detectFourCorners(card, markedNumbers) {
    const corners = [
      BingoCard.cellAt(card, 0, 0),
      BingoCard.cellAt(card, 0, 4),
      BingoCard.cellAt(card, 4, 0),
      BingoCard.cellAt(card, 4, 4),
    ];
    return corners.every((cell) => cell && BingoCard.isCellMarked(cell, markedNumbers));
  }

  /** Builds the initial achievements state object for a fresh game. */
  function createInitialAchievementState(enabledTypes) {
    const state = {};
    for (const type of enabledTypes) {
      const def = DEFINITIONS[type];
      if (!def) continue;
      state[type] = {
        type,
        label: def.label,
        status: "available", // available | pending | awarded | rejected(transient)
        claims: [],
        winnerId: null,
        winnerName: null,
        resolvedAt: null,
      };
    }
    return state;
  }

  /** Checks whether a player's current card/marks satisfy an achievement. */
  function playerQualifies(type, card, markedNumbers) {
    const def = DEFINITIONS[type];
    if (!def) return false;
    return def.detect(card, markedNumbers);
  }

  function label(type) {
    return DEFINITIONS[type] ? DEFINITIONS[type].label : type;
  }

  return {
    DEFINITIONS,
    createInitialAchievementState,
    playerQualifies,
    label,
  };
})();
