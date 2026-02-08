/**
 * Battle messaging: send to user, broadcast to battle room.
 */

const state = require('./state');
const { socketMap, battleRooms } = state;

function sendMessageToUser(userId, message) {
    const socket = socketMap[userId];
    if (socket && !socket.destroyed) {
        socket.write(message);
        return true;
    }
    return false;
}

function broadcastToBattle(battleName, message, excludeUserId = null) {
    const battle = battleRooms[battleName];
    if (!battle) return;

    for (const player of battle.players) {
        if (player.id !== excludeUserId) {
            sendMessageToUser(player.id, message);
        }
    }
}

module.exports = {
    sendMessageToUser,
    broadcastToBattle
};
