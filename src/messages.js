/**
 * messages.js
 *
 * Bank of realistic commit messages organized by category.
 * getMessage(category) returns a random message from the category.
 * getWeightedMessage() picks a category by weight then picks a message.
 *
 * Category weights (approximate real-world distribution):
 *   fix    30%
 *   update 25%
 *   add    25%
 *   chore  15%
 *   docs    5%
 */

const { weightedRandom } = require('./patterns');

const messages = {
  add: [
    'add note on async patterns',
    'add til entry',
    'add entry on debugging approach',
    'add notes from earlier',
    'add quick reference entry',
    'add til on array methods',
    'add new entry',
    'add notes on api design',
    'add entry on error handling',
    'add notes on css grid',
    'add til on git workflows',
    'add entry on testing patterns',
    'add notes on performance',
    'add entry on state management',
    'add til on shell scripting',
  ],

  update: [
    'update index',
    'update tags',
    'update readme',
    'clean up recent entries',
    'update entry with more context',
    'revise wording on last note',
    'update links',
    'expand on previous entry',
    'update notes with corrections',
    'update structure',
  ],

  fix: [
    'fix typo',
    'fix formatting',
    'fix broken link',
    'fix heading level',
    'correct date on entry',
    'fix code block formatting',
    'fix inconsistent spacing',
    'fix incorrect example',
    'fix capitalization',
    'fix punctuation',
  ],

  chore: [
    'tidy up folder structure',
    'reorganize by topic',
    'clean up old entries',
    'normalize file names',
    'remove duplicate entry',
    'sort entries by date',
    'consolidate short notes',
  ],

  docs: [
    'update readme with new section',
    'add contribution notes',
    'document folder structure',
    'add usage examples',
  ],
};

const categoryWeights = {
  fix:    30,
  update: 25,
  add:    25,
  chore:  15,
  docs:    5,
};

/**
 * Returns a random message from the given category.
 * Throws if the category does not exist.
 */
function getMessage(category) {
  const pool = messages[category];
  if (!pool || pool.length === 0) {
    throw new Error(`[messages] unknown category: ${category}`);
  }
  return pool[Math.floor(Math.random() * pool.length)];
}

/**
 * Picks a category by weight, then returns a random message from it.
 * fix 30% / update 25% / add 25% / chore 15% / docs 5%
 */
function getWeightedMessage() {
  const categories = Object.keys(categoryWeights);
  const weights = categories.map(c => categoryWeights[c]);
  const idx = weightedRandom(weights);
  return getMessage(categories[idx]);
}

module.exports = { messages, getMessage, getWeightedMessage };
