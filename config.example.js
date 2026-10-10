/**
 * cryptex-quest example configuration.
 *
 * HOW TO USE
 * 1. Copy this file to "config.js" (same folder). config.js is ignored by
 *    git, so your real code never ends up in a public repository.
 * 2. Change the values below. If config.js is missing, the app falls back
 *    to this example file.
 * 3. Reload the page. If something is wrong, the app shows a page that
 *    explains what to fix.
 *
 * Text values go in quotes, true/false and numbers do not. If a text contains
 * an apostrophe, use double quotes around it: title: "Leo's quest".
 * Every entry ends with a comma.
 */
export default {
  // The cryptex code: 3 to 8 characters, any characters (letters, digits, symbols).
  // Character 1 is revealed by puzzle 1, character 2 by puzzle 2, and so on.
  // This example code is made up. Put your real code only in config.js.
  code: 'QXMRT',

  // Shown in the headline ("Alex, your quest"). Leave empty for a neutral headline.
  recipientName: '',

  // Browser tab title and big headline override. Empty = default text.
  title: '',

  // Short text under the headline on the overview page. Empty = default text.
  intro: '',

  // Text on the final page, under the code. Empty = nothing extra.
  outro: 'Happy birthday! Now open the cryptex.',

  // UI language: "en" (English) or "de" (German).
  language: 'en',

  // Colors and mode. All keys are optional.
  //   mode:       "dark" or "light"
  //   accent:     main highlight color (filled code slots, buttons)
  //   secondary:  second highlight color (progress, found items)
  //   background, surface, text, softError: further overrides
  theme: {
    mode: 'dark',
    accent: '#E3B45B',
  },

  // Seconds on a puzzle before the "Skip, get the character anyway" button appears.
  // 0 = never show it. The timer keeps running across reloads.
  skipAfterSeconds: 180,

  // true  = puzzles can be solved in any order (each character still lands in its own slot).
  // false = puzzles unlock one after another.
  freeOrder: true,

  // Optional: change this text to get different puzzle layouts with the same code.
  // seed: 'my-seed',

  // One puzzle per code character, in slot order.
  // Every entry may also set its own title, subtitle and instruction text,
  // for example: { type: 'memory', title: 'Our holiday', options: { ... } }
  puzzles: [
    // Slot 1: 4x4 number grid (sudoku).
    //   difficulty: "easy" (8 numbers given), "medium" (6) or "hard" (as few as possible)
    {
      type: 'sudoku',
      options: { difficulty: 'easy' },
    },

    // Slot 2: picture puzzle. To use your own photo, put it into assets/custom/
    // (ignored by git) and set image: 'assets/custom/photo.jpg'.
    //   image: relative path inside assets/. About 1200 px, under 300 KB. It is
    //          center-cropped to a square and phone rotation (EXIF) is respected.
    //          If the file is missing, the placeholder below is shown instead.
    //   size:  3 (3x3 tiles) or 4 (4x4 tiles)
    {
      type: 'image',
      options: { image: 'assets/placeholder-picture.svg', size: 3 },
    },

    // Slot 3: connect the dots.
    //   points: list of [x, y] positions on a 100 x 100 board, in the order to connect.
    //           Keep dots about 14 units apart so they are easy to tap.
    //   closed: true connects the last dot back to the first
    //   name:   what the shape is, shown when complete ("It is a heart!")
    {
      type: 'dots',
      options: {
        name: 'a heart',
        closed: true,
        points: [
          [50, 28], [62, 14], [78, 10], [92, 24], [90, 44], [76, 62], [62, 76],
          [50, 90], [38, 76], [24, 62], [10, 44], [8, 24], [22, 10], [38, 14],
        ],
      },
    },
    // More shapes: replace the options above with one of these.
    //   Dog (side view, facing right):
    //     name: 'a dog', closed: true, points: [
    //       [24, 40], [42, 42], [58, 40], [62, 26], [64, 10], [74, 20], [94, 24], [96, 38],
    //       [82, 40], [76, 52], [78, 90], [64, 90], [64, 66], [50, 66], [36, 66], [36, 90],
    //       [22, 90], [18, 58], [6, 26]]
    //   Cat (sitting, side view, facing right):
    //     name: 'a cat', closed: true, points: [
    //       [74, 90], [74, 62], [78, 46], [88, 36], [86, 22], [82, 6], [72, 18], [60, 6],
    //       [58, 28], [50, 42], [40, 56], [36, 72], [22, 78], [8, 68], [8, 84], [26, 92],
    //       [42, 92], [58, 92]]
    //   Crown:
    //     name: 'a crown', closed: true, points: [
    //       [14, 84], [8, 30], [19, 54], [29, 22], [40, 52], [50, 10], [60, 52], [71, 22],
    //       [81, 54], [92, 30], [86, 84], [68, 84], [50, 84], [32, 84]]
    //   Key:
    //     name: 'a key', closed: true, points: [
    //       [38, 58], [26, 68], [11, 64], [4, 50], [11, 36], [26, 32], [38, 42], [56, 42],
    //       [74, 42], [94, 42], [94, 72], [80, 72], [80, 58], [66, 58], [66, 72], [52, 72],
    //       [52, 58]]

    // Slot 4: memory.
    //   pairs: emoji/short text, or image paths (ending in .png, .jpg, .jpeg, .webp, .gif or .svg),
    //          e.g. 'assets/custom/dog.jpg'.
    //          2 to 10 pairs; 6 fits a phone screen nicely.
    {
      type: 'memory',
      options: { pairs: ['🔑', '🗝️', '🧩', '💎', '🗺️', '🎁'] },
    },

    // Slot 5: word search.
    //   words: 1 to 8 words, 3 to 8 letters each (letters only, no spaces)
    //   size:  grid width and height, 6 to 10 (default 8). Must fit the longest word.
    //   backwards: true also allows words written right-to-left / bottom-to-top
    {
      type: 'wordsearch',
      options: { words: ['CRYPTEX', 'KEY', 'CODE', 'RIDDLE', 'QUEST'], size: 8, backwards: false },
    },
  ],
};
