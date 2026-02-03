/**
 * Shared in-memory state for the Nanovor server.
 * All modules that need users, sessions, rooms, or socket maps use this single instance.
 */

let users = {};
let sessions = {};
let gameRooms = {};
let gameStates = {};
let socketMap = {};
let battleRooms = {};
let battleIdCounter = 1000;

module.exports = {
    users,
    sessions,
    gameRooms,
    gameStates,
    socketMap,
    battleRooms,
    battleIdCounter
};
