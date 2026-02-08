const state = require('../../state');
const user = require('../../user');
const handleGameXtCommand = require('./gameXt');
const handleChatXtCommand = require('./chatXt');
const { handleBuddyCommand } = require('./buddyXt');
const handleTradeCommand = require('./tradeXt');
const debug = require('../../debug/Debug');
const { users, getNextEmAssetId } = state;
const { saveUserData } = user;

// Helper function to ensure all extension responses have the _cmd field
function createExtensionResponse(cmd, additionalData = {}) {
    const responseObj = { "_cmd": cmd, ...additionalData };
    // Use JSON format as expected by the client: {"t":"xt","b":{"action":"xtRes","r":-1,"o":{...}}}
    const response = `{"t":"xt","b":{"action":"xtRes","r":-1,"o":${JSON.stringify(responseObj)}}}\x00`;
    console.log('\x1b[31m%s\x1b[0m', `[CREATE_EXT_RESP] Creating extension response with _cmd: ${cmd}, response:`, response.substring(0, 100) + '...');
    return response;
}

function handleExtensionCommand(socket, extension, command, params) {
    console.log(`Handling extension command: ${extension}.${command || 'NULL_COMMAND'}, params:`, params);

    // Log the extension request for debugging
    debug.logExtensionRequest(extension, command, params, {
        remoteAddress: socket.remoteAddress,
        remotePort: socket.remotePort,
        userId: socket.userId,
        userName: socket.userName,
        playerId: socket.playerId
    });
    
    // Additional debugging for extension requests after room list
    console.log(`[EXT_DEBUG] Extension: ${extension}, Command: ${command}, Params:`, params);
    console.log(`[EXT_DEBUG] Socket state - userId: ${socket.userId}, userName: ${socket.userName}, playerId: ${socket.playerId}, activeRoomId: ${socket.activeRoomId}`);
    
    // Special debugging for loginXt extension right after login
    if (extension === 'loginXt') {
        console.log(`[LOGINXT_DEBUG] Received loginXt command: ${command}, params:`, params);
        console.log(`[LOGINXT_DEBUG] Socket state at loginXt request: userId=${socket.userId}, userName=${socket.userName}, playerId=${socket.playerId}`);
    }

    let response = '';

    // Handle null/undefined command case
    if (command === null || command === undefined || command === '') {
        console.log(`Extension command is null/undefined for extension: ${extension}`);

        // Default response for initialization or unknown commands
        if (extension === 'loginXt') {
            // This is likely the initial extension call after login
            const escapedUsername = (socket.userName || 'n').toString().replace(/[&<>"']/g, function(match) {
                return {
                    '&': '&amp;',
                    '<': '&lt;',
                    '>': '&gt;',
                    '"': '&quot;',
                    "'": '&apos;'
                }[match];
            });
            response = createExtensionResponse("logOK", {
                "chatRoomName": "Lobby",
                "username": escapedUsername,
                "userRefId": socket.playerId
            });
        } else {
            response = createExtensionResponse("unknownCommand");
        }
        socket.write(response);
        return;
    }

    switch (extension) {
        case 'loginXt':
            try {
                console.log(`[LOGINXT_DEBUG] Processing loginXt command: ${command}, params:`, params);
                switch (command) {
                    case 'updateUserToken':
                        // Update user token
                        const username = params.username;
                        const token = params.token;

                        // Find user by username and update their token
                        let targetUserId = null;
                        for (const userId in users) {
                            if (users[userId].username === username) {
                                targetUserId = userId;
                                break;
                            }
                        }

                        if (targetUserId && users[targetUserId]) {
                            users[targetUserId].loginToken = token;

                            // Save user data after updating token
                            saveUserData(targetUserId);

                            console.log(`Updated token for user ${username} (ID: ${targetUserId})`);
                        } else {
                            console.log(`Could not find user ${username} to update token`);
                        }

                        response = createExtensionResponse("userTokenUpdated");
                        break;
                    case 'updateAvatar':
                        // Update avatar
                        console.log(`[UPDATE_AVATAR_DEBUG] Processing updateAvatar request - userId: ${socket.userId}, params:`, params);
                        const newAvatarId = params.avatarId || 1;
                        if (users[socket.userId]) {
                            users[socket.userId].avatarId = parseInt(newAvatarId);

                            // Save user data after updating avatar
                            saveUserData(socket.userId);
                            console.log(`[UPDATE_AVATAR_DEBUG] Updated avatar for user ${socket.userId} to ${newAvatarId}`);
                        } else {
                            console.log(`[UPDATE_AVATAR_DEBUG] Warning: Could not find user ${socket.userId} to update avatar`);
                        }
                        response = createExtensionResponse("avatarUpdated");
                        console.log(`[UPDATE_AVATAR_DEBUG] Sending avatarUpdated response`);
                        break;
                    case 'getBuddyAvatar':
                        // Client asks by buddy name (e.g. "Training"); response userRefId must match that player so loadEnemyAvatarPictureById(userRefId,...) updates the correct slot.
                        const buddyName = (params.name || '').toString().trim();
                        const senseiRefIds = { 'training': -5, 'medium': -4, 'easy': -3 };
                        const senseiKey = buddyName.toLowerCase();
                        let refId = socket.userId;
                        let bid = 1;
                        let bnmp = 0;
                        if (senseiRefIds[senseiKey] !== undefined) {
                            refId = senseiRefIds[senseiKey];
                        } else {
                            const buddyUser = users[socket.userId] || {};
                            bid = typeof buddyUser.avatarId === 'number' ? buddyUser.avatarId : 1;
                            bnmp = typeof buddyUser.nmp === 'number' ? buddyUser.nmp : 0;
                        }
                        response = createExtensionResponse("responseBuddyAvatar", {
                            "userRefId": refId,
                            "avatarId": bid,
                            "nmp": bnmp
                        });
                        break;
                    case 'getUserData':
                    case 'syncUserData':
                        // Return comprehensive user data (includes nanocash for sync). No id so client keeps SFS login id.
                        const userData = users[socket.userId] || {};
                        response = createExtensionResponse("userDataSynced", {
                            "username": socket.userName || 'n',
                            "avatarId": userData.avatarId || 1,
                            "nmp": userData.nmp || 0,
                            "nanocash": userData.nanocash || 0,
                            "gamesPlayed": userData.gamesPlayed || 0,
                            "hasSeenNewUserExperience": userData.hasSeenNewUserExperience || false
                        });
                        break;
                    case 'updateNanovorCount':
                        // Update nanovor count
                        if (params.nanovorCount !== undefined && users[socket.userId]) {
                            users[socket.userId].nanovorCount = parseInt(params.nanovorCount) || 0;

                            // Save user data after updating nanovor count
                            saveUserData(socket.userId);
                        }
                        response = createExtensionResponse("nanovorCountUpdated");
                        break;

                    case 'addNanovor':
                        // Add a nanovor to the user's inventory
                        if (params.nanovorData && users[socket.userId]) {
                            const nanovorData = params.nanovorData;

                            // Ensure nanovorInventory exists
                            if (!users[socket.userId].nanovorInventory) {
                                users[socket.userId].nanovorInventory = [];
                            }

                            // Add the new nanovor to inventory
                            users[socket.userId].nanovorInventory.push(nanovorData);

                            // Update counts
                            users[socket.userId].nanovorCount = users[socket.userId].nanovorInventory.length;
                            users[socket.userId].nanovorCountUnique = users[socket.userId].nanovorInventory.length; // Simplified for now

                            // Save user data after updating inventory
                            saveUserData(socket.userId);
                        }
                        response = createExtensionResponse("nanovorAdded");
                        break;

                    case 'removeNanovor':
                        // Remove a nanovor from the user's inventory
                        if (params.nanovorId !== undefined && users[socket.userId]) {
                            const removeNanovorId = parseInt(params.nanovorId);

                            if (users[socket.userId].nanovorInventory) {
                                // Filter out the nanovor with the specified ID
                                users[socket.userId].nanovorInventory = users[socket.userId].nanovorInventory.filter(nanovor => nanovor.id !== removeNanovorId);

                                // Update counts
                                users[socket.userId].nanovorCount = users[socket.userId].nanovorInventory.length;
                                users[socket.userId].nanovorCountUnique = users[socket.userId].nanovorInventory.length; // Simplified for now

                                // Save user data after updating inventory
                                saveUserData(socket.userId);
                            }
                        }
                        response = createExtensionResponse("nanovorRemoved");
                        break;

                    case 'addEm':
                        // Add an Energy Matrix to the user's inventory (EM ids are integers only, no uuid)
                        if (params.emData && users[socket.userId]) {
                            const emData = params.emData;
                            const parsedId = typeof emData.id === 'number' ? Math.floor(emData.id) : parseInt(emData.id, 10);
                            if (Number.isNaN(parsedId) || parsedId < 1) {
                                emData.id = getNextEmAssetId();
                            } else {
                                emData.id = parsedId;
                            }
                            emData.assetTypeId = typeof emData.assetTypeId === 'number' ? Math.floor(emData.assetTypeId) : (parseInt(emData.assetTypeId, 10) || 0);

                            // Ensure emInventory exists
                            if (!users[socket.userId].emInventory) {
                                users[socket.userId].emInventory = [];
                            }

                            // Add the new EM to inventory
                            users[socket.userId].emInventory.push(emData);

                            // Update EM count
                            users[socket.userId].ems = users[socket.userId].emInventory.length;

                            // Save user data after updating inventory
                            saveUserData(socket.userId);
                        }
                        response = createExtensionResponse("emAdded");
                        break;

                    case 'removeEm':
                        // Remove an Energy Matrix from the user's inventory
                        if (params.emId !== undefined && users[socket.userId]) {
                            const emId = parseInt(params.emId);

                            if (users[socket.userId].emInventory) {
                                // Filter out the EM with the specified ID
                                users[socket.userId].emInventory = users[socket.userId].emInventory.filter(em => em.id !== emId);

                                // Update EM count
                                users[socket.userId].ems = users[socket.userId].emInventory.length;

                                // Save user data after updating inventory
                                saveUserData(socket.userId);
                            }
                        }
                        response = createExtensionResponse("emRemoved");
                        break;
                    case 'initialize':  // Initial command sent by client to loginXt extension
                    case 'login':
                    case 'init':
                        // logOK: do not send id so client uses SFS login id (session.accountId) for battle.
                        // Include UI features data to enable proper tabs in the header
                        response = createExtensionResponse("logOK", {
                            "chatRoomName": "Lobby",
                            "username": socket.userName || 'n',
                            "userRefId": socket.playerId,
                            "features": {
                                "collectionEnabled": true,
                                "nanomallEnabled": true,
                                "battleEnabled": true,
                                "tradeEnabled": true,
                                "profileEnabled": true,
                                "friendsEnabled": true
                            }
                        });
                        break;
                    default:
                        // Log invalid loginXt command
                        debug.logInvalidRequest(extension, command, params, {
                            remoteAddress: socket.remoteAddress,
                            remotePort: socket.remotePort,
                            userId: socket.userId,
                            userName: socket.userName,
                            playerId: socket.playerId
                        });
                        // For unknown commands, return unknown command response
                        response = createExtensionResponse("unknownCommand");
                        break;
                }
            } catch (error) {
                console.error(`Error processing loginXt command '${command}':`, error);
                // Ensure response always has a _cmd field even in error cases
                response = createExtensionResponse("error", {
                    "message": "Server error processing command"
                });
            }
            break;

        case 'chatXt':
            // Handle chat-related commands using the new chatXt module
            try {
                handleChatXtCommand(socket, command, params);
            } catch (error) {
                console.error(`Error processing chatXt command '${command}':`, error);
                const errorResponse = createExtensionResponse("error", {
                    "message": "Server error processing chat command"
                });
                socket.write(errorResponse);
            }
            return; // Return early since response is handled in the function

        case 'tradeXt':
            // Handle trade-related commands using the new tradeXt module
            try {
                handleTradeCommand(socket, command, params);
            } catch (error) {
                console.error(`Error processing tradeXt command '${command}':`, error);
                const errorResponse = createExtensionResponse("error", {
                    "message": "Server error processing trade command"
                });
                socket.write(errorResponse);
            }
            return; // Return early since response is handled in the function

        case 'buddyListXt':
            // Handle buddy-related commands using the new buddyXt module
            try {
                handleBuddyCommand(socket, command, params);
            } catch (error) {
                console.error(`Error processing buddyListXt command '${command}':`, error);
                const errorResponse = createExtensionResponse("error", {
                    "message": "Server error processing buddy command"
                });
                socket.write(errorResponse);
            }
            return; // Return early since response is handled in the function

        case 'gameXt':
            // Handle battle-related commands
            try {
                handleGameXtCommand(socket, command, params);
            } catch (error) {
                console.error(`Error processing gameXt command '${command}':`, error);
                const errorResponse = createExtensionResponse("error", {
                    "message": "Server error processing game command"
                });
                socket.write(errorResponse);
            }
            return; // Return early since response is handled in the function

        default:
            // Log invalid extension
            debug.logInvalidRequest(extension, command, params, {
                remoteAddress: socket.remoteAddress,
                remotePort: socket.remotePort,
                userId: socket.userId,
                userName: socket.userName,
                playerId: socket.playerId
            });
            response = createExtensionResponse("unknownExtension");
    }

    // Ensure response is always sent
    if (response) {
        console.log('\x1b[31m%s\x1b[0m', `[EXT_DEBUG] Sending extension response:`, response.substring(0, 200) + '...');
        socket.write(response);
    } else {
        // Send a fallback response if none was created
        const fallbackResponse = createExtensionResponse("error", {
            "message": "No response generated"
        });
        console.log('\x1b[31m%s\x1b[0m', `[EXT_DEBUG] Sending fallback extension response:`, fallbackResponse.substring(0, 200) + '...');
        socket.write(fallbackResponse);
    }
}

// Load existing user data at startup

module.exports = handleExtensionCommand;
module.exports.createExtensionResponse = createExtensionResponse;
