const state = require('../../state');
const battle = require('../../battle');
const user = require('../../user');
const { updateUserStatus } = require('./buddyListXt'); // Import the buddy status update function
const debug = require('../../debug/Debug');
const { users, battleRooms } = state;
const { sendMessageToUser, broadcastToBattle } = battle;
const { saveUserData } = user;

/** Sensei (AI) player IDs from sensei-players.xml. */
const SENSEI_IDS = new Set(['-5', '-4', '-3', '-2', '-1', -5, -4, -3, -2, -1]);

/** Client-facing userRefId string. Sensei battles: client uses _userProfile.id=0 for human, so send "0"; sensei keeps their id. */
function clientUserRefId(battleRoom, p) {
    if (!p) return '';
    if (isSenseiBattle(battleRoom) && !SENSEI_IDS.has(p.id)) return '0';
    return String(p.id);
}

/** Build player list for client. Players have username, userRefId; we add selectedSwarmIds.
 *  Order: player (positive id) first, then sensei (-5 etc.) so client sees players[0] = local, players[1] = Training. */
function playersForClient(battleRoom) {
    if (!battleRoom || !battleRoom.players) return [];
    const hasSensei = battleRoom.players.some(p => SENSEI_IDS.has(p.id));
    const list = battleRoom.players.map(p => ({
        username: p.name,
        userRefId: clientUserRefId(battleRoom, p),
        selectedSwarmIds: Array.isArray(p.nanovorSwarm) ? p.nanovorSwarm : []
    }));
    if (hasSensei && list.length === 2) {
        list.sort((a, b) => Number(b.userRefId) - Number(a.userRefId));
    }
    return list;
}

/** Default sensei swarms by userRefId (from sensei-players.xml). */
const SENSEI_DEFAULT_SWARMS = {
    '-5': [24],   // Training: Doom Blade
    '-4': [3, 35, 50, 39],   // Medium
    '-3': [11, 24, 6],       // Easy
    '-2': [30, 44],          // " Easy "
    '-1': [19, 39]           // "  Easy  "
};

/** True if this battle has a sensei (AI) player. Server sends isSenseiBattle so client can set SENSEI_BATTLE and show tutorial UI. */
function isSenseiBattle(battleRoom) {
    return battleRoom && battleRoom.players && battleRoom.players.some(p => SENSEI_IDS.has(p.id));
}

/** Ensure human player has a default swarm from inventory if empty (e.g. tutorial before setSwarm). Sensei gets default from SENSEI_DEFAULT_SWARMS. */
function ensureDefaultSwarmForPlayer(battleRoom, playerIndex) {
    if (!battleRoom || !battleRoom.players || playerIndex < 0 || playerIndex >= battleRoom.players.length) return;
    const p = battleRoom.players[playerIndex];
    if (p.nanovorSwarm && p.nanovorSwarm.length > 0) return;
    const senseiId = String(p.id);
    if (SENSEI_DEFAULT_SWARMS[senseiId]) {
        p.nanovorSwarm = SENSEI_DEFAULT_SWARMS[senseiId].slice(0);
        console.log(`[GAMEXT_LOG] Sensei default swarm for ${p.name} (${p.id}): [${p.nanovorSwarm.join(',')}]`);
        return;
    }
    const u = users[p.id];
    if (!u || !u.nanovorInventory || u.nanovorInventory.length === 0) return;
    const limit = Math.min(2, u.nanovorInventory.length);
    p.nanovorSwarm = u.nanovorInventory.slice(0, limit).map(n => Number(n.id)).filter(n => !Number.isNaN(n));
    console.log(`[GAMEXT_LOG] Default swarm for ${p.name} (${p.id}): [${p.nanovorSwarm.join(',')}]`);
}

function handleGameXtCommand(socket, command, params) {
    if (socket.playerId == null && socket.userId != null) socket.playerId = socket.userId;
    console.log(`[GAMEXT_LOG] Handling gameXt command: ${command}`, params);

    // Log the extension request for debugging
    debug.logExtensionRequest('gameXt', command, params, {
        remoteAddress: socket.remoteAddress,
        remotePort: socket.remotePort,
        userId: socket.userId,
        userName: socket.userName,
        playerId: socket.playerId
    });

    let response = '';

    switch (command) {
        case 'createQuickBattle':
            console.log(`[GAMEXT_LOG] createQuickBattle command called by user ${socket.userId} (${socket.userName})`, params);
            // Create a quick battle with specified parameters
            const gameSwarmValue = params.gameSwarmValue || 1000;
            const totalPlayers = params.totalPlayers || 2;

            // Generate a unique battle name
            const newBattleName = `quick_battle_${Date.now()}_${socket.userId}`;

            // Create battle room
            const battleRoom = {
                id: state.battleIdCounter++,
                name: newBattleName,
                gameSwarmValue: gameSwarmValue,
                maxPlayers: totalPlayers,
                players: [{
                    id: socket.playerId,
                    name: socket.userName,
                    ready: false,
                    nanovorSwarm: [],
                    selectedNanovor: null,
                    enemyTarget: null
                }],
                creator: socket.playerId,
                creatorName: socket.userName,
                gameState: 'waiting_for_players', // waiting_for_players, in_progress, finished
                turnOrder: [],
                currentTurn: 0,
                round: 1,
                battleHistory: []
            };

            battleRooms[newBattleName] = battleRoom;

            // Update socket's active battle
            socket.activeBattle = newBattleName;

            // Update user's status to "in battle" and notify their buddies
            updateUserStatus(socket.userId, 'in battle');

            response = JSON.stringify({
                "t": "xt",
                "b": {
                    "action": "xtRes",
                    "r": -1,
                    "o": {
                        "_cmd": "gameCreated",
                        "battleName": newBattleName,
                        "gameCreator": socket.userName,
                        "convertedChatRoom": false
                    }
                }
            }) + '\x00';
            console.log(`[GAMEXT_LOG] createQuickBattle completed, battle created: ${newBattleName}`);
            break;

        case 'createGame':
            // Create a custom game
            const customSwarmValue = params.gameSwarmValue || 1000;
            const convertedChatRoom = params.convertedChatRoom || false;

            // Generate a unique battle name
            const customBattleName = `custom_battle_${Date.now()}_${socket.userId}`;

            // Create battle room
            const customBattleRoom = {
                id: state.battleIdCounter++,
                name: customBattleName,
                gameSwarmValue: customSwarmValue,
                maxPlayers: 2, // Default to 2 players
                players: [{
                    id: socket.playerId,
                    name: socket.userName,
                    ready: false,
                    nanovorSwarm: [],
                    selectedNanovor: null,
                    enemyTarget: null
                }],
                creator: socket.playerId,
                creatorName: socket.userName,
                gameState: 'waiting_for_players',
                turnOrder: [],
                currentTurn: 0,
                round: 1,
                battleHistory: []
            };

            battleRooms[customBattleName] = customBattleRoom;

            // Update socket's active battle
            socket.activeBattle = customBattleName;

            response = JSON.stringify({
                "t": "xt",
                "b": {
                    "action": "xtRes",
                    "r": -1,
                    "o": {
                        "_cmd": "gameCreated",
                        "battleName": customBattleName,
                        "gameCreator": socket.userName,
                        "convertedChatRoom": convertedChatRoom
                    }
                }
            }) + '\x00';
            break;

        case 'inviteUser':
            // Invite a user to a battle
            const invitee = params.buddy; // Username of the person to invite
            const battleToInvite = params.battleName;
            const convertedRoom = params.convertedChatRoom || false;

            // Find the user ID for the invitee
            let inviteeId = null;
            for (const userId in users) {
                if (users[userId].username === invitee) {
                    inviteeId = userId;
                    break;
                }
            }

            if (inviteeId) {
                // Send invitation to the invitee
                const invitationMsg = JSON.stringify({
                    "t": "xt",
                    "b": {
                        "action": "xtRes",
                        "r": -1,
                        "o": {
                            "_cmd": "invitationRequest",
                            "battleName": battleToInvite,
                            "inviter": {
                                "username": socket.userName,
                                "userRefId": socket.playerId
                            },
                            "gameSwarmValue": battleRooms[battleToInvite]?.gameSwarmValue || 1000,
                            "convertedChatRoom": convertedRoom
                        }
                    }
                }) + '\x00';

                if (sendMessageToUser(inviteeId, invitationMsg)) {
                    response = JSON.stringify({
                        "t": "xt",
                        "b": {
                            "action": "xtRes",
                            "r": -1,
                            "o": {
                                "_cmd": "invitationSent",
                                "battleName": battleToInvite,
                                "invitedUser": invitee
                            }
                        }
                    }) + '\x00';
                } else {
                    response = JSON.stringify({
                        "t": "xt",
                        "b": {
                            "action": "xtRes",
                            "r": -1,
                            "o": {
                                "_cmd": "gameInvitationError",
                                "errorMessage": "Player offline"
                            }
                        }
                    }) + '\x00';
                }
            } else {
                response = JSON.stringify({
                    "t": "xt",
                    "b": {
                        "action": "xtRes",
                        "r": -1,
                        "o": {
                            "_cmd": "gameInvitationError",
                            "errorMessage": "Player not found"
                        }
                    }
                }) + '\x00';
            }
            break;

        case 'replyInvitation':
            // Reply to a battle invitation (accept/decline)
            const battleName = params.battleName;
            const accept = params.accept;
            const replyReason = params.replyReason || 'ACCEPTED';

            if (accept) {
                // User accepted the invitation
                const battleRoom = battleRooms[battleName];

                if (battleRoom) {
                    // Add the user to the battle room if there's space
                    if (battleRoom.players.length < battleRoom.maxPlayers) {
                        battleRoom.players.push({
                            id: socket.playerId,
                            name: socket.userName,
                            ready: false,
                            nanovorSwarm: [],
                            selectedNanovor: null,
                            enemyTarget: null
                        });

                        // Update socket's active battle
                        socket.activeBattle = battleName;

                        // Update user's status to "in battle" and notify their buddies
                        updateUserStatus(socket.userId, 'in battle');

                        // Send invitation response to the game creator
                        // Construct invitation response properly to avoid JSON injection issues
                        const invitationResponse = {
                            "_cmd": "invitationResponse",
                            "battleName": battleName,
                            "player": socket.userName,
                            "inviterName": battleRoom.creatorName,
                            "inviterId": battleRoom.creator,
                            "otherPlayers": battleRoom.players.filter(p => p.id !== socket.playerId && p.id !== battleRoom.creator).map(p => ({username: p.name, userRefId: p.id}))
                        };
                        const responseMsg = JSON.stringify({
                            "t": "xt",
                            "b": {
                                "action": "xtRes",
                                "r": -1,
                                "o": invitationResponse
                            }
                        }) + '\x00';

                        sendMessageToUser(battleRoom.creator, responseMsg);

                        // If we now have enough players, start the game
                        if (battleRoom.players.length === battleRoom.maxPlayers) {
                            battleRoom.gameState = 'in_progress';

                            // Set up turn order and ensure default swarm for humans
                            battleRoom.turnOrder = [...battleRoom.players];
                            battleRoom.players.forEach((p, idx) => { ensureDefaultSwarmForPlayer(battleRoom, idx); });

                            // Send game started message to all players (include selectedSwarmIds)
                            // Manually construct response to ensure _cmd is always present
                            const playersJson = JSON.stringify(playersForClient(battleRoom));
                            const gameStartMsg = JSON.stringify({
                                "t": "xt",
                                "b": {
                                    "action": "xtRes",
                                    "r": -1,
                                    "o": {
                                        "_cmd": "gameStarted",
                                        "battleName": battleName,
                                        "players": JSON.parse(playersJson),
                                        "gameCreator": battleRoom.creatorName
                                    }
                                }
                            }) + '\x00';

                            broadcastToBattle(battleName, gameStartMsg);
                        }

                        response = JSON.stringify({
                            "t": "xt",
                            "b": {
                                "action": "xtRes",
                                "r": -1,
                                "o": {
                                    "_cmd": "invitationResponse",
                                    "battleName": battleName,
                                    "accepted": true
                                }
                            }
                        }) + '\x00';
                    } else {
                        response = JSON.stringify({
                            "t": "xt",
                            "b": {
                                "action": "xtRes",
                                "r": -1,
                                "o": {
                                    "_cmd": "gameError"
                                }
                            }
                        }) + '\x00';
                    }
                } else {
                    response = JSON.stringify({
                        "t": "xt",
                        "b": {
                            "action": "xtRes",
                            "r": -1,
                            "o": {
                                "_cmd": "gameError"
                            }
                        }
                    }) + '\x00';
                }
            } else {
                // User declined the invitation
                const battleRoom = battleRooms[battleName];
                if (battleRoom) {
                    // Send decline notification to the game creator
                    const declineMsg = JSON.stringify({
                        "t": "xt",
                        "b": {
                            "action": "xtRes",
                            "r": -1,
                            "o": {
                                "_cmd": "invitationResponse",
                                "battleName": battleName,
                                "accepted": false,
                                "player": socket.userName,
                                "reason": replyReason
                            }
                        }
                    }) + '\x00';

                    sendMessageToUser(battleRoom.creator, declineMsg);
                }

                response = JSON.stringify({
                    "t": "xt",
                    "b": {
                        "action": "xtRes",
                        "r": -1,
                        "o": {
                            "_cmd": "invitationResponse",
                            "battleName": battleName,
                            "accepted": false,
                            "reason": replyReason
                        }
                    }
                }) + '\x00';
            }
            break;

        case 'setGameSwarmValue':
            // Set the game swarm value for the battle
            const newSwarmValue = params.gameSwarmValue || 1000;
            const currentBattle = socket.activeBattle ? battleRooms[socket.activeBattle] : null;

            if (currentBattle && currentBattle.creator === socket.playerId) {
                currentBattle.gameSwarmValue = newSwarmValue;

                // Notify other players of the change
                const swarmValueSetMsg = JSON.stringify({
                    "t": "xt",
                    "b": {
                        "action": "xtRes",
                        "r": -1,
                        "o": {
                            "_cmd": "gameSwarmValueSet",
                            "battleName": currentBattle.name,
                            "gameSwarmValue": newSwarmValue
                        }
                    }
                }) + '\x00';

                broadcastToBattle(currentBattle.name, swarmValueSetMsg, socket.playerId);

                response = JSON.stringify({
                    "t": "xt",
                    "b": {
                        "action": "xtRes",
                        "r": -1,
                        "o": {
                            "_cmd": "gameSwarmValueSet",
                            "battleName": currentBattle.name,
                            "gameSwarmValue": newSwarmValue
                        }
                    }
                }) + '\x00';
            } else {
                response = JSON.stringify({
                    "t": "xt",
                    "b": {
                        "action": "xtRes",
                        "r": -1,
                        "o": {
                            "_cmd": "gameError"
                        }
                    }
                }) + '\x00';
            }
            break;

        case 'setSwarm':
            console.log(`[GAMEXT_LOG] setSwarm command called by user ${socket.userId} (${socket.userName})`, params);
            // Parse nanovor IDs: client may send nanovorIds, selectedSwarmIds, or swarmIds (string "1,24", array [1, 24], or array of objects [{id:1}])
            const rawNanovorIds = params.nanovorIds ?? params.selectedSwarmIds ?? params.swarmIds;
            let nanovorIds = [];
            if (rawNanovorIds != null) {
                if (Array.isArray(rawNanovorIds)) {
                    nanovorIds = rawNanovorIds.map(item => (item && typeof item === 'object' && 'id' in item ? Number(item.id) : Number(item))).filter(n => !Number.isNaN(n));
                } else {
                    nanovorIds = String(rawNanovorIds).split(',').map(id => parseInt(id.trim(), 10)).filter(n => !Number.isNaN(n));
                }
            }
            const activeBattle = socket.activeBattle ? battleRooms[socket.activeBattle] : null;

            if (activeBattle) {
                const playerIndex = activeBattle.players.findIndex(p => p.id === socket.playerId);
                if (playerIndex !== -1) {
                    // Validate that the user actually owns these nanovor (match by numeric id)
                    const user = users[socket.userId];
                    if (user && user.nanovorInventory && user.nanovorInventory.length > 0) {
                        const validNanovorIds = nanovorIds.filter(nanovorId =>
                            user.nanovorInventory.some(nano => Number(nano.id) === Number(nanovorId))
                        );

                        // Check if the swarm size is within limits
                        const gameSwarmValue = activeBattle.gameSwarmValue || 1000;
                        let totalSwarmValue = 0;

                        for (const nanovorId of validNanovorIds) {
                            const nanovor = user.nanovorInventory.find(nano => nano.id === nanovorId);
                            if (nanovor) {
                                totalSwarmValue += nanovor.pv || 0; // Use point value from nanovor data
                            }
                        }

                        // For NewUserState, we might want to allow a lower swarm value or different validation
                        if (totalSwarmValue > gameSwarmValue && activeBattle.name.includes('newuser')) {
                            // Allow some flexibility for new user experience
                            console.log(`[GAMEXT_LOG] Allowing swarm value ${totalSwarmValue} for new user battle (limit: ${gameSwarmValue})`);
                        } else if (totalSwarmValue > gameSwarmValue) {
                            // Swarm exceeds the game limit
                            console.log(`[GAMEXT_LOG] setSwarm rejected - swarm value ${totalSwarmValue} exceeds limit ${gameSwarmValue}`);
                            response = JSON.stringify({
                                "t": "xt",
                                "b": {
                                    "action": "xtRes",
                                    "r": -1,
                                    "o": {
                                        "_cmd": "gameError",
                                        "errorMessage": `Swarm value ${totalSwarmValue} exceeds limit ${gameSwarmValue}`
                                    }
                                }
                            }) + '\x00';
                        } else {
                            // Valid swarm, update the player's swarm
                            activeBattle.players[playerIndex].nanovorSwarm = validNanovorIds;
                            console.log(`[GAMEXT_LOG] setSwarm accepted - user ${socket.userId} set swarm with ${validNanovorIds.length} nanovors (value: ${totalSwarmValue})`);

                            const setSwarmUserRefId = clientUserRefId(activeBattle, activeBattle.players[playerIndex]);
                            const swarmSelectedMsg = JSON.stringify({
                                "t": "xt",
                                "b": {
                                    "action": "xtRes",
                                    "r": -1,
                                    "o": {
                                        "_cmd": "swarmSelected",
                                        "battleName": activeBattle.name,
                                        "swarmCount": validNanovorIds.length,
                                        "swarmValue": totalSwarmValue,
                                        "username": socket.userName,
                                        "userRefId": setSwarmUserRefId,
                                        "selectedSwarmIds": validNanovorIds
                                    }
                                }
                            }) + '\x00';

                            broadcastToBattle(activeBattle.name, swarmSelectedMsg, socket.playerId);

                            response = JSON.stringify({
                                "t": "xt",
                                "b": {
                                    "action": "xtRes",
                                    "r": -1,
                                    "o": {
                                        "_cmd": "swarmSelected",
                                        "battleName": activeBattle.name,
                                        "swarmCount": validNanovorIds.length,
                                        "swarmValue": totalSwarmValue,
                                        "username": socket.userName,
                                        "userRefId": setSwarmUserRefId,
                                        "selectedSwarmIds": validNanovorIds
                                    }
                                }
                            }) + '\x00';
                        }
                    } else {
                        // User doesn't have inventory data, use basic validation
                        activeBattle.players[playerIndex].nanovorSwarm = nanovorIds;
                        console.log(`[GAMEXT_LOG] setSwarm accepted (no inventory validation) - user ${socket.userId} set swarm with ${nanovorIds.length} nanovors`);

                        const setSwarmUserRefId = clientUserRefId(activeBattle, activeBattle.players[playerIndex]);
                        const swarmSelectedMsg = JSON.stringify({
                            "t": "xt",
                            "b": {
                                "action": "xtRes",
                                "r": -1,
                                "o": {
                                    "_cmd": "swarmSelected",
                                    "battleName": activeBattle.name,
                                    "swarmCount": nanovorIds.length,
                                    "username": socket.userName,
                                    "userRefId": setSwarmUserRefId,
                                    "selectedSwarmIds": nanovorIds
                                }
                            }
                        }) + '\x00';

                        broadcastToBattle(activeBattle.name, swarmSelectedMsg, socket.playerId);

                        response = JSON.stringify({
                            "t": "xt",
                            "b": {
                                "action": "xtRes",
                                "r": -1,
                                "o": {
                                    "_cmd": "swarmSelected",
                                    "battleName": activeBattle.name,
                                    "swarmCount": nanovorIds.length,
                                    "username": socket.userName,
                                    "userRefId": setSwarmUserRefId,
                                    "selectedSwarmIds": nanovorIds
                                }
                            }
                        }) + '\x00';
                    }
                } else {
                    console.log(`[GAMEXT_LOG] setSwarm failed - user ${socket.userId} not found in battle ${socket.activeBattle}`);
                    response = JSON.stringify({
                        "t": "xt",
                        "b": {
                            "action": "xtRes",
                            "r": -1,
                            "o": {
                                "_cmd": "gameError"
                            }
                        }
                    }) + '\x00';
                }
            } else {
                console.log(`[GAMEXT_LOG] setSwarm failed - no active battle for user ${socket.userId}`);
                response = JSON.stringify({
                    "t": "xt",
                    "b": {
                        "action": "xtRes",
                        "r": -1,
                        "o": {
                            "_cmd": "gameError"
                        }
                    }
                }) + '\x00';
            }
            break;

        case 'setSelectedNanovor':
            // Set the selected nanovor for the player
            const selectedNanovorId = params.nanovorId || 0;
            const selectedBattle = socket.activeBattle ? battleRooms[socket.activeBattle] : null;

            if (selectedBattle) {
                const playerIndex = selectedBattle.players.findIndex(p => p.id === socket.playerId);
                if (playerIndex !== -1) {
                    selectedBattle.players[playerIndex].selectedNanovor = selectedNanovorId;

                    response = JSON.stringify({
                        "t": "xt",
                        "b": {
                            "action": "xtRes",
                            "r": -1,
                            "o": {
                                "_cmd": "selectedNanovorSet",
                                "nanovorId": selectedNanovorId
                            }
                        }
                    }) + '\x00';
                } else {
                    response = JSON.stringify({
                        "t": "xt",
                        "b": {
                            "action": "xtRes",
                            "r": -1,
                            "o": {
                                "_cmd": "gameError"
                            }
                        }
                    }) + '\x00';
                }
            } else {
                response = JSON.stringify({
                    "t": "xt",
                    "b": {
                        "action": "xtRes",
                        "r": -1,
                        "o": {
                            "_cmd": "gameError"
                        }
                    }
                }) + '\x00';
            }
            break;

        case 'setEnemy':
            // Set the target enemy for attack
            const enemyUsername = params.enemyUsername;
            const enemyBattle = socket.activeBattle ? battleRooms[socket.activeBattle] : null;

            if (enemyBattle) {
                const playerIndex = enemyBattle.players.findIndex(p => p.id === socket.playerId);
                if (playerIndex !== -1) {
                    // Find the target player by username
                    const targetIndex = enemyBattle.players.findIndex(p => p.name === enemyUsername);
                    if (targetIndex !== -1) {
                        enemyBattle.players[playerIndex].enemyTarget = enemyBattle.players[targetIndex].id;

                        // Send target selected notification to all players
                        const targetSelectedMsg = JSON.stringify({
                            "t": "xt",
                            "b": {
                                "action": "xtRes",
                                "r": -1,
                                "o": {
                                    "_cmd": "targetSelected",
                                    "userRefId": socket.playerId,
                                    "targetUserRefId": enemyBattle.players[targetIndex].id,
                                    "attackId": 0
                                }
                            }
                        }) + '\x00';

                        broadcastToBattle(enemyBattle.name, targetSelectedMsg);

                        response = JSON.stringify({
                            "t": "xt",
                            "b": {
                                "action": "xtRes",
                                "r": -1,
                                "o": {
                                    "_cmd": "enemyTargetSet",
                                    "targetUsername": enemyUsername,
                                    "targetId": enemyBattle.players[targetIndex].id
                                }
                            }
                        }) + '\x00';
                    } else {
                        response = JSON.stringify({
                            "t": "xt",
                            "b": {
                                "action": "xtRes",
                                "r": -1,
                                "o": {
                                    "_cmd": "gameError"
                                }
                            }
                        }) + '\x00';
                    }
                } else {
                    response = JSON.stringify({
                        "t": "xt",
                        "b": {
                            "action": "xtRes",
                            "r": -1,
                            "o": {
                                "_cmd": "gameError"
                            }
                        }
                    }) + '\x00';
                }
            } else {
                response = JSON.stringify({
                    "t": "xt",
                    "b": {
                        "action": "xtRes",
                        "r": -1,
                        "o": {
                            "_cmd": "gameError"
                        }
                    }
                }) + '\x00';
            }
            break;

        case 'setAttackInfo':
            // Set complete attack information
            const targetPlayerName = params.enemyUsername;
            const myNanovorId = params.nanovorId;
            const setAttackId = params.attackId;
            const swapNanovorId = params.swapNanovorId;
            const attackBattle = socket.activeBattle ? battleRooms[socket.activeBattle] : null;

            if (attackBattle) {
                const playerIndex = attackBattle.players.findIndex(p => p.id === socket.playerId);
                if (playerIndex !== -1) {
                    // Find the target player
                    const targetIndex = attackBattle.players.findIndex(p => p.name === targetPlayerName);
                    if (targetIndex !== -1) {
                        // Record the attack info
                        const attackInfo = {
                            attackerId: socket.playerId,
                            targetId: attackBattle.players[targetIndex].id,
                            nanovorId: myNanovorId,
                            attackId: setAttackId,
                            swapNanovorId: swapNanovorId,
                            timestamp: Date.now()
                        };

                        attackBattle.battleHistory.push(attackInfo);

                        // Send attack performed notification to all players
                        const attackMsg = JSON.stringify({
                            "t": "xt",
                            "b": {
                                "action": "xtRes",
                                "r": -1,
                                "o": {
                                    "_cmd": "performAttack",
                                    "attackResults": {
                                        "attackerId": socket.playerId,
                                        "targetId": attackBattle.players[targetIndex].id,
                                        "nanovorId": myNanovorId,
                                        "attackId": setAttackId
                                    }
                                }
                            }
                        }) + '\x00';

                        broadcastToBattle(attackBattle.name, attackMsg);

                        response = JSON.stringify({
                            "t": "xt",
                            "b": {
                                "action": "xtRes",
                                "r": -1,
                                "o": {
                                    "_cmd": "attackInfoSet",
                                    "attackId": setAttackId
                                }
                            }
                        }) + '\x00';
                    } else {
                        response = JSON.stringify({
                            "t": "xt",
                            "b": {
                                "action": "xtRes",
                                "r": -1,
                                "o": {
                                    "_cmd": "gameError"
                                }
                            }
                        }) + '\x00';
                    }
                } else {
                    response = JSON.stringify({
                        "t": "xt",
                        "b": {
                            "action": "xtRes",
                            "r": -1,
                            "o": {
                                "_cmd": "gameError"
                            }
                        }
                    }) + '\x00';
                }
            } else {
                response = JSON.stringify({
                    "t": "xt",
                    "b": {
                        "action": "xtRes",
                        "r": -1,
                        "o": {
                            "_cmd": "gameError"
                        }
                    }
                }) + '\x00';
            }
            break;

        case 'endRound':
            // End the current round
            const roundBattle = socket.activeBattle ? battleRooms[socket.activeBattle] : null;

            if (roundBattle) {
                // Increment round number
                roundBattle.round++;

                // Reset turn counter for the new round
                roundBattle.currentTurn = 0;

                // Send round completed notification to all players
                const roundCompleteMsg = JSON.stringify({
                    "t": "xt",
                    "b": {
                        "action": "xtRes",
                        "r": -1,
                        "o": {
                            "_cmd": "roundCompleted",
                            "round": roundBattle.round
                        }
                    }
                }) + '\x00';

                broadcastToBattle(roundBattle.name, roundCompleteMsg);

                response = JSON.stringify({
                    "t": "xt",
                    "b": {
                        "action": "xtRes",
                        "r": -1,
                        "o": {
                            "_cmd": "roundEnded",
                            "round": roundBattle.round
                        }
                    }
                }) + '\x00';
            } else {
                response = JSON.stringify({
                    "t": "xt",
                    "b": {
                        "action": "xtRes",
                        "r": -1,
                        "o": {
                            "_cmd": "gameError"
                        }
                    }
                }) + '\x00';
            }
            break;

        case 'quitGame':
            console.log(`[GAMEXT_LOG] quitGame command called by user ${socket.userId} (${socket.userName})`, params);
            // Quit the current game
            const quittingUserId = params.userRefId;
            const quitBattle = socket.activeBattle ? battleRooms[socket.activeBattle] : null;

            if (quitBattle) {
                // Remove player from the battle
                quitBattle.players = quitBattle.players.filter(p => p.id !== quittingUserId);
                console.log(`[GAMEXT_LOG] quitGame - user ${quittingUserId} removed from battle ${quitBattle.name}, ${quitBattle.players.length} players remaining`);

                // If there's only one player left, end the game
                if (quitBattle.players.length <= 1) {
                    quitBattle.gameState = 'finished';
                    console.log(`[GAMEXT_LOG] quitGame - only ${quitBattle.players.length} player left, ending game`);

                    // Notify remaining players that the game is over
                    const gameOverMsg = JSON.stringify({
                        "t": "xt",
                        "b": {
                            "action": "xtRes",
                            "r": -1,
                            "o": {
                                "_cmd": "gameOver",
                                "winnerId": quitBattle.players[0]?.id || '',
                                "results": "Game ended due to player quit"
                            }
                        }
                    }) + '\x00';

                    broadcastToBattle(quitBattle.name, gameOverMsg);
                } else {
                    // Notify other players that someone quit
                    const playerQuitMsg = JSON.stringify({
                        "t": "xt",
                        "b": {
                            "action": "xtRes",
                            "r": -1,
                            "o": {
                                "_cmd": "playerQuitGame",
                                "userRefId": quittingUserId,
                                "username": users[quittingUserId]?.username || 'Unknown'
                            }
                        }
                    }) + '\x00';
                    console.log(`[GAMEXT_LOG] quitGame - notifying other players about user ${quittingUserId} quitting`);

                    broadcastToBattle(quitBattle.name, playerQuitMsg);
                }

                // Clear the active battle for the socket
                socket.activeBattle = null;

                // Update user's status to "online" and notify their buddies
                updateUserStatus(quittingUserId, 'online');

                response = JSON.stringify({
                    "t": "xt",
                    "b": {
                        "action": "xtRes",
                        "r": -1,
                        "o": {
                            "_cmd": "quitGameConfirmed",
                            "userRefId": quittingUserId
                        }
                    }
                }) + '\x00';
                console.log(`[GAMEXT_LOG] quitGame completed for user ${quittingUserId}`);
            } else {
                console.log(`[GAMEXT_LOG] quitGame failed - no active battle for user ${socket.userId}`);
                response = JSON.stringify({
                    "t": "xt",
                    "b": {
                        "action": "xtRes",
                        "r": -1,
                        "o": {
                            "_cmd": "gameError"
                        }
                    }
                }) + '\x00';
            }
            break;

        case 'cancelQuickBattle':
            // Cancel matchmaking
            const cancelUserId = params.userRefId;
            const cancelBattleName = Object.keys(battleRooms).find(battleName => {
                const battle = battleRooms[battleName];
                return battle.creator === cancelUserId && battle.gameState === 'waiting_for_players';
            });

            if (cancelBattleName) {
                // Notify other players in the battle that it's cancelled
                const cancelMsg = JSON.stringify({
                    "t": "xt",
                    "b": {
                        "action": "xtRes",
                        "r": -1,
                        "o": {
                            "_cmd": "gameOver",
                            "results": "Game was cancelled by the creator"
                        }
                    }
                }) + '\x00';

                broadcastToBattle(cancelBattleName, cancelMsg);

                delete battleRooms[cancelBattleName];

                // Clear the active battle for the socket
                socket.activeBattle = null;

                // Update user's status to "online" and notify their buddies
                updateUserStatus(cancelUserId, 'online');

                response = JSON.stringify({
                    "t": "xt",
                    "b": {
                        "action": "xtRes",
                        "r": -1,
                        "o": {
                            "_cmd": "quickBattleCancelled"
                        }
                    }
                }) + '\x00';
            } else {
                response = JSON.stringify({
                    "t": "xt",
                    "b": {
                        "action": "xtRes",
                        "r": -1,
                        "o": {
                            "_cmd": "gameError"
                        }
                    }
                }) + '\x00';
            }
            break;

        case 'getBadgeList':
            // Get badge list for a player
            const ownerId = params.ownerId;
            const nanovorId = params.nanovorId;

            // Return empty badge list for now
            response = JSON.stringify({
                "t": "xt",
                "b": {
                    "action": "xtRes",
                    "r": -1,
                    "o": {
                        "_cmd": "badgeList",
                        "ownerId": ownerId,
                        "nanovorId": nanovorId,
                        "badges": []
                    }
                }
            }) + '\x00';
            break;

        case 'startGame':
            console.log(`[GAMEXT_LOG] startGame command called by user ${socket.userId} (${socket.userName})`, params);
            // Start the game manually (when all players are ready)
            const startBattleName = params.battleName;
            const startBattle = battleRooms[startBattleName];

            if (startBattle) {
                startBattle.gameState = 'in_progress';
                console.log(`[GAMEXT_LOG] startGame - starting game in battle ${startBattleName}, ${startBattle.players.length} players`);

                // Set up turn order
                startBattle.turnOrder = [...startBattle.players];
                startBattle.players.forEach((p, idx) => { ensureDefaultSwarmForPlayer(startBattle, idx); });

                // Send game started message to all players (include selectedSwarmIds so client can show nanovors)
                // Construct game start response properly to avoid JSON injection issues
                // Manually construct response to ensure _cmd is always present
                const playersJson = JSON.stringify(playersForClient(startBattle));
                const gameStartMsg = JSON.stringify({
                    "t": "xt",
                    "b": {
                        "action": "xtRes",
                        "r": -1,
                        "o": {
                            "_cmd": "gameStarted",
                            "battleName": startBattleName,
                            "players": JSON.parse(playersJson),
                            "gameCreator": startBattle.creatorName
                        }
                    }
                }) + '\x00';

                broadcastToBattle(startBattleName, gameStartMsg);

                response = JSON.stringify({
                    "t": "xt",
                    "b": {
                        "action": "xtRes",
                        "r": -1,
                        "o": {
                            "_cmd": "gameStarted",
                            "battleName": startBattleName
                        }
                    }
                }) + '\x00';
                console.log(`[GAMEXT_LOG] startGame completed for battle ${startBattleName}`);
            } else {
                console.log(`[GAMEXT_LOG] startGame failed - battle ${startBattleName} not found`);
                response = JSON.stringify({
                    "t": "xt",
                    "b": {
                        "action": "xtRes",
                        "r": -1,
                        "o": {
                            "_cmd": "gameError"
                        }
                    }
                }) + '\x00';
            }
            break;

        case 'setAttack':
            // Set attack to perform
            const attackToSet = params.attackId || 0;

            // In a real implementation, this would record the player's chosen attack
            // For now, just acknowledge the command
            response = JSON.stringify({
                "t": "xt",
                "b": {
                    "action": "xtRes",
                    "r": -1,
                    "o": {
                        "_cmd": "attackSet",
                        "attackId": attackToSet
                    }
                }
            }) + '\x00';
            break;

        case 'setNextSwap':
            // Set next nanovor to swap to
            const nextNanovorId = params.nanovorId || 0;
            const swapBattle = socket.activeBattle ? battleRooms[socket.activeBattle] : null;

            if (swapBattle) {
                const playerIndex = swapBattle.players.findIndex(p => p.id === socket.playerId);
                if (playerIndex !== -1) {
                    // Record the swap intention
                    swapBattle.players[playerIndex].nextSwap = nextNanovorId;

                    response = JSON.stringify({
                        "t": "xt",
                        "b": {
                            "action": "xtRes",
                            "r": -1,
                            "o": {
                                "_cmd": "nextSwapSet",
                                "nanovorId": nextNanovorId
                            }
                        }
                    }) + '\x00';
                } else {
                    response = JSON.stringify({
                        "t": "xt",
                        "b": {
                            "action": "xtRes",
                            "r": -1,
                            "o": {
                                "_cmd": "gameError"
                            }
                        }
                    }) + '\x00';
                }
            } else {
                response = JSON.stringify({
                    "t": "xt",
                    "b": {
                        "action": "xtRes",
                        "r": -1,
                        "o": {
                            "_cmd": "gameError"
                        }
                    }
                }) + '\x00';
            }
            break;

        case 'declinedToWatch':
            // Player declined to watch an ongoing battle
            const declinerId = params.userRefId;

            response = JSON.stringify({
                "t": "xt",
                "b": {
                    "action": "xtRes",
                    "r": -1,
                    "o": {
                        "_cmd": "declinedToWatchConfirmed",
                        "userRefId": declinerId
                    }
                }
            }) + '\x00';
            break;

        case 'kickPlayerOut':
            // Kick a player from the battle
            const usernameToKick = params.username;
            const kickBattle = socket.activeBattle ? battleRooms[socket.activeBattle] : null;

            if (kickBattle && kickBattle.creator === socket.playerId) {
                // Find and remove the player
                const playerToKickIndex = kickBattle.players.findIndex(p => p.name === usernameToKick);
                if (playerToKickIndex !== -1) {
                    const kickedPlayer = kickBattle.players[playerToKickIndex];

                    // Send kick notification to the kicked player
                    const kickMsg = JSON.stringify({
                        "t": "xt",
                        "b": {
                            "action": "xtRes",
                            "r": -1,
                            "o": {
                                "_cmd": "playerKickedOut",
                                "userRefId": kickedPlayer.id
                            }
                        }
                    }) + '\x00';

                    sendMessageToUser(kickedPlayer.id, kickMsg);

                    // Remove the player from the battle
                    kickBattle.players.splice(playerToKickIndex, 1);

                    // If there's only one player left, end the game
                    if (kickBattle.players.length <= 1) {
                        kickBattle.gameState = 'finished';

                        // Notify remaining players that the game is over
                        const gameOverMsg = JSON.stringify({
                            "t": "xt",
                            "b": {
                                "action": "xtRes",
                                "r": -1,
                                "o": {
                                    "_cmd": "gameOver",
                                    "winnerId": kickBattle.players[0]?.id || '',
                                    "results": "Game ended due to player kick"
                                }
                            }
                        }) + '\x00';

                        broadcastToBattle(kickBattle.name, gameOverMsg);
                    } else {
                        // Notify other players that someone was kicked
                        const playerKickedMsg = JSON.stringify({
                            "t": "xt",
                            "b": {
                                "action": "xtRes",
                                "r": -1,
                                "o": {
                                    "_cmd": "playerQuitGame",
                                    "userRefId": kickedPlayer.id,
                                    "username": kickedPlayer.name
                                }
                            }
                        }) + '\x00';

                        broadcastToBattle(kickBattle.name, playerKickedMsg);
                    }

                    response = JSON.stringify({
                        "t": "xt",
                        "b": {
                            "action": "xtRes",
                            "r": -1,
                            "o": {
                                "_cmd": "playerKickedOut",
                                "userRefId": kickedPlayer.id
                            }
                        }
                    }) + '\x00';
                } else {
                    response = JSON.stringify({
                        "t": "xt",
                        "b": {
                            "action": "xtRes",
                            "r": -1,
                            "o": {
                                "_cmd": "gameError"
                            }
                        }
                    }) + '\x00';
                }
            } else {
                response = JSON.stringify({
                    "t": "xt",
                    "b": {
                        "action": "xtRes",
                        "r": -1,
                        "o": {
                            "_cmd": "gameError"
                        }
                    }
                }) + '\x00';
            }
            break;

        case 'setReady':
            console.log(`[GAMEXT_LOG] setReady command called by user ${socket.userId} (${socket.userName})`, params);
            // Set player ready state
            const readyBattle = socket.activeBattle ? battleRooms[socket.activeBattle] : null;

            if (readyBattle) {
                const playerIndex = readyBattle.players.findIndex(p => p.id === socket.playerId);
                if (playerIndex !== -1) {
                    readyBattle.players[playerIndex].ready = true;
                    console.log(`[GAMEXT_LOG] setReady - user ${socket.userId} marked as ready in battle ${readyBattle.name}`);

                    // Check if all players are ready
                    const allReady = readyBattle.players.every(p => p.ready);

                    if (allReady && readyBattle.players.length >= 2) {
                        // Start the game if all players are ready
                        readyBattle.gameState = 'in_progress';
                        console.log(`[GAMEXT_LOG] setReady - all players ready, starting game in battle ${readyBattle.name}`);

                        // Set up turn order and ensure human players have default swarm if empty
                        readyBattle.turnOrder = [...readyBattle.players];
                        readyBattle.players.forEach((p, idx) => { ensureDefaultSwarmForPlayer(readyBattle, idx); });

                        // Send game started message to all players (include selectedSwarmIds)
                        // Manually construct response to ensure _cmd is always present
                        const playersJson = JSON.stringify(playersForClient(readyBattle));
                        const gameStartMsg = JSON.stringify({
                            "t": "xt",
                            "b": {
                                "action": "xtRes",
                                "r": -1,
                                "o": {
                                    "_cmd": "gameStarted",
                                    "battleName": readyBattle.name,
                                    "players": JSON.parse(playersJson),
                                    "gameCreator": readyBattle.creatorName
                                }
                            }
                        }) + '\x00';

                        broadcastToBattle(readyBattle.name, gameStartMsg);
                    }

                    response = JSON.stringify({
                        "t": "xt",
                        "b": {
                            "action": "xtRes",
                            "r": -1,
                            "o": {
                                "_cmd": "playerReady",
                                "userRefId": socket.playerId,
                                "ready": true
                            }
                        }
                    }) + '\x00';
                } else {
                    console.log(`[GAMEXT_LOG] setReady failed - user ${socket.userId} not found in battle ${socket.activeBattle}`);
                    response = JSON.stringify({
                        "t": "xt",
                        "b": {
                            "action": "xtRes",
                            "r": -1,
                            "o": {
                                "_cmd": "gameError"
                            }
                        }
                    }) + '\x00';
                }
            } else {
                console.log(`[GAMEXT_LOG] setReady failed - no active battle for user ${socket.userId}`);
                response = JSON.stringify({
                    "t": "xt",
                    "b": {
                        "action": "xtRes",
                        "r": -1,
                        "o": {
                            "_cmd": "gameError"
                        }
                    }
                }) + '\x00';
            }
            break;

        case 'getPlayerStatus':
            // Get status of players in battle
            const statusBattle = socket.activeBattle ? battleRooms[socket.activeBattle] : null;

            if (statusBattle) {
                const playerStatus = statusBattle.players.map(p => ({
                    userRefId: clientUserRefId(statusBattle, p),
                    username: p.name,
                    ready: p.ready,
                    nanovorSwarmSize: p.nanovorSwarm ? p.nanovorSwarm.length : 0,
                    selectedSwarmIds: Array.isArray(p.nanovorSwarm) ? p.nanovorSwarm : []
                }));

                response = JSON.stringify({
                    "t": "xt",
                    "b": {
                        "action": "xtRes",
                        "r": -1,
                        "o": {
                            "_cmd": "playerStatusList",
                            "players": playerStatus
                        }
                    }
                }) + '\x00';
            } else {
                response = JSON.stringify({
                    "t": "xt",
                    "b": {
                        "action": "xtRes",
                        "r": -1,
                        "o": {
                            "_cmd": "gameError"
                        }
                    }
                }) + '\x00';
            }
            break;

        case 'getBattleStatus':
            // Get current battle state
            const battleStatus = socket.activeBattle ? battleRooms[socket.activeBattle] : null;

            if (battleStatus) {
                response = JSON.stringify({
                    "t": "xt",
                    "b": {
                        "action": "xtRes",
                        "r": -1,
                        "o": {
                            "_cmd": "battleStatus",
                            "battleName": battleStatus.name,
                            "gameState": battleStatus.gameState,
                            "currentRound": battleStatus.round,
                            "playerCount": battleStatus.players.length
                        }
                    }
                }) + '\x00';
            } else {
                response = JSON.stringify({
                    "t": "xt",
                    "b": {
                        "action": "xtRes",
                        "r": -1,
                        "o": {
                            "_cmd": "gameError"
                        }
                    }
                }) + '\x00';
            }
            break;

        case 'performAttack':
            console.log(`[GAMEXT_LOG] performAttack command called by user ${socket.userId} (${socket.userName})`, params);
            // Perform an attack action
            const targetUserRefId = params.targetUserRefId;
            const attackNanovorId = params.nanovorId;
            const attackId = params.attackId;
            const performAttackBattle = socket.activeBattle ? battleRooms[socket.activeBattle] : null;

            if (performAttackBattle) {
                // Record the attack in battle history
                const attackRecord = {
                    attackerId: socket.playerId,
                    targetId: targetUserRefId,
                    nanovorId: attackNanovorId,
                    attackId: attackId,
                    timestamp: Date.now()
                };

                performAttackBattle.battleHistory.push(attackRecord);
                console.log(`[GAMEXT_LOG] performAttack recorded - ${socket.userId} attacked ${targetUserRefId} with nanovor ${attackNanovorId}, attackId: ${attackId}`);

                // Send attack notification to all players
                const attackMsg = JSON.stringify({
                    "t": "xt",
                    "b": {
                        "action": "xtRes",
                        "r": -1,
                        "o": {
                            "_cmd": "performAttack",
                            "attackResults": {
                                "attackerId": socket.playerId,
                                "targetId": targetUserRefId,
                                "nanovorId": attackNanovorId,
                                "attackId": attackId
                            }
                        }
                    }
                }) + '\x00';

                broadcastToBattle(performAttackBattle.name, attackMsg);

                response = JSON.stringify({
                    "t": "xt",
                    "b": {
                        "action": "xtRes",
                        "r": -1,
                        "o": {
                            "_cmd": "attackPerformed",
                            "attackId": attackId
                        }
                    }
                }) + '\x00';
                console.log(`[GAMEXT_LOG] performAttack completed successfully`);
            } else {
                console.log(`[GAMEXT_LOG] performAttack failed - no active battle for user ${socket.userId}`);
                response = JSON.stringify({
                    "t": "xt",
                    "b": {
                        "action": "xtRes",
                        "r": -1,
                        "o": {
                            "_cmd": "gameError"
                        }
                    }
                }) + '\x00';
            }
            break;

        case 'swapNanovor':
            // Swap active nanovor during battle
            const newNanovorId = params.newNanovorId;
            const swapNanovorBattle = socket.activeBattle ? battleRooms[socket.activeBattle] : null;

            if (swapNanovorBattle) {
                const playerIndex = swapNanovorBattle.players.findIndex(p => p.id === socket.playerId);
                if (playerIndex !== -1) {
                    // Update the selected nanovor
                    swapNanovorBattle.players[playerIndex].selectedNanovor = newNanovorId;

                    // Notify all players about the swap
                    const swapMsg = JSON.stringify({
                        "t": "xt",
                        "b": {
                            "action": "xtRes",
                            "r": -1,
                            "o": {
                                "_cmd": "swapNanovor",
                                "userRefId": socket.playerId,
                                "newNanovorId": newNanovorId
                            }
                        }
                    }) + '\x00';

                    broadcastToBattle(swapNanovorBattle.name, swapMsg);

                    response = JSON.stringify({
                        "t": "xt",
                        "b": {
                            "action": "xtRes",
                            "r": -1,
                            "o": {
                                "_cmd": "nanovorSwapped",
                                "newNanovorId": newNanovorId
                            }
                        }
                    }) + '\x00';
                } else {
                    response = JSON.stringify({
                        "t": "xt",
                        "b": {
                            "action": "xtRes",
                            "r": -1,
                            "o": {
                                "_cmd": "gameError"
                            }
                        }
                    }) + '\x00';
                }
            } else {
                response = JSON.stringify({
                    "t": "xt",
                    "b": {
                        "action": "xtRes",
                        "r": -1,
                        "o": {
                            "_cmd": "gameError"
                        }
                    }
                }) + '\x00';
            }
            break;

        case 'killNanovor':
            // Mark a nanovor as defeated
            const killedNanovorId = params.nanovorId;
            const killerId = params.killerId;
            const killBattle = socket.activeBattle ? battleRooms[socket.activeBattle] : null;

            if (killBattle) {
                // Notify all players about the nanovor death
                const killMsg = JSON.stringify({
                    "t": "xt",
                    "b": {
                        "action": "xtRes",
                        "r": -1,
                        "o": {
                            "_cmd": "killNanovor",
                            "nanovorId": killedNanovorId,
                            "killerId": killerId
                        }
                    }
                }) + '\x00';

                broadcastToBattle(killBattle.name, killMsg);

                response = JSON.stringify({
                    "t": "xt",
                    "b": {
                        "action": "xtRes",
                        "r": -1,
                        "o": {
                            "_cmd": "nanovorKilled",
                            "nanovorId": killedNanovorId
                        }
                    }
                }) + '\x00';
            } else {
                response = JSON.stringify({
                    "t": "xt",
                    "b": {
                        "action": "xtRes",
                        "r": -1,
                        "o": {
                            "_cmd": "gameError"
                        }
                    }
                }) + '\x00';
            }
            break;

        case 'blockSwap':
            // Block nanovor swapping
            const blockerId = params.blockerId;
            const blockBattle = socket.activeBattle ? battleRooms[socket.activeBattle] : null;

            if (blockBattle) {
                // Notify all players about the swap block
                const blockMsg = JSON.stringify({
                    "t": "xt",
                    "b": {
                        "action": "xtRes",
                        "r": -1,
                        "o": {
                            "_cmd": "blockSwap",
                            "blockerId": blockerId
                        }
                    }
                }) + '\x00';

                broadcastToBattle(blockBattle.name, blockMsg);

                response = JSON.stringify({
                    "t": "xt",
                    "b": {
                        "action": "xtRes",
                        "r": -1,
                        "o": {
                            "_cmd": "swapBlocked",
                            "blockerId": blockerId
                        }
                    }
                }) + '\x00';
            } else {
                response = JSON.stringify({
                    "t": "xt",
                    "b": {
                        "action": "xtRes",
                        "r": -1,
                        "o": {
                            "_cmd": "gameError"
                        }
                    }
                }) + '\x00';
            }
            break;

        case 'selectNanovor':
            // Select a nanovor for battle
            const selectNanovorId = params.nanovorId;
            const selectBattle = socket.activeBattle ? battleRooms[socket.activeBattle] : null;

            if (selectBattle) {
                const playerIndex = selectBattle.players.findIndex(p => p.id === socket.playerId);
                if (playerIndex !== -1) {
                    selectBattle.players[playerIndex].selectedNanovor = selectNanovorId;

                    // Notify all players about the selection
                    const selectMsg = JSON.stringify({
                        "t": "xt",
                        "b": {
                            "action": "xtRes",
                            "r": -1,
                            "o": {
                                "_cmd": "selectNanovor",
                                "userRefId": socket.playerId,
                                "nanovorId": selectNanovorId
                            }
                        }
                    }) + '\x00';

                    broadcastToBattle(selectBattle.name, selectMsg);

                    response = JSON.stringify({
                        "t": "xt",
                        "b": {
                            "action": "xtRes",
                            "r": -1,
                            "o": {
                                "_cmd": "nanovorSelected",
                                "nanovorId": selectNanovorId
                            }
                        }
                    }) + '\x00';
                } else {
                    response = JSON.stringify({
                        "t": "xt",
                        "b": {
                            "action": "xtRes",
                            "r": -1,
                            "o": {
                                "_cmd": "gameError"
                            }
                        }
                    }) + '\x00';
                }
            } else {
                response = JSON.stringify({
                    "t": "xt",
                    "b": {
                        "action": "xtRes",
                        "r": -1,
                        "o": {
                            "_cmd": "gameError"
                        }
                    }
                }) + '\x00';
            }
            break;

        case 'setRoundInfo':
            // Set round information. Client RoundInfo constructor expects param1.players (not param1.roundInfo.players).
            const roundInfo = params.roundInfo;
            const roundInfoBattle = socket.activeBattle ? battleRooms[socket.activeBattle] : null;

            if (roundInfoBattle) {
                // Update round info in battle
                roundInfoBattle.currentRoundInfo = roundInfo;

                // Client expects { _cmd, players, roundCounter } at top level so RoundInfo(param1) sees param1.players
                const setRoundPayload = Object.assign({ _cmd: 'setRoundInfo' }, roundInfo);
                const roundInfoMsg = JSON.stringify({
                    "t": "xt",
                    "b": {
                        "action": "xtRes",
                        "r": -1,
                        "o": setRoundPayload
                    }
                }) + '\x00';

                broadcastToBattle(roundInfoBattle.name, roundInfoMsg);

                // Construct response properly to avoid JSON injection issues
                const roundInfoResponse = {
                    "_cmd": "roundInfoSet",
                    "round": roundInfoBattle.round
                };
                response = JSON.stringify({
                    "t": "xt",
                    "b": {
                        "action": "xtRes",
                        "r": -1,
                        "o": roundInfoResponse
                    }
                }) + '\x00';
            } else {
                response = JSON.stringify({
                    "t": "xt",
                    "b": {
                        "action": "xtRes",
                        "r": -1,
                        "o": {
                            "_cmd": "gameError"
                        }
                    }
                }) + '\x00';
            }
            break;

        case 'showGameResults':
            // Show game results
            const gameResults = params.results;
            const resultsBattle = socket.activeBattle ? battleRooms[socket.activeBattle] : null;

            if (resultsBattle) {
                // Notify all players about the game results
                const resultsMsg = JSON.stringify({
                    "t": "xt",
                    "b": {
                        "action": "xtRes",
                        "r": -1,
                        "o": {
                            "_cmd": "showGameResults",
                            "results": gameResults
                        }
                    }
                }) + '\x00';

                broadcastToBattle(resultsBattle.name, resultsMsg);

                response = JSON.stringify({
                    "t": "xt",
                    "b": {
                        "action": "xtRes",
                        "r": -1,
                        "o": {
                            "_cmd": "gameResultsShown",
                            "battleName": resultsBattle.name
                        }
                    }
                }) + '\x00';
            } else {
                response = JSON.stringify({
                    "t": "xt",
                    "b": {
                        "action": "xtRes",
                        "r": -1,
                        "o": {
                            "_cmd": "gameError"
                        }
                    }
                }) + '\x00';
            }
            break;

        case 'gameQuit':
            console.log(`[GAMEXT_LOG] gameQuit command called by user ${socket.userId} (${socket.userName})`, params);
            // Quit the game
            const gameQuitBattle = socket.activeBattle ? battleRooms[socket.activeBattle] : null;

            if (gameQuitBattle) {
                // Remove player from the battle
                gameQuitBattle.players = gameQuitBattle.players.filter(p => p.id !== socket.playerId);
                console.log(`[GAMEXT_LOG] gameQuit - user ${socket.userId} removed from battle ${gameQuitBattle.name}, ${gameQuitBattle.players.length} players remaining`);

                // If there's only one player left, end the game
                if (gameQuitBattle.players.length <= 1) {
                    gameQuitBattle.gameState = 'finished';
                    console.log(`[GAMEXT_LOG] gameQuit - only ${gameQuitBattle.players.length} player left, ending game`);

                    // Notify remaining players that the game is over
                    const gameOverMsg = JSON.stringify({
                        "t": "xt",
                        "b": {
                            "action": "xtRes",
                            "r": -1,
                            "o": {
                                "_cmd": "gameOver",
                                "winnerId": gameQuitBattle.players[0]?.id || '',
                                "results": "Game ended due to player quit"
                            }
                        }
                    }) + '\x00';

                    broadcastToBattle(gameQuitBattle.name, gameOverMsg);
                } else {
                    // Notify other players that someone quit
                    const playerQuitMsg = JSON.stringify({
                        "t": "xt",
                        "b": {
                            "action": "xtRes",
                            "r": -1,
                            "o": {
                                "_cmd": "playerQuitGame",
                                "userRefId": socket.playerId,
                                "username": users[socket.userId]?.username || 'Unknown'
                            }
                        }
                    }) + '\x00';
                    console.log(`[GAMEXT_LOG] gameQuit - notifying other players about user ${socket.userId} quitting`);

                    broadcastToBattle(gameQuitBattle.name, playerQuitMsg);
                }

                // Clear the active battle for the socket
                socket.activeBattle = null;

                // Update user's status to "online" and notify their buddies
                updateUserStatus(socket.playerId, 'online');

                response = JSON.stringify({
                    "t": "xt",
                    "b": {
                        "action": "xtRes",
                        "r": -1,
                        "o": {
                            "_cmd": "gameQuitConfirmed",
                            "userRefId": socket.playerId
                        }
                    }
                }) + '\x00';
                console.log(`[GAMEXT_LOG] gameQuit completed for user ${socket.userId}`);
            } else {
                console.log(`[GAMEXT_LOG] gameQuit failed - no active battle for user ${socket.userId}`);
                response = JSON.stringify({
                    "t": "xt",
                    "b": {
                        "action": "xtRes",
                        "r": -1,
                        "o": {
                            "_cmd": "gameError"
                        }
                    }
                }) + '\x00';
            }
            break;

        case 'playerJoinAutoBattle':
            // Join an auto battle (sensei/tutorial: Training = -5, human = 0 in client payload)
            const autoBattleName = params.battleName;
            const gameCreator = params.gameCreator;
            let gameCreatorId = params.gameCreatorId;
            if (gameCreatorId === undefined || gameCreatorId === null) {
                if (autoBattleName === 'Training') gameCreatorId = '-5';
                else if (autoBattleName === 'Medium') gameCreatorId = '-4';
                else if (autoBattleName === 'Easy') gameCreatorId = '-3';
                else gameCreatorId = '-5';
            }
            gameCreatorId = String(gameCreatorId);

            // Create or join the auto battle
            if (!battleRooms[autoBattleName]) {
                battleRooms[autoBattleName] = {
                    id: state.battleIdCounter++,
                    name: autoBattleName,
                    gameSwarmValue: 1000, // Default value
                    maxPlayers: 2,
                    players: [{
                        id: gameCreatorId,
                        name: gameCreator || autoBattleName,
                        ready: true,
                        nanovorSwarm: [],
                        selectedNanovor: null,
                        enemyTarget: null
                    }, {
                        id: socket.playerId,
                        name: socket.userName,
                        ready: true,
                        nanovorSwarm: [],
                        selectedNanovor: null,
                        enemyTarget: null
                    }],
                    creator: gameCreatorId,
                    creatorName: gameCreator || autoBattleName,
                    gameState: 'in_progress',
                    turnOrder: [],
                    currentTurn: 0,
                    round: 1,
                    battleHistory: []
                };
            } else {
                // Add player to existing auto battle if there's space
                const existingAutoBattle = battleRooms[autoBattleName];
                if (existingAutoBattle.players.length < existingAutoBattle.maxPlayers) {
                    existingAutoBattle.players.push({
                        id: socket.playerId,
                        name: socket.userName,
                        ready: true,
                        nanovorSwarm: [],
                        selectedNanovor: null,
                        enemyTarget: null
                    });
                }
            }

            // Update socket's active battle
            socket.activeBattle = autoBattleName;

            // Update user's status to "in battle" and notify their buddies
            updateUserStatus(socket.userId, 'in battle');

            // Set up turn order and start the game; ensure human players have default swarm
            const finalAutoBattle = battleRooms[autoBattleName];
            finalAutoBattle.turnOrder = [...finalAutoBattle.players];
            finalAutoBattle.gameState = 'in_progress';
            finalAutoBattle.players.forEach((p, idx) => { ensureDefaultSwarmForPlayer(finalAutoBattle, idx); });

            const senseiBattle = isSenseiBattle(finalAutoBattle);
            const playersJson = JSON.stringify(playersForClient(finalAutoBattle));

            // Client expects playerJoinAutoBattle BEFORE gameStarted: battleStarted() uses _battleName and _gameCreator set by playerJoinAutoBattle(). Send in that order.
            const humanPlayer = finalAutoBattle.players.find(p => p.id === socket.playerId);
            const joinUserRefId = humanPlayer ? clientUserRefId(finalAutoBattle, humanPlayer) : String(socket.playerId);

            // Construct JSON objects properly to avoid injection issues
            const joinAutoResponse = {
                "_cmd": "playerJoinAutoBattle",
                "battleName": autoBattleName,
                "username": socket.userName,
                "userRefId": joinUserRefId,
                "gameCreator": gameCreator,
                "gameCreatorId": gameCreatorId
            };
            if (senseiBattle) {
                joinAutoResponse.isSenseiBattle = true;
            }
            const joinAutoMsg = JSON.stringify({
                "t": "xt",
                "b": {
                    "action": "xtRes",
                    "r": -1,
                    "o": joinAutoResponse
                }
            }) + '\x00';
            broadcastToBattle(autoBattleName, joinAutoMsg);

            console.log(`[GAMEXT_LOG] gameStarted players (joinUserRefId=${joinUserRefId}):`, playersJson);

            // Construct game start response properly
            const gameStartResponse = {
                "_cmd": "gameStarted",
                "battleName": autoBattleName,
                "players": JSON.parse(playersJson), // Convert back to object to ensure proper structure
                "gameCreator": finalAutoBattle.creatorName
            };
            if (senseiBattle) {
                gameStartResponse.isSenseiBattle = true;
            }
            const gameStartMsg = JSON.stringify({
                "t": "xt",
                "b": {
                    "action": "xtRes",
                    "r": -1,
                    "o": gameStartResponse
                }
            }) + '\x00';
            broadcastToBattle(autoBattleName, gameStartMsg);

            // Response: joinedAutoBattle so client does not get gameStarted twice. Client gets both from broadcast in correct order.
            const joinedAutoResponse = {
                "_cmd": "joinedAutoBattle",
                "battleName": autoBattleName,
                "gameCreator": gameCreator,
                "gameCreatorId": gameCreatorId
            };
            if (senseiBattle) {
                joinedAutoResponse.isSenseiBattle = true;
            }
            response = JSON.stringify({
                "t": "xt",
                "b": {
                    "action": "xtRes",
                    "r": -1,
                    "o": joinedAutoResponse
                }
            }) + '\x00';
            break;

        case 'allPlayersReady':
            // Signal all players are ready
            const readyCheckBattle = socket.activeBattle ? battleRooms[socket.activeBattle] : null;

            if (readyCheckBattle) {
                // Check if all players are ready
                const allPlayersReady = readyCheckBattle.players.every(p => p.ready);

                if (allPlayersReady) {
                    // Start the game if all players are ready
                    readyCheckBattle.gameState = 'in_progress';

                    // Set up turn order and ensure default swarm for humans
                    readyCheckBattle.turnOrder = [...readyCheckBattle.players];
                    readyCheckBattle.players.forEach((p, idx) => { ensureDefaultSwarmForPlayer(readyCheckBattle, idx); });

                    const senseiBattle = isSenseiBattle(readyCheckBattle);
                    const readyPlayersJson = JSON.stringify(playersForClient(readyCheckBattle));
                    console.log(`[GAMEXT_LOG] allPlayersReady gameStarted players:`, readyPlayersJson);
                    
                    const gameStartMsgData = {
                        "_cmd": "gameStarted",
                        "battleName": readyCheckBattle.name,
                        "players": JSON.parse(readyPlayersJson),
                        "gameCreator": readyCheckBattle.creatorName
                    };
                    if (senseiBattle) {
                        gameStartMsgData.isSenseiBattle = true;
                    }
                    
                    const gameStartMsg = JSON.stringify({
                        "t": "xt",
                        "b": {
                            "action": "xtRes",
                            "r": -1,
                            "o": gameStartMsgData
                        }
                    }) + '\x00';

                    broadcastToBattle(readyCheckBattle.name, gameStartMsg);

                    response = JSON.stringify({
                        "t": "xt",
                        "b": {
                            "action": "xtRes",
                            "r": -1,
                            "o": {
                                "_cmd": "allPlayersReady",
                                "battleStarted": true
                            }
                        }
                    }) + '\x00';
                } else {
                    response = JSON.stringify({
                        "t": "xt",
                        "b": {
                            "action": "xtRes",
                            "r": -1,
                            "o": {
                                "_cmd": "allPlayersReady",
                                "battleStarted": false
                            }
                        }
                    }) + '\x00';
                }
            } else {
                response = JSON.stringify({
                    "t": "xt",
                    "b": {
                        "action": "xtRes",
                        "r": -1,
                        "o": {
                            "_cmd": "gameError"
                        }
                    }
                }) + '\x00';
            }
            break;

        case 'waitingForPlayers':
            // Indicate waiting for players state
            const waitingBattle = socket.activeBattle ? battleRooms[socket.activeBattle] : null;

            if (waitingBattle) {
                waitingBattle.gameState = 'waiting_for_players';

                // Notify all players that we're waiting for more players
                const waitingMsg = JSON.stringify({
                    "t": "xt",
                    "b": {
                        "action": "xtRes",
                        "r": -1,
                        "o": {
                            "_cmd": "waitingForPlayers",
                            "battleName": waitingBattle.name,
                            "currentPlayers": waitingBattle.players.length,
                            "maxPlayers": waitingBattle.maxPlayers
                        }
                    }
                }) + '\x00';

                broadcastToBattle(waitingBattle.name, waitingMsg);

                response = JSON.stringify({
                    "t": "xt",
                    "b": {
                        "action": "xtRes",
                        "r": -1,
                        "o": {
                            "_cmd": "waitingForPlayers",
                            "battleName": waitingBattle.name,
                            "currentPlayers": waitingBattle.players.length
                        }
                    }
                }) + '\x00';
            } else {
                response = JSON.stringify({
                    "t": "xt",
                    "b": {
                        "action": "xtRes",
                        "r": -1,
                        "o": {
                            "_cmd": "gameError"
                        }
                    }
                }) + '\x00';
            }
            break;

        case 'gameStarted':
            // Confirm game has started
            const startedBattle = socket.activeBattle ? battleRooms[socket.activeBattle] : null;

            if (startedBattle) {
                startedBattle.gameState = 'in_progress';

                // Set up turn order and ensure default swarm for humans
                startedBattle.turnOrder = [...startedBattle.players];
                startedBattle.players.forEach((p, idx) => { ensureDefaultSwarmForPlayer(startedBattle, idx); });

                // Send game started message to all players (include selectedSwarmIds)
                // Construct game start response properly to avoid JSON injection issues
                const gameStartResponse = {
                    "_cmd": "gameStarted",
                    "battleName": startedBattle.name,
                    "players": playersForClient(startedBattle),
                    "gameCreator": startedBattle.creatorName
                };
                if (isSenseiBattle(startedBattle)) {
                    gameStartResponse.isSenseiBattle = true;
                }
                const gameStartMsg = JSON.stringify({
                    "t": "xt",
                    "b": {
                        "action": "xtRes",
                        "r": -1,
                        "o": gameStartResponse
                    }
                }) + '\x00';

                broadcastToBattle(startedBattle.name, gameStartMsg);

                // Manually construct response to ensure _cmd is always present
                const playersJson = JSON.stringify(playersForClient(startedBattle));
                const responseObj = {
                    "_cmd": "gameStarted",
                    "battleName": startedBattle.name,
                    "players": JSON.parse(playersJson)
                };
                if (isSenseiBattle(startedBattle)) {
                    responseObj.isSenseiBattle = true;
                }
                response = JSON.stringify({
                    "t": "xt",
                    "b": {
                        "action": "xtRes",
                        "r": -1,
                        "o": responseObj
                    }
                }) + '\x00';
            } else {
                response = JSON.stringify({
                    "t": "xt",
                    "b": {
                        "action": "xtRes",
                        "r": -1,
                        "o": {
                            "_cmd": "gameError"
                        }
                    }
                }) + '\x00';
            }
            break;

        case 'gameSwarmValueSet':
            // Confirm swarm value is set
            const swarmValue = params.gameSwarmValue;
            const swarmValueBattle = socket.activeBattle ? battleRooms[socket.activeBattle] : null;

            if (swarmValueBattle) {
                swarmValueBattle.gameSwarmValue = swarmValue;

                // Notify other players of the change
                const swarmValueSetMsg = JSON.stringify({
                    "t": "xt",
                    "b": {
                        "action": "xtRes",
                        "r": -1,
                        "o": {
                            "_cmd": "gameSwarmValueSet",
                            "battleName": swarmValueBattle.name,
                            "gameSwarmValue": swarmValue
                        }
                    }
                }) + '\x00';

                broadcastToBattle(swarmValueBattle.name, swarmValueSetMsg, socket.playerId);

                response = JSON.stringify({
                    "t": "xt",
                    "b": {
                        "action": "xtRes",
                        "r": -1,
                        "o": {
                            "_cmd": "gameSwarmValueSet",
                            "battleName": swarmValueBattle.name,
                            "gameSwarmValue": swarmValue
                        }
                    }
                }) + '\x00';
            } else {
                response = JSON.stringify({
                    "t": "xt",
                    "b": {
                        "action": "xtRes",
                        "r": -1,
                        "o": {
                            "_cmd": "gameError"
                        }
                    }
                }) + '\x00';
            }
            break;

        case 'swarmSelected':
            // Confirm swarm selection
            const swarmCount = params.swarmCount;
            const username = params.username;
            const userRefId = params.userRefId;
            const swarmSelectBattle = socket.activeBattle ? battleRooms[socket.activeBattle] : null;

            if (swarmSelectBattle) {
                // Notify other players that this player has set their swarm
                const swarmSelectedMsg = JSON.stringify({
                    "t": "xt",
                    "b": {
                        "action": "xtRes",
                        "r": -1,
                        "o": {
                            "_cmd": "swarmSelected",
                            "battleName": swarmSelectBattle.name,
                            "swarmCount": swarmCount,
                            "username": username,
                            "userRefId": userRefId
                        }
                    }
                }) + '\x00';

                broadcastToBattle(swarmSelectBattle.name, swarmSelectedMsg, socket.playerId);

                response = JSON.stringify({
                    "t": "xt",
                    "b": {
                        "action": "xtRes",
                        "r": -1,
                        "o": {
                            "_cmd": "swarmSelected",
                            "battleName": swarmSelectBattle.name,
                            "swarmCount": swarmCount,
                            "username": username,
                            "userRefId": userRefId
                        }
                    }
                }) + '\x00';
            } else {
                response = JSON.stringify({
                    "t": "xt",
                    "b": {
                        "action": "xtRes",
                        "r": -1,
                        "o": {
                            "_cmd": "gameError"
                        }
                    }
                }) + '\x00';
            }
            break;

        case 'targetSelected':
            // Confirm target selection
            const userRefIdTarget = params.userRefId;
            const selectedTargetUserRefId = params.targetUserRefId;
            const attackIdTarget = params.attackId;
            const targetSelectBattle = socket.activeBattle ? battleRooms[socket.activeBattle] : null;

            if (targetSelectBattle) {
                // Find the player who selected the target
                const playerIndex = targetSelectBattle.players.findIndex(p => p.id === userRefIdTarget);
                if (playerIndex !== -1) {
                    targetSelectBattle.players[playerIndex].enemyTarget = selectedTargetUserRefId;
                }

                // Send target selected notification to all players
                const targetSelectedMsg = JSON.stringify({
                    "t": "xt",
                    "b": {
                        "action": "xtRes",
                        "r": -1,
                        "o": {
                            "_cmd": "targetSelected",
                            "userRefId": userRefIdTarget,
                            "targetUserRefId": selectedTargetUserRefId,
                            "attackId": attackIdTarget
                        }
                    }
                }) + '\x00';

                broadcastToBattle(targetSelectBattle.name, targetSelectedMsg);

                response = JSON.stringify({
                    "t": "xt",
                    "b": {
                        "action": "xtRes",
                        "r": -1,
                        "o": {
                            "_cmd": "targetSelected",
                            "userRefId": userRefIdTarget,
                            "targetUserRefId": selectedTargetUserRefId,
                            "attackId": attackIdTarget
                        }
                    }
                }) + '\x00';
            } else {
                response = JSON.stringify({
                    "t": "xt",
                    "b": {
                        "action": "xtRes",
                        "r": -1,
                        "o": {
                            "_cmd": "gameError"
                        }
                    }
                }) + '\x00';
            }
            break;

        case 'readyForTurn':
            // Signal player is ready for turn
            const nanovorIdTurn = params.nanovorId;
            const isDead = params.isDead;
            const turnBattle = socket.activeBattle ? battleRooms[socket.activeBattle] : null;

            if (turnBattle) {
                // Send ready for turn notification to the player
                const readyForTurnMsg = JSON.stringify({
                    "t": "xt",
                    "b": {
                        "action": "xtRes",
                        "r": -1,
                        "o": {
                            "_cmd": "readyForTurn",
                            "battleName": turnBattle.name,
                            "nanovorId": nanovorIdTurn,
                            "isDead": isDead
                        }
                    }
                }) + '\x00';

                socket.write(readyForTurnMsg);

                response = JSON.stringify({
                    "t": "xt",
                    "b": {
                        "action": "xtRes",
                        "r": -1,
                        "o": {
                            "_cmd": "readyForTurn",
                            "battleName": turnBattle.name,
                            "nanovorId": nanovorIdTurn,
                            "isDead": isDead
                        }
                    }
                }) + '\x00';
            } else {
                response = JSON.stringify({
                    "t": "xt",
                    "b": {
                        "action": "xtRes",
                        "r": -1,
                        "o": {
                            "_cmd": "gameError"
                        }
                    }
                }) + '\x00';
            }
            break;

        case 'roundCompleted':
            // Report round completion
            const roundNum = params.round;
            const roundCompleteBattle = socket.activeBattle ? battleRooms[socket.activeBattle] : null;

            if (roundCompleteBattle) {
                // Increment round number
                roundCompleteBattle.round = roundNum || roundCompleteBattle.round + 1;

                // Reset turn counter for the new round
                roundCompleteBattle.currentTurn = 0;

                // Send round completed notification to all players
                const roundCompleteMsg = JSON.stringify({
                    "t": "xt",
                    "b": {
                        "action": "xtRes",
                        "r": -1,
                        "o": {
                            "_cmd": "roundCompleted",
                            "round": roundCompleteBattle.round
                        }
                    }
                }) + '\x00';

                broadcastToBattle(roundCompleteBattle.name, roundCompleteMsg);

                response = JSON.stringify({
                    "t": "xt",
                    "b": {
                        "action": "xtRes",
                        "r": -1,
                        "o": {
                            "_cmd": "roundCompleted",
                            "round": roundCompleteBattle.round
                        }
                    }
                }) + '\x00';
            } else {
                response = JSON.stringify({
                    "t": "xt",
                    "b": {
                        "action": "xtRes",
                        "r": -1,
                        "o": {
                            "_cmd": "gameError"
                        }
                    }
                }) + '\x00';
            }
            break;

        case 'playerQuitGame':
            // Report player quit
            const quitUserId = params.userRefId;
            const quitUsername = params.username;
            const quitGameBattle = socket.activeBattle ? battleRooms[socket.activeBattle] : null;

            if (quitGameBattle) {
                // Remove player from the battle
                quitGameBattle.players = quitGameBattle.players.filter(p => p.id !== quitUserId);

                // If there's only one player left, end the game
                if (quitGameBattle.players.length <= 1) {
                    quitGameBattle.gameState = 'finished';

                    // Notify remaining players that the game is over
                    const gameOverMsg = JSON.stringify({
                        "t": "xt",
                        "b": {
                            "action": "xtRes",
                            "r": -1,
                            "o": {
                                "_cmd": "gameOver",
                                "winnerId": quitGameBattle.players[0]?.id || '',
                                "results": "Game ended due to player quit"
                            }
                        }
                    }) + '\x00';

                    broadcastToBattle(quitGameBattle.name, gameOverMsg);
                } else {
                    // Notify other players that someone quit
                    const playerQuitMsg = JSON.stringify({
                        "t": "xt",
                        "b": {
                            "action": "xtRes",
                            "r": -1,
                            "o": {
                                "_cmd": "playerQuitGame",
                                "userRefId": quitUserId,
                                "username": quitUsername
                            }
                        }
                    }) + '\x00';

                    broadcastToBattle(quitGameBattle.name, playerQuitMsg);
                }

                response = JSON.stringify({
                    "t": "xt",
                    "b": {
                        "action": "xtRes",
                        "r": -1,
                        "o": {
                            "_cmd": "playerQuitConfirmed",
                            "userRefId": quitUserId,
                            "username": quitUsername
                        }
                    }
                }) + '\x00';
            } else {
                response = JSON.stringify({
                    "t": "xt",
                    "b": {
                        "action": "xtRes",
                        "r": -1,
                        "o": {
                            "_cmd": "gameError"
                        }
                    }
                }) + '\x00';
            }
            break;

        case 'gameOver':
            console.log(`[GAMEXT_LOG] gameOver command called by user ${socket.userId} (${socket.userName})`, params);
            // Report game over
            const winnerId = params.winnerId;
            const results = params.results;
            const gameOverBattle = socket.activeBattle ? battleRooms[socket.activeBattle] : null;

            if (gameOverBattle) {
                gameOverBattle.gameState = 'finished';
                console.log(`[GAMEXT_LOG] gameOver - battle ${gameOverBattle.name} finished, winner: ${winnerId}, results: ${results}`);

                // Notify all players that the game is over
                const gameOverMsg = JSON.stringify({
                    "t": "xt",
                    "b": {
                        "action": "xtRes",
                        "r": -1,
                        "o": {
                            "_cmd": "gameOver",
                            "winnerId": winnerId,
                            "results": results
                        }
                    }
                }) + '\x00';

                broadcastToBattle(gameOverBattle.name, gameOverMsg);

                // Update user stats based on game results
                if (users[winnerId]) {
                    users[winnerId].gamesWon = (users[winnerId].gamesWon || 0) + 1;
                    users[winnerId].gamesPlayed = (users[winnerId].gamesPlayed || 0) + 1;
                    console.log(`[GAMEXT_LOG] gameOver - updated stats for winner ${winnerId}: wins=${users[winnerId].gamesWon}, games=${users[winnerId].gamesPlayed}`);

                    // Save user data after updating stats
                    saveUserData(winnerId);
                }

                // Clean up the battle room
                delete battleRooms[gameOverBattle.name];
                console.log(`[GAMEXT_LOG] gameOver - cleaned up battle room ${gameOverBattle.name}`);

                // Update user's status to "online" and notify their buddies
                if (socket.userId) {
                    updateUserStatus(socket.userId, 'online');
                }

                response = JSON.stringify({
                    "t": "xt",
                    "b": {
                        "action": "xtRes",
                        "r": -1,
                        "o": {
                            "_cmd": "gameOver",
                            "winnerId": winnerId,
                            "results": results
                        }
                    }
                }) + '\x00';
            } else {
                console.log(`[GAMEXT_LOG] gameOver failed - no active battle for user ${socket.userId}`);
                response = JSON.stringify({
                    "t": "xt",
                    "b": {
                        "action": "xtRes",
                        "r": -1,
                        "o": {
                            "_cmd": "gameError"
                        }
                    }
                }) + '\x00';
            }
            break;

        case 'roomDestroyed':
            // Report room destroyed
            const roomName = params.roomName;
            const destroyBattle = roomName ? battleRooms[roomName] : null;

            if (destroyBattle) {
                // Notify all players in the battle that the room is destroyed
                const roomDestroyMsg = JSON.stringify({
                    "t": "xt",
                    "b": {
                        "action": "xtRes",
                        "r": -1,
                        "o": {
                            "_cmd": "roomDestroyed"
                        }
                    }
                }) + '\x00';

                broadcastToBattle(roomName, roomDestroyMsg);

                // Clean up the battle room
                delete battleRooms[roomName];

                response = JSON.stringify({
                    "t": "xt",
                    "b": {
                        "action": "xtRes",
                        "r": -1,
                        "o": {
                            "_cmd": "roomDestroyed",
                            "roomName": roomName
                        }
                    }
                }) + '\x00';
            } else {
                response = JSON.stringify({
                    "t": "xt",
                    "b": {
                        "action": "xtRes",
                        "r": -1,
                        "o": {
                            "_cmd": "gameError"
                        }
                    }
                }) + '\x00';
            }
            break;

        case 'joinGameError':
            // Send join game error response
            response = JSON.stringify({
                "t": "xt",
                "b": {
                    "action": "xtRes",
                    "r": -1,
                    "o": {
                        "_cmd": "joinGameError",
                        "errorMessage": "Unable to join game"
                    }
                }
            }) + '\x00';
            break;

        case 'selectedNanovorError':
            // Send selected nanovor error response
            response = JSON.stringify({
                "t": "xt",
                "b": {
                    "action": "xtRes",
                    "r": -1,
                    "o": {
                        "_cmd": "selectedNanovorError",
                        "errorMessage": "Error selecting nanovor"
                    }
                }
            }) + '\x00';
            break;

        case 'systemError':
            // Send system error response
            response = JSON.stringify({
                "t": "xt",
                "b": {
                    "action": "xtRes",
                    "r": -1,
                    "o": {
                        "_cmd": "systemError",
                        "errorMessage": "System error occurred"
                    }
                }
            }) + '\x00';
            break;

        case 'allPlayersReady':
            // Send all players ready notification
            const allReadyBattle = socket.activeBattle ? battleRooms[socket.activeBattle] : null;
            
            if (allReadyBattle) {
                const allReadyMsg = JSON.stringify({
                    "t": "xt",
                    "b": {
                        "action": "xtRes",
                        "r": -1,
                        "o": {
                            "_cmd": "allPlayersReady",
                            "battleName": allReadyBattle.name
                        }
                    }
                }) + '\x00';
                
                broadcastToBattle(allReadyBattle.name, allReadyMsg);
                
                response = JSON.stringify({
                    "t": "xt",
                    "b": {
                        "action": "xtRes",
                        "r": -1,
                        "o": {
                            "_cmd": "allPlayersReady",
                            "battleName": allReadyBattle.name
                        }
                    }
                }) + '\x00';
            } else {
                response = JSON.stringify({
                    "t": "xt",
                    "b": {
                        "action": "xtRes",
                        "r": -1,
                        "o": {
                            "_cmd": "gameError"
                        }
                    }
                }) + '\x00';
            }
            break;

        case 'setGameSwarmValueNotification':
            // Send game swarm value set notification (different from response)
            const swarmValueNotif = params.gameSwarmValue || 1000;
            const swarmNotifBattle = socket.activeBattle ? battleRooms[socket.activeBattle] : null;
            
            if (swarmNotifBattle) {
                const swarmNotifMsg = JSON.stringify({
                    "t": "xt",
                    "b": {
                        "action": "xtRes",
                        "r": -1,
                        "o": {
                            "_cmd": "setGameSwarmValue",
                            "battleName": swarmNotifBattle.name,
                            "gameSwarmValue": swarmValueNotif
                        }
                    }
                }) + '\x00';
                
                broadcastToBattle(swarmNotifBattle.name, swarmNotifMsg);
                
                response = JSON.stringify({
                    "t": "xt",
                    "b": {
                        "action": "xtRes",
                        "r": -1,
                        "o": {
                            "_cmd": "setGameSwarmValue",
                            "battleName": swarmNotifBattle.name,
                            "gameSwarmValue": swarmValueNotif
                        }
                    }
                }) + '\x00';
            } else {
                response = JSON.stringify({
                    "t": "xt",
                    "b": {
                        "action": "xtRes",
                        "r": -1,
                        "o": {
                            "_cmd": "gameError"
                        }
                    }
                }) + '\x00';
            }
            break;


        default:
            // Log invalid gameXt command
            debug.logInvalidRequest('gameXt', command, params, {
                remoteAddress: socket.remoteAddress,
                remotePort: socket.remotePort,
                userId: socket.userId,
                userName: socket.userName,
                playerId: socket.playerId
            });
            response = JSON.stringify({
                "t": "xt",
                "b": {
                    "action": "xtRes",
                    "r": -1,
                    "o": {
                        "_cmd": "unknownCommand"
                    }
                }
            }) + '\x00';
    }

    // Send response to the requesting client if we have one
    if (response) {
        socket.write(response);
    }
}


module.exports = handleGameXtCommand;
