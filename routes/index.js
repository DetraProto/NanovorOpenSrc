/**
 * Register all HTTP routes with the Express app.
 */

const registerSrb = require('./srb');
const registerShard = require('./shard');
const registerRest = require('./rest');

function registerRoutes(app) {
    registerSrb(app);
    registerShard(app);
    registerRest(app);
}

module.exports = registerRoutes;
