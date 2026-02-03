/**
 * Game room creation and management (lobby, battle arena, etc.).
 */

const state = require('./state');
const { gameRooms } = state;

function createGameRoom(name, maxUsers = 4, gameSwarmValue = 1000) {
    const roomId = Object.keys(gameRooms).length + 100;

    const room = {
        id: roomId,
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

    gameRooms[name] = room;
    return room;
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
    advanceTurn
};
