/**
 * Debug Module for Nanovor Server
 * Logs all extension requests for debugging purposes
 */

const fs = require('fs');
const path = require('path');

// Create logs directory if it doesn't exist
const logsDir = path.join(__dirname, 'logs');
if (!fs.existsSync(logsDir)) {
    fs.mkdirSync(logsDir, { recursive: true });
}

// Log file path
const logFilePath = path.join(logsDir, `extension_requests_${new Date().toISOString().split('T')[0]}.log`);

// Function to log extension requests
function logExtensionRequest(extension, command, params, socketInfo = {}) {
    const timestamp = new Date().toISOString();
    const logEntry = {
        timestamp,
        extension,
        command,
        params,
        socketInfo: {
            remoteAddress: socketInfo.remoteAddress || 'unknown',
            remotePort: socketInfo.remotePort || 'unknown',
            userId: socketInfo.userId || 'unknown',
            userName: socketInfo.userName || 'unknown',
            playerId: socketInfo.playerId || 'unknown'
        }
    };

    // Write to log file
    fs.appendFileSync(logFilePath, JSON.stringify(logEntry) + '\n');
    
    // Also log to console
    console.log(`[DEBUG] Extension Request: ${extension}.${command}`);
    console.log(`[DEBUG] Params:`, params);
    console.log(`[DEBUG] Socket Info:`, {
        remoteAddress: socketInfo.remoteAddress,
        remotePort: socketInfo.remotePort,
        userId: socketInfo.userId,
        userName: socketInfo.userName,
        playerId: socketInfo.playerId
    });
    console.log('---');
}

// Function to log buddy requests
function logBuddyRequest(command, params, socketInfo = {}) {
    const timestamp = new Date().toISOString();
    const logEntry = {
        timestamp,
        type: 'BUDDY_REQUEST',
        command,
        params,
        socketInfo: {
            remoteAddress: socketInfo.remoteAddress || 'unknown',
            remotePort: socketInfo.remotePort || 'unknown',
            userId: socketInfo.userId || 'unknown',
            userName: socketInfo.userName || 'unknown',
            playerId: socketInfo.playerId || 'unknown'
        }
    };

    // Write to log file
    fs.appendFileSync(logFilePath, JSON.stringify(logEntry) + '\n');

    // Also log to console
    console.log(`[DEBUG] Buddy Request: ${command}`);
    console.log(`[DEBUG] Params:`, params);
    console.log(`[DEBUG] Socket Info:`, {
        remoteAddress: socketInfo.remoteAddress,
        remotePort: socketInfo.remotePort,
        userId: socketInfo.userId,
        userName: socketInfo.userName,
        playerId: socketInfo.playerId
    });
    console.log('---');
}

// Comprehensive list of all possible extension requests
const ALL_EXTENSION_REQUESTS = {
    // loginXt extension requests
    loginXt: [
        'updateUserToken',
        'updateAvatar', 
        'getBuddyAvatar',
        'updateNanovorCount',
        'addNanovor',
        'removeNanovor',
        'addEm',
        'removeEm',
        'initialize',
        'login',
        'init',
        'getUserData',
        'syncUserData'
    ],
    
    // tradeXt extension requests
    tradeXt: [
        'createTrade',
        'inviteUserToTrade',
        'replyInvitationToTrade',
        'cancelTradeInvitation',
        'joinAndGetCollections',
        'startTrade',
        'addToCart',
        'removeFromCart',
        'makeOffer',
        'confirmTransaction',
        'quitTrade',
        'getBadgeList'
    ],
    
    // chatXt extension requests
    chatXt: [
        'getChatRoomList',
        'inviteToChat',
        'replyChatInvitation',
        'joinChatRoom',
        'exitChatRoom',
        'removeUserFromChatRoom',
        'sendChatMessage'
    ],
    
    // gameXt extension requests
    gameXt: [
        'createQuickBattle',
        'createGame',
        'inviteUser',
        'replyInvitation',
        'setGameSwarmValue',
        'startGame',
        'setSwarm',
        'setSelectedNanovor',
        'setAttack',
        'setNextSwap',
        'setEnemy',
        'setAttackInfo',
        'endRound',
        'quitGame',
        'declinedToWatch',
        'kickPlayerOut',
        'cancelQuickBattle',
        'getBadgeList',
        'setReady',
        'getPlayerStatus',
        'getBattleStatus',
        'performAttack',
        'swapNanovor',
        'killNanovor',
        'blockSwap',
        'selectNanovor',
        'setRoundInfo',
        'showGameResults',
        'gameQuit',
        'playerJoinAutoBattle',
        'allPlayersReady',
        'waitingForPlayers',
        'gameStarted',
        'gameSwarmValueSet',
        'swarmSelected',
        'targetSelected',
        'readyForTurn',
        'roundCompleted',
        'playerQuitGame',
        'gameOver',
        'roomDestroyed'
    ],
    
    // buddyListXt extension requests
    buddyListXt: [
        'getBuddyList',
        'getRecentlyPlayedList',
        'inviteBuddy',
        'replyBuddyInvitation',
        'removeBuddy',
        'loadInvitations'
    ]
};

// Function to validate if an extension request is valid
function isValidExtensionRequest(extension, command) {
    if (!ALL_EXTENSION_REQUESTS[extension]) {
        return false;
    }
    return ALL_EXTENSION_REQUESTS[extension].includes(command);
}

// Function to get all possible extension requests
function getAllExtensionRequests() {
    return ALL_EXTENSION_REQUESTS;
}

// Function to get all possible commands for a specific extension
function getCommandsForExtension(extension) {
    return ALL_EXTENSION_REQUESTS[extension] || [];
}

// Function to log invalid extension requests
function logInvalidRequest(extension, command, params, socketInfo = {}) {
    const timestamp = new Date().toISOString();
    const logEntry = {
        timestamp,
        type: 'INVALID_REQUEST',
        extension,
        command,
        params,
        socketInfo: {
            remoteAddress: socketInfo.remoteAddress || 'unknown',
            remotePort: socketInfo.remotePort || 'unknown',
            userId: socketInfo.userId || 'unknown',
            userName: socketInfo.userName || 'unknown',
            playerId: socketInfo.playerId || 'unknown'
        }
    };

    // Write to log file
    fs.appendFileSync(logFilePath, JSON.stringify(logEntry) + '\n');
    
    // Also log to console
    console.warn(`[DEBUG] INVALID Extension Request: ${extension}.${command}`);
    console.warn(`[DEBUG] Params:`, params);
    console.warn(`[DEBUG] Socket Info:`, {
        remoteAddress: socketInfo.remoteAddress,
        remotePort: socketInfo.remotePort,
        userId: socketInfo.userId,
        userName: socketInfo.userName,
        playerId: socketInfo.playerId
    });
    console.warn('---');
}

// Export functions
module.exports = {
    logExtensionRequest,
    logBuddyRequest,
    isValidExtensionRequest,
    getAllExtensionRequests,
    getCommandsForExtension,
    logInvalidRequest,
    logFilePath
};