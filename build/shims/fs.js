module.exports = { mkdirSync() {}, readFileSync() { throw new Error('fs indisponible'); }, writeFileSync() {}, renameSync() {}, existsSync() { return false; } };
