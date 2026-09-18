/**
 * bingo-card.js
 * -----------------------------------------------------------------------
 * Pure functions for generating and interacting with standard 5x5 bingo
 * cards. Nothing here touches the DOM or global state — everything takes
 * arguments and returns values, so it's easy to unit test and easy to
 * move server-side later.
 * -----------------------------------------------------------------------
 */

const BingoCard = (() => {
  const COLUMN_LETTERS = ["B", "I", "N", "G", "O"];

  // Standard bingo ranges for a 1-75 card.
  const COLUMN_RANGES = [
    [1, 15],
    [16, 30],
    [31, 45],
    [46, 60],
    [61, 75],
  ];

  function shuffle(array) {
    const copy = array.slice();
    for (let i = copy.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [copy[i], copy[j]] = [copy[j], copy[i]];
    }
    return copy;
  }

  function rangeArray(min, max) {
    const arr = [];
    for (let n = min; n <= max; n++) arr.push(n);
    return arr;
  }

  /**
   * Generates a 5x5 card as a flat array of 25 cells (row-major).
   * Each cell: { value: Number|null, col: 0-4, row: 0-4, isFree: bool }
   * Column `col`'s numbers are unique within that column and fall in the
   * correct B/I/N/G/O range. The center cell is FREE when freeSpace=true.
   */
  function generateCard({ freeSpace = true } = {}) {
    const columns = COLUMN_RANGES.map(([min, max]) => shuffle(rangeArray(min, max)).slice(0, 5));

    const cells = [];
    for (let row = 0; row < 5; row++) {
      for (let col = 0; col < 5; col++) {
        const isCenter = row === 2 && col === 2;
        const isFree = isCenter && freeSpace;
        cells.push({
          id: `${row}-${col}`,
          row,
          col,
          value: isFree ? null : columns[col][row],
          isFree,
        });
      }
    }
    return cells;
  }

  function letterForNumber(num) {
    for (let i = 0; i < COLUMN_RANGES.length; i++) {
      const [min, max] = COLUMN_RANGES[i];
      if (num >= min && num <= max) return COLUMN_LETTERS[i];
    }
    return "";
  }

  function formatCall(num) {
    const letter = letterForNumber(num);
    return letter ? `${letter}-${num}` : `${num}`;
  }

  function isNumberOnCard(card, number) {
    return card.some((cell) => !cell.isFree && cell.value === number);
  }

  /** Returns the set of "effectively marked" values: called numbers + FREE. */
  function getMarkedValues(card, markedNumbers) {
    const marked = new Set(markedNumbers);
    for (const cell of card) {
      if (cell.isFree) marked.add("FREE");
    }
    return marked;
  }

  function isCellMarked(cell, markedNumbers) {
    if (cell.isFree) return true;
    return markedNumbers.includes(cell.value);
  }

  function cellAt(card, row, col) {
    return card.find((c) => c.row === row && c.col === col);
  }

  return {
    COLUMN_LETTERS,
    COLUMN_RANGES,
    generateCard,
    letterForNumber,
    formatCall,
    isNumberOnCard,
    getMarkedValues,
    isCellMarked,
    cellAt,
    shuffle,
    rangeArray,
  };
})();
