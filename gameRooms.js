/**
 * Game room creation and management (lobby, battle arena, etc.).
 */

const state = require('./state');
const { gameRooms } = state;

// Track rooms by ID for client compatibility
const roomsById = {};

// Initialize roomsById with existing rooms from state
function initializeRoomsById() {
    for (const roomName in gameRooms) {
        const room = gameRooms[roomName];
        if (room && room.id) {
            roomsById[room.id] = room;
        }
    }
}

// Initialize roomsById with existing rooms from state
initializeRoomsById();

function createGameRoom(name, maxUsers = 4, gameSwarmValue = 1000) {
    // Find the next available ID, starting from 100 for game rooms
    const existingIds = Object.keys(roomsById).map(Number);
    let nextId = 1;
    if (existingIds.length > 0) {
        nextId = Math.max(...existingIds) + 1;
    }

    const room = {
        id: nextId,
        name: name,
        maxUsers: maxUsers,
        maxSpectators: 0,
        isTemp: true,
        isGame: true,
        isPrivate: false,
        limbo: false,
        userCount: 0,
        spectatorCount: 0,
        users: [],
        variables: {},
        gameSwarmValue: gameSwarmValue,
        gameState: 'waiting_for_players',
        players: [],
        currentTurn: 0,
        battleHistory: [],
        roundNumber: 1,
        turnOrder: []
    };

    // Store by both name and ID for different lookup purposes
    gameRooms[name] = room;
    roomsById[nextId] = room;

    return room;
}

// Create lobby room on initialization if it doesn't exist
function initializeLobbyRoom() {
    if (!gameRooms['lobby']) {
        const lobbyRoom = {
            id: -1,  // Lobby room always has ID 1
            name: 'Lobby',
            maxUsers: 100,
            maxSpectators: 100,
            isTemp: false,  // Lobby is not temporary
            isGame: false,  // Lobby is not a game room
            isPrivate: false,
            limbo: false,
            userCount: 0,
            spectatorCount: 0,
            users: [],
            variables: {
                topic: 'Main lobby for players',
                welcome: 'Welcome to the lobby!'
            },
            gameState: 'open',
            players: [],
            currentTurn: 0,
            battleHistory: [],
            roundNumber: 1,
            turnOrder: []
        };

        gameRooms['lobby'] = lobbyRoom;
        roomsById[1] = lobbyRoom;
        
        console.log('Lobby room initialized with ID 1');
    } else {
        // If lobby exists from state.js, make sure it's also in roomsById
        if (gameRooms['lobby'] && !roomsById[1]) {
            roomsById[1] = gameRooms['lobby'];
        }
    }
}

// Initialize lobby room when module loads
initializeLobbyRoom();

function getRoomById(roomId) {
    return roomsById[roomId] || null;
}

function getAllRooms() {
    // Return all rooms indexed by ID as expected by the client
    return roomsById;
}

function getUserGameRoom(userId) {
    for (const roomId in gameRooms) {
        const room = gameRooms[roomId];
        const userInRoom = room.users.find(u => u.id === userId);
        if (userInRoom) {
            return room;
        }
    }
    return null;
}

function advanceTurn(room) {
    room.currentTurn = (room.currentTurn + 1) % room.users.length;

    const currentPlayer = room.users[room.currentTurn];
    const readyForTurnMsg = `<msg t="xt"><body action="xtRes" r="-1"><![CDATA[{"_cmd":"readyForTurn","battleName":"${room.name}","nanovorId":0,"isDead":false}]]></body></msg>\x00`;

    console.log(`Advancing turn to player: ${currentPlayer.name} in room: ${room.name}`);
}

module.exports = {
    createGameRoom,
    getUserGameRoom,
    advanceTurn,
    getRoomById,
    getAllRooms,
    roomsById  // Export for direct access when needed
};
