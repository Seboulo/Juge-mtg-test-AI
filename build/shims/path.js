module.exports = { join: (...a) => a.join('/'), basename: (p) => String(p).split('/').pop() };
