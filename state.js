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

/** Integer account IDs. New accounts get random id; loaded accounts advance nextId. */
let nextAccountId = 1;
const usedAccountIds = new Set(); // Track used account IDs to avoid conflicts

function getNextAccountId() {
    // Generate a random number between 1-1000 for account ID
    let newId;
    do {
        newId = Math.floor(Math.random() * 1000) + 1; // Random number between 1-1000
    } while (users[newId] || usedAccountIds.has(newId)); // Ensure uniqueness
    usedAccountIds.add(newId); // Mark this ID as used
    return newId;
}

function setNextAccountIdIfHigher(id) {
    const n = Number(id);
    if (!Number.isNaN(n) && n >= nextAccountId) nextAccountId = n + 1;
    usedAccountIds.add(n); // Also track loaded IDs to avoid conflicts
}

/** Integer EM (Evolution Module) asset IDs. New EMs get next id; loaded EMs advance nextId. */
let nextEmAssetId = 1;

function getNextEmAssetId() {
    return nextEmAssetId++;
}

function setNextEmAssetIdIfHigher(id) {
    const n = Number(id);
    if (!Number.isNaN(n) && n >= nextEmAssetId) nextEmAssetId = n + 1;
}

// Initialize default rooms at startup
// Create system room with ID -1
const systemRoom = {
    id: -1,
    name: 'System Room',
    maxUsers: 100,
    maxSpectators: 100,
    isTemp: false,
    isGame: false,
    isPrivate: false,
    limbo: false,
    userCount: 0,
    spectatorCount: 0,
    users: [],
    variables: {} // Room variables
};
gameRooms['system'] = systemRoom;

// Create lobby room with ID 1
const lobbyRoom = {
    id: 1,
    name: 'Lobby',
    maxUsers: 100,
    maxSpectators: 100,
    isTemp: false,
    isGame: false,
    isPrivate: false,
    limbo: false,
    userCount: 0,
    spectatorCount: 0,
    users: [],
    variables: {} // Room variables
};
gameRooms['lobby'] = lobbyRoom;

// Create battle room with ID 2
const battleRoom = {
    id: 2,
    name: 'Battle Arena',
    maxUsers: 4,
    maxSpectators: 10,
    isTemp: false,
    isGame: true,
    isPrivate: false,
    limbo: false,
    userCount: 0,
    spectatorCount: 0,
    users: [],
    variables: {} // Room variables
};
gameRooms['battle'] = battleRoom;

module.exports = {
    users,
    sessions,
    gameRooms,
    gameStates,
    socketMap,
    battleRooms,
    battleIdCounter,
    getNextAccountId,
    setNextAccountIdIfHigher,
    getNextEmAssetId,
    setNextEmAssetIdIfHigher
};
