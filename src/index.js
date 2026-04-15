/**
 * commit-farmer — entry point
 *
 * Orchestrates a farming session. On each run:
 *   1. Load config and environment
 *   2. Check if today is a commit day (scheduler)
 *   3. If yes, determine session size
 *   4. Execute commits with realistic timing gaps
 *   5. Optionally fire GitHub API actions (issues, PRs)
 *   6. Write state for next run
 *
 * Run modes:
 *   node src/index.js             normal farm run
 *   node src/index.js --dry-run   log what would happen, no real commits
 *   node src/index.js --force     skip probability check, always commit
 *
 * TODO: implement orchestration logic
 * TODO: wire up scheduler, committer, and github-api modules
 * TODO: handle --dry-run and --force flags from process.argv
 * TODO: write run summary to console for GitHub Actions log visibility
 */

require('dotenv').config();
const config = require('../config/default.json');

async function main() {
  console.log('[commit-farmer] starting run...');
  // TODO: implement
}

main().catch(console.error);
