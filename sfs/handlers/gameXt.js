const state = require('../../state');
const battle = require('../../battle');
const user = require('../../user');
const { users, battleRooms } = state;
const { sendMessageToUser, broadcastToBattle } = battle;
const { saveUserData } = user;

function handleGameXtCommand(socket, command, params) {
    console.log(`[GAMEXT_LOG] Handling gameXt command: ${command}`, params);

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
                    id: socket.userId,
                    name: socket.userName,
                    ready: false,
                    nanovorSwarm: [],
                    selectedNanovor: null,
                    enemyTarget: null
                }],
                creator: socket.userId,
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

            response = `<msg t="xt"><body action="xtRes" r="-1"><![CDATA[{"_cmd":"gameCreated","battleName":"${newBattleName}","gameCreator":"${socket.userName}","convertedChatRoom":false}]]></body></msg>\x00`;
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
                    id: socket.userId,
                    name: socket.userName,
                    ready: false,
                    nanovorSwarm: [],
                    selectedNanovor: null,
                    enemyTarget: null
                }],
                creator: socket.userId,
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

            response = `<msg t="xt"><body action="xtRes" r="-1"><![CDATA[{"_cmd":"gameCreated","battleName":"${customBattleName}","gameCreator":"${socket.userName}","convertedChatRoom":${convertedChatRoom}}]]></body></msg>\x00`;
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
                const invitationMsg = `<msg t="xt"><body action="xtRes" r="-1"><![CDATA[{"_cmd":"invitationRequest","battleName":"${battleToInvite}","inviter":{"username":"${socket.userName}","userRefId":"${socket.userId}"},"gameSwarmValue":${battleRooms[battleToInvite]?.gameSwarmValue || 1000},"convertedChatRoom":${convertedRoom}}]]></body></msg>\x00`;

                if (sendMessageToUser(inviteeId, invitationMsg)) {
                    response = `<msg t="xt"><body action="xtRes" r="-1"><![CDATA[{"_cmd":"invitationSent","battleName":"${battleToInvite}","invitedUser":"${invitee}"}]]></body></msg>\x00`;
                } else {
                    response = `<msg t="xt"><body action="xtRes" r="-1"><![CDATA[{"_cmd":"gameInvitationError","errorMessage":"Player offline"}]]></body></msg>\x00`;
                }
            } else {
                response = `<msg t="xt"><body action="xtRes" r="-1"><![CDATA[{"_cmd":"gameInvitationError","errorMessage":"Player not found"}]]></body></msg>\x00`;
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
                            id: socket.userId,
                            name: socket.userName,
                            ready: false,
                            nanovorSwarm: [],
                            selectedNanovor: null,
                            enemyTarget: null
                        });

                        // Update socket's active battle
                        socket.activeBattle = battleName;

                        // Send invitation response to the game creator
                        const responseMsg = `<msg t="xt"><body action="xtRes" r="-1"><![CDATA[{"_cmd":"invitationResponse","battleName":"${battleName}","player":"${socket.userName}","inviterName":"${battleRoom.creatorName}","inviterId":"${battleRoom.creator}","otherPlayers":${JSON.stringify(battleRoom.players.filter(p => p.id !== socket.userId && p.id !== battleRoom.creator).map(p => ({username: p.name, userRefId: p.id})))}}]]></body></msg>\x00`;

                        sendMessageToUser(battleRoom.creator, responseMsg);

                        // If we now have enough players, start the game
                        if (battleRoom.players.length === battleRoom.maxPlayers) {
                            battleRoom.gameState = 'in_progress';

                            // Set up turn order
                            battleRoom.turnOrder = [...battleRoom.players];

                            // Send game started message to all players
                            const gameStartMsg = `<msg t="xt"><body action="xtRes" r="-1"><![CDATA[{"_cmd":"gameStarted","battleName":"${battleName}","players":${JSON.stringify(battleRoom.players.map(p => ({username: p.name, userRefId: p.id})))},"gameCreator":"${battleRoom.creatorName}"}]]></body></msg>\x00`;

                            broadcastToBattle(battleName, gameStartMsg);
                        }

                        response = `<msg t="xt"><body action="xtRes" r="-1"><![CDATA[{"_cmd":"invitationResponse","battleName":"${battleName}","accepted":true}]]></body></msg>\x00`;
                    } else {
                        response = `<msg t="xt"><body action="xtRes" r="-1"><![CDATA[{"_cmd":"gameError"}]]></body></msg>\x00`;
                    }
                } else {
                    response = `<msg t="xt"><body action="xtRes" r="-1"><![CDATA[{"_cmd":"gameError"}]]></body></msg>\x00`;
                }
            } else {
                // User declined the invitation
                const battleRoom = battleRooms[battleName];
                if (battleRoom) {
                    // Send decline notification to the game creator
                    const declineMsg = `<msg t="xt"><body action="xtRes" r="-1"><![CDATA[{"_cmd":"invitationResponse","battleName":"${battleName}","accepted":false,"player":"${socket.userName}","reason":"${replyReason}"}]]></body></msg>\x00`;

                    sendMessageToUser(battleRoom.creator, declineMsg);
                }

                response = `<msg t="xt"><body action="xtRes" r="-1"><![CDATA[{"_cmd":"invitationResponse","battleName":"${battleName}","accepted":false,"reason":"${replyReason}"}]]></body></msg>\x00`;
            }
            break;

        case 'setGameSwarmValue':
            // Set the game swarm value for the battle
            const newSwarmValue = params.gameSwarmValue || 1000;
            const currentBattle = socket.activeBattle ? battleRooms[socket.activeBattle] : null;

            if (currentBattle && currentBattle.creator === socket.userId) {
                currentBattle.gameSwarmValue = newSwarmValue;

                // Notify other players of the change
                const swarmValueSetMsg = `<msg t="xt"><body action="xtRes" r="-1"><![CDATA[{"_cmd":"gameSwarmValueSet","battleName":"${currentBattle.name}","gameSwarmValue":${newSwarmValue}}]]></body></msg>\x00`;

                broadcastToBattle(currentBattle.name, swarmValueSetMsg, socket.userId);

                response = `<msg t="xt"><body action="xtRes" r="-1"><![CDATA[{"_cmd":"gameSwarmValueSet","battleName":"${currentBattle.name}","gameSwarmValue":${newSwarmValue}}]]></body></msg>\x00`;
            } else {
                response = `<msg t="xt"><body action="xtRes" r="-1"><![CDATA[{"_cmd":"gameError"}]]></body></msg>\x00`;
            }
            break;

        case 'setSwarm':
            console.log(`[GAMEXT_LOG] setSwarm command called by user ${socket.userId} (${socket.userName})`, params);
            // Set the player's battle swarm with enhanced validation for NewUserState
            const nanovorIds = params.nanovorIds ? params.nanovorIds.split(',').map(id => parseInt(id)) : [];
            const activeBattle = socket.activeBattle ? battleRooms[socket.activeBattle] : null;

            if (activeBattle) {
                const playerIndex = activeBattle.players.findIndex(p => p.id === socket.userId);
                if (playerIndex !== -1) {
                    // Validate that the user actually owns these nanovor
                    const user = users[socket.userId];
                    if (user && user.nanovorInventory) {
                        // Check if all requested nanovor IDs are in the user's inventory
                        const validNanovorIds = nanovorIds.filter(nanovorId =>
                            user.nanovorInventory.some(nano => nano.id === nanovorId)
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
                            response = `<msg t="xt"><body action="xtRes" r="-1"><![CDATA[{"_cmd":"gameError","errorMessage":"Swarm value ${totalSwarmValue} exceeds limit ${gameSwarmValue}"}]]></body></msg>\x00`;
                        } else {
                            // Valid swarm, update the player's swarm
                            activeBattle.players[playerIndex].nanovorSwarm = validNanovorIds;
                            console.log(`[GAMEXT_LOG] setSwarm accepted - user ${socket.userId} set swarm with ${validNanovorIds.length} nanovors (value: ${totalSwarmValue})`);

                            // Notify other players that this player has set their swarm
                            const swarmSelectedMsg = `<msg t="xt"><body action="xtRes" r="-1"><![CDATA[{"_cmd":"swarmSelected","battleName":"${activeBattle.name}","swarmCount":${validNanovorIds.length},"swarmValue":${totalSwarmValue},"username":"${socket.userName}","userRefId":"${socket.userId}"}]]></body></msg>\x00`;

                            broadcastToBattle(activeBattle.name, swarmSelectedMsg, socket.userId);

                            response = `<msg t="xt"><body action="xtRes" r="-1"><![CDATA[{"_cmd":"swarmSelected","battleName":"${activeBattle.name}","swarmCount":${validNanovorIds.length},"swarmValue":${totalSwarmValue},"username":"${socket.userName}","userRefId":"${socket.userId}"}]]></body></msg>\x00`;
                        }
                    } else {
                        // User doesn't have inventory data, use basic validation
                        activeBattle.players[playerIndex].nanovorSwarm = nanovorIds;
                        console.log(`[GAMEXT_LOG] setSwarm accepted (no inventory validation) - user ${socket.userId} set swarm with ${nanovorIds.length} nanovors`);

                        // Notify other players that this player has set their swarm
                        const swarmSelectedMsg = `<msg t="xt"><body action="xtRes" r="-1"><![CDATA[{"_cmd":"swarmSelected","battleName":"${activeBattle.name}","swarmCount":${nanovorIds.length},"username":"${socket.userName}","userRefId":"${socket.userId}"}]]></body></msg>\x00`;

                        broadcastToBattle(activeBattle.name, swarmSelectedMsg, socket.userId);

                        response = `<msg t="xt"><body action="xtRes" r="-1"><![CDATA[{"_cmd":"swarmSelected","battleName":"${activeBattle.name}","swarmCount":${nanovorIds.length},"username":"${socket.userName}","userRefId":"${socket.userId}"}]]></body></msg>\x00`;
                    }
                } else {
                    console.log(`[GAMEXT_LOG] setSwarm failed - user ${socket.userId} not found in battle ${socket.activeBattle}`);
                    response = `<msg t="xt"><body action="xtRes" r="-1"><![CDATA[{"_cmd":"gameError"}]]></body></msg>\x00`;
                }
            } else {
                console.log(`[GAMEXT_LOG] setSwarm failed - no active battle for user ${socket.userId}`);
                response = `<msg t="xt"><body action="xtRes" r="-1"><![CDATA[{"_cmd":"gameError"}]]></body></msg>\x00`;
            }
            break;

        case 'setSelectedNanovor':
            // Set the selected nanovor for the player
            const selectedNanovorId = params.nanovorId || 0;
            const selectedBattle = socket.activeBattle ? battleRooms[socket.activeBattle] : null;

            if (selectedBattle) {
                const playerIndex = selectedBattle.players.findIndex(p => p.id === socket.userId);
                if (playerIndex !== -1) {
                    selectedBattle.players[playerIndex].selectedNanovor = selectedNanovorId;

                    response = `<msg t="xt"><body action="xtRes" r="-1"><![CDATA[{"_cmd":"selectedNanovorSet","nanovorId":${selectedNanovorId}}]]></body></msg>\x00`;
                } else {
                    response = `<msg t="xt"><body action="xtRes" r="-1"><![CDATA[{"_cmd":"gameError"}]]></body></msg>\x00`;
                }
            } else {
                response = `<msg t="xt"><body action="xtRes" r="-1"><![CDATA[{"_cmd":"gameError"}]]></body></msg>\x00`;
            }
            break;

        case 'setEnemy':
            // Set the target enemy for attack
            const enemyUsername = params.enemyUsername;
            const enemyBattle = socket.activeBattle ? battleRooms[socket.activeBattle] : null;

            if (enemyBattle) {
                const playerIndex = enemyBattle.players.findIndex(p => p.id === socket.userId);
                if (playerIndex !== -1) {
                    // Find the target player by username
                    const targetIndex = enemyBattle.players.findIndex(p => p.name === enemyUsername);
                    if (targetIndex !== -1) {
                        enemyBattle.players[playerIndex].enemyTarget = enemyBattle.players[targetIndex].id;

                        // Send target selected notification to all players
                        const targetSelectedMsg = `<msg t="xt"><body action="xtRes" r="-1"><![CDATA[{"_cmd":"targetSelected","userRefId":"${socket.userId}","targetUserRefId":"${enemyBattle.players[targetIndex].id}","attackId":0}]]></body></msg>\x00`;

                        broadcastToBattle(enemyBattle.name, targetSelectedMsg);

                        response = `<msg t="xt"><body action="xtRes" r="-1"><![CDATA[{"_cmd":"enemyTargetSet","targetUsername":"${enemyUsername}","targetId":"${enemyBattle.players[targetIndex].id}"}]]></body></msg>\x00`;
                    } else {
                        response = `<msg t="xt"><body action="xtRes" r="-1"><![CDATA[{"_cmd":"gameError"}]]></body></msg>\x00`;
                    }
                } else {
                    response = `<msg t="xt"><body action="xtRes" r="-1"><![CDATA[{"_cmd":"gameError"}]]></body></msg>\x00`;
                }
            } else {
                response = `<msg t="xt"><body action="xtRes" r="-1"><![CDATA[{"_cmd":"gameError"}]]></body></msg>\x00`;
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
                const playerIndex = attackBattle.players.findIndex(p => p.id === socket.userId);
                if (playerIndex !== -1) {
                    // Find the target player
                    const targetIndex = attackBattle.players.findIndex(p => p.name === targetPlayerName);
                    if (targetIndex !== -1) {
                        // Record the attack info
                        const attackInfo = {
                            attackerId: socket.userId,
                            targetId: attackBattle.players[targetIndex].id,
                            nanovorId: myNanovorId,
                            attackId: setAttackId,
                            swapNanovorId: swapNanovorId,
                            timestamp: Date.now()
                        };

                        attackBattle.battleHistory.push(attackInfo);

                        // Send attack performed notification to all players
                        const attackMsg = `<msg t="xt"><body action="xtRes" r="-1"><![CDATA[{"_cmd":"performAttack","attackResults":{"attackerId":"${socket.userId}","targetId":"${attackBattle.players[targetIndex].id}","nanovorId":${myNanovorId},"attackId":${setAttackId}}}]]></body></msg>\x00`;

                        broadcastToBattle(attackBattle.name, attackMsg);

                        response = `<msg t="xt"><body action="xtRes" r="-1"><![CDATA[{"_cmd":"attackInfoSet","attackId":${setAttackId}}]]></body></msg>\x00`;
                    } else {
                        response = `<msg t="xt"><body action="xtRes" r="-1"><![CDATA[{"_cmd":"gameError"}]]></body></msg>\x00`;
                    }
                } else {
                    response = `<msg t="xt"><body action="xtRes" r="-1"><![CDATA[{"_cmd":"gameError"}]]></body></msg>\x00`;
                }
            } else {
                response = `<msg t="xt"><body action="xtRes" r="-1"><![CDATA[{"_cmd":"gameError"}]]></body></msg>\x00`;
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
                const roundCompleteMsg = `<msg t="xt"><body action="xtRes" r="-1"><![CDATA[{"_cmd":"roundCompleted","round":${roundBattle.round}}]]></body></msg>\x00`;

                broadcastToBattle(roundBattle.name, roundCompleteMsg);

                response = `<msg t="xt"><body action="xtRes" r="-1"><![CDATA[{"_cmd":"roundEnded","round":${roundBattle.round}}]]></body></msg>\x00`;
            } else {
                response = `<msg t="xt"><body action="xtRes" r="-1"><![CDATA[{"_cmd":"gameError"}]]></body></msg>\x00`;
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
                    const gameOverMsg = `<msg t="xt"><body action="xtRes" r="-1"><![CDATA[{"_cmd":"gameOver","winnerId":"${quitBattle.players[0]?.id || ''}","results":"Game ended due to player quit"}]]></body></msg>\x00`;

                    broadcastToBattle(quitBattle.name, gameOverMsg);
                } else {
                    // Notify other players that someone quit
                    const playerQuitMsg = `<msg t="xt"><body action="xtRes" r="-1"><![CDATA[{"_cmd":"playerQuitGame","userRefId":"${quittingUserId}","username":"${users[quittingUserId]?.username || 'Unknown'}"}]]></body></msg>\x00`;
                    console.log(`[GAMEXT_LOG] quitGame - notifying other players about user ${quittingUserId} quitting`);

                    broadcastToBattle(quitBattle.name, playerQuitMsg);
                }

                // Clear the active battle for the socket
                socket.activeBattle = null;

                response = `<msg t="xt"><body action="xtRes" r="-1"><![CDATA[{"_cmd":"quitGameConfirmed","userRefId":"${quittingUserId}"}]]></body></msg>\x00`;
                console.log(`[GAMEXT_LOG] quitGame completed for user ${quittingUserId}`);
            } else {
                console.log(`[GAMEXT_LOG] quitGame failed - no active battle for user ${socket.userId}`);
                response = `<msg t="xt"><body action="xtRes" r="-1"><![CDATA[{"_cmd":"gameError"}]]></body></msg>\x00`;
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
                const cancelMsg = `<msg t="xt"><body action="xtRes" r="-1"><![CDATA[{"_cmd":"gameOver","results":"Game was cancelled by the creator"}]]></body></msg>\x00`;

                broadcastToBattle(cancelBattleName, cancelMsg);

                delete battleRooms[cancelBattleName];

                // Clear the active battle for the socket
                socket.activeBattle = null;

                response = `<msg t="xt"><body action="xtRes" r="-1"><![CDATA[{"_cmd":"quickBattleCancelled"}]]></body></msg>\x00`;
            } else {
                response = `<msg t="xt"><body action="xtRes" r="-1"><![CDATA[{"_cmd":"gameError"}]]></body></msg>\x00`;
            }
            break;

        case 'getBadgeList':
            // Get badge list for a player
            const ownerId = params.ownerId;
            const nanovorId = params.nanovorId;

            // Return empty badge list for now
            response = `<msg t="xt"><body action="xtRes" r="-1"><![CDATA[{"_cmd":"badgeList","ownerId":"${ownerId}","nanovorId":"${nanovorId}","badges":[]}]]></body></msg>\x00`;
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

                // Send game started message to all players
                const gameStartMsg = `<msg t="xt"><body action="xtRes" r="-1"><![CDATA[{"_cmd":"gameStarted","battleName":"${startBattleName}","players":${JSON.stringify(startBattle.players.map(p => ({username: p.name, userRefId: p.id})))},"gameCreator":"${startBattle.creatorName}"}]]></body></msg>\x00`;

                broadcastToBattle(startBattleName, gameStartMsg);

                response = `<msg t="xt"><body action="xtRes" r="-1"><![CDATA[{"_cmd":"gameStarted","battleName":"${startBattleName}"}]]></body></msg>\x00`;
                console.log(`[GAMEXT_LOG] startGame completed for battle ${startBattleName}`);
            } else {
                console.log(`[GAMEXT_LOG] startGame failed - battle ${startBattleName} not found`);
                response = `<msg t="xt"><body action="xtRes" r="-1"><![CDATA[{"_cmd":"gameError"}]]></body></msg>\x00`;
            }
            break;

        case 'setAttack':
            // Set attack to perform
            const attackToSet = params.attackId || 0;

            // In a real implementation, this would record the player's chosen attack
            // For now, just acknowledge the command
            response = `<msg t="xt"><body action="xtRes" r="-1"><![CDATA[{"_cmd":"attackSet","attackId":${attackToSet}}]]></body></msg>\x00`;
            break;

        case 'setNextSwap':
            // Set next nanovor to swap to
            const nextNanovorId = params.nanovorId || 0;
            const swapBattle = socket.activeBattle ? battleRooms[socket.activeBattle] : null;

            if (swapBattle) {
                const playerIndex = swapBattle.players.findIndex(p => p.id === socket.userId);
                if (playerIndex !== -1) {
                    // Record the swap intention
                    swapBattle.players[playerIndex].nextSwap = nextNanovorId;

                    response = `<msg t="xt"><body action="xtRes" r="-1"><![CDATA[{"_cmd":"nextSwapSet","nanovorId":${nextNanovorId}}]]></body></msg>\x00`;
                } else {
                    response = `<msg t="xt"><body action="xtRes" r="-1"><![CDATA[{"_cmd":"gameError"}]]></body></msg>\x00`;
                }
            } else {
                response = `<msg t="xt"><body action="xtRes" r="-1"><![CDATA[{"_cmd":"gameError"}]]></body></msg>\x00`;
            }
            break;

        case 'declinedToWatch':
            // Player declined to watch an ongoing battle
            const declinerId = params.userRefId;

            response = `<msg t="xt"><body action="xtRes" r="-1"><![CDATA[{"_cmd":"declinedToWatchConfirmed","userRefId":"${declinerId}"}]]></body></msg>\x00`;
            break;

        case 'kickPlayerOut':
            // Kick a player from the battle
            const usernameToKick = params.username;
            const kickBattle = socket.activeBattle ? battleRooms[socket.activeBattle] : null;

            if (kickBattle && kickBattle.creator === socket.userId) {
                // Find and remove the player
                const playerToKickIndex = kickBattle.players.findIndex(p => p.name === usernameToKick);
                if (playerToKickIndex !== -1) {
                    const kickedPlayer = kickBattle.players[playerToKickIndex];

                    // Send kick notification to the kicked player
                    const kickMsg = `<msg t="xt"><body action="xtRes" r="-1"><![CDATA[{"_cmd":"playerKickedOut","userRefId":"${kickedPlayer.id}"}]]></body></msg>\x00`;

                    sendMessageToUser(kickedPlayer.id, kickMsg);

                    // Remove the player from the battle
                    kickBattle.players.splice(playerToKickIndex, 1);

                    // If there's only one player left, end the game
                    if (kickBattle.players.length <= 1) {
                        kickBattle.gameState = 'finished';

                        // Notify remaining players that the game is over
                        const gameOverMsg = `<msg t="xt"><body action="xtRes" r="-1"><![CDATA[{"_cmd":"gameOver","winnerId":"${kickBattle.players[0]?.id || ''}","results":"Game ended due to player kick"}]]></body></msg>\x00`;

                        broadcastToBattle(kickBattle.name, gameOverMsg);
                    } else {
                        // Notify other players that someone was kicked
                        const playerKickedMsg = `<msg t="xt"><body action="xtRes" r="-1"><![CDATA[{"_cmd":"playerQuitGame","userRefId":"${kickedPlayer.id}","username":"${kickedPlayer.name}"}]]></body></msg>\x00`;

                        broadcastToBattle(kickBattle.name, playerKickedMsg);
                    }

                    response = `<msg t="xt"><body action="xtRes" r="-1"><![CDATA[{"_cmd":"playerKickedOut","userRefId":"${kickedPlayer.id}"}]]></body></msg>\x00`;
                } else {
                    response = `<msg t="xt"><body action="xtRes" r="-1"><![CDATA[{"_cmd":"gameError"}]]></body></msg>\x00`;
                }
            } else {
                response = `<msg t="xt"><body action="xtRes" r="-1"><![CDATA[{"_cmd":"gameError"}]]></body></msg>\x00`;
            }
            break;

        case 'setReady':
            console.log(`[GAMEXT_LOG] setReady command called by user ${socket.userId} (${socket.userName})`, params);
            // Set player ready state
            const readyBattle = socket.activeBattle ? battleRooms[socket.activeBattle] : null;

            if (readyBattle) {
                const playerIndex = readyBattle.players.findIndex(p => p.id === socket.userId);
                if (playerIndex !== -1) {
                    readyBattle.players[playerIndex].ready = true;
                    console.log(`[GAMEXT_LOG] setReady - user ${socket.userId} marked as ready in battle ${readyBattle.name}`);

                    // Check if all players are ready
                    const allReady = readyBattle.players.every(p => p.ready);

                    if (allReady && readyBattle.players.length >= 2) {
                        // Start the game if all players are ready
                        readyBattle.gameState = 'in_progress';
                        console.log(`[GAMEXT_LOG] setReady - all players ready, starting game in battle ${readyBattle.name}`);

                        // Set up turn order
                        readyBattle.turnOrder = [...readyBattle.players];

                        // Send game started message to all players
                        const gameStartMsg = `<msg t="xt"><body action="xtRes" r="-1"><![CDATA[{"_cmd":"gameStarted","battleName":"${readyBattle.name}","players":${JSON.stringify(readyBattle.players.map(p => ({username: p.name, userRefId: p.id})))},"gameCreator":"${readyBattle.creatorName}"}]]></body></msg>\x00`;

                        broadcastToBattle(readyBattle.name, gameStartMsg);
                    }

                    response = `<msg t="xt"><body action="xtRes" r="-1"><![CDATA[{"_cmd":"playerReady","userRefId":"${socket.userId}","ready":true}]]></body></msg>\x00`;
                } else {
                    console.log(`[GAMEXT_LOG] setReady failed - user ${socket.userId} not found in battle ${socket.activeBattle}`);
                    response = `<msg t="xt"><body action="xtRes" r="-1"><![CDATA[{"_cmd":"gameError"}]]></body></msg>\x00`;
                }
            } else {
                console.log(`[GAMEXT_LOG] setReady failed - no active battle for user ${socket.userId}`);
                response = `<msg t="xt"><body action="xtRes" r="-1"><![CDATA[{"_cmd":"gameError"}]]></body></msg>\x00`;
            }
            break;

        case 'getPlayerStatus':
            // Get status of players in battle
            const statusBattle = socket.activeBattle ? battleRooms[socket.activeBattle] : null;

            if (statusBattle) {
                const playerStatus = statusBattle.players.map(p => ({
                    userRefId: p.id,
                    username: p.name,
                    ready: p.ready,
                    nanovorSwarmSize: p.nanovorSwarm ? p.nanovorSwarm.length : 0
                }));

                response = `<msg t="xt"><body action="xtRes" r="-1"><![CDATA[{"_cmd":"playerStatusList","players":${JSON.stringify(playerStatus)}}]}</body></msg>\x00`;
            } else {
                response = `<msg t="xt"><body action="xtRes" r="-1"><![CDATA[{"_cmd":"gameError"}]]></body></msg>\x00`;
            }
            break;

        case 'getBattleStatus':
            // Get current battle state
            const battleStatus = socket.activeBattle ? battleRooms[socket.activeBattle] : null;

            if (battleStatus) {
                response = `<msg t="xt"><body action="xtRes" r="-1"><![CDATA[{"_cmd":"battleStatus","battleName":"${battleStatus.name}","gameState":"${battleStatus.gameState}","currentRound":${battleStatus.round},"playerCount":${battleStatus.players.length}}]}</body></msg>\x00`;
            } else {
                response = `<msg t="xt"><body action="xtRes" r="-1"><![CDATA[{"_cmd":"gameError"}]]></body></msg>\x00`;
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
                    attackerId: socket.userId,
                    targetId: targetUserRefId,
                    nanovorId: attackNanovorId,
                    attackId: attackId,
                    timestamp: Date.now()
                };

                performAttackBattle.battleHistory.push(attackRecord);
                console.log(`[GAMEXT_LOG] performAttack recorded - ${socket.userId} attacked ${targetUserRefId} with nanovor ${attackNanovorId}, attackId: ${attackId}`);

                // Send attack notification to all players
                const attackMsg = `<msg t="xt"><body action="xtRes" r="-1"><![CDATA[{"_cmd":"performAttack","attackResults":{"attackerId":"${socket.userId}","targetId":"${targetUserRefId}","nanovorId":${attackNanovorId},"attackId":${attackId}}}]]></body></msg>\x00`;

                broadcastToBattle(performAttackBattle.name, attackMsg);

                response = `<msg t="xt"><body action="xtRes" r="-1"><![CDATA[{"_cmd":"attackPerformed","attackId":${attackId}}]]></body></msg>\x00`;
                console.log(`[GAMEXT_LOG] performAttack completed successfully`);
            } else {
                console.log(`[GAMEXT_LOG] performAttack failed - no active battle for user ${socket.userId}`);
                response = `<msg t="xt"><body action="xtRes" r="-1"><![CDATA[{"_cmd":"gameError"}]]></body></msg>\x00`;
            }
            break;

        case 'swapNanovor':
            // Swap active nanovor during battle
            const newNanovorId = params.newNanovorId;
            const swapNanovorBattle = socket.activeBattle ? battleRooms[socket.activeBattle] : null;

            if (swapNanovorBattle) {
                const playerIndex = swapNanovorBattle.players.findIndex(p => p.id === socket.userId);
                if (playerIndex !== -1) {
                    // Update the selected nanovor
                    swapNanovorBattle.players[playerIndex].selectedNanovor = newNanovorId;

                    // Notify all players about the swap
                    const swapMsg = `<msg t="xt"><body action="xtRes" r="-1"><![CDATA[{"_cmd":"swapNanovor","userRefId":"${socket.userId}","newNanovorId":${newNanovorId}}]]></body></msg>\x00`;

                    broadcastToBattle(swapNanovorBattle.name, swapMsg);

                    response = `<msg t="xt"><body action="xtRes" r="-1"><![CDATA[{"_cmd":"nanovorSwapped","newNanovorId":${newNanovorId}}]]></body></msg>\x00`;
                } else {
                    response = `<msg t="xt"><body action="xtRes" r="-1"><![CDATA[{"_cmd":"gameError"}]]></body></msg>\x00`;
                }
            } else {
                response = `<msg t="xt"><body action="xtRes" r="-1"><![CDATA[{"_cmd":"gameError"}]]></body></msg>\x00`;
            }
            break;

        case 'killNanovor':
            // Mark a nanovor as defeated
            const killedNanovorId = params.nanovorId;
            const killerId = params.killerId;
            const killBattle = socket.activeBattle ? battleRooms[socket.activeBattle] : null;

            if (killBattle) {
                // Notify all players about the nanovor death
                const killMsg = `<msg t="xt"><body action="xtRes" r="-1"><![CDATA[{"_cmd":"killNanovor","nanovorId":${killedNanovorId},"killerId":"${killerId}"}]]></body></msg>\x00`;

                broadcastToBattle(killBattle.name, killMsg);

                response = `<msg t="xt"><body action="xtRes" r="-1"><![CDATA[{"_cmd":"nanovorKilled","nanovorId":${killedNanovorId}}]]></body></msg>\x00`;
            } else {
                response = `<msg t="xt"><body action="xtRes" r="-1"><![CDATA[{"_cmd":"gameError"}]]></body></msg>\x00`;
            }
            break;

        case 'blockSwap':
            // Block nanovor swapping
            const blockerId = params.blockerId;
            const blockBattle = socket.activeBattle ? battleRooms[socket.activeBattle] : null;

            if (blockBattle) {
                // Notify all players about the swap block
                const blockMsg = `<msg t="xt"><body action="xtRes" r="-1"><![CDATA[{"_cmd":"blockSwap","blockerId":"${blockerId}"}]]></body></msg>\x00`;

                broadcastToBattle(blockBattle.name, blockMsg);

                response = `<msg t="xt"><body action="xtRes" r="-1"><![CDATA[{"_cmd":"swapBlocked","blockerId":"${blockerId}"}]]></body></msg>\x00`;
            } else {
                response = `<msg t="xt"><body action="xtRes" r="-1"><![CDATA[{"_cmd":"gameError"}]]></body></msg>\x00`;
            }
            break;

        case 'selectNanovor':
            // Select a nanovor for battle
            const selectNanovorId = params.nanovorId;
            const selectBattle = socket.activeBattle ? battleRooms[socket.activeBattle] : null;

            if (selectBattle) {
                const playerIndex = selectBattle.players.findIndex(p => p.id === socket.userId);
                if (playerIndex !== -1) {
                    selectBattle.players[playerIndex].selectedNanovor = selectNanovorId;

                    // Notify all players about the selection
                    const selectMsg = `<msg t="xt"><body action="xtRes" r="-1"><![CDATA[{"_cmd":"selectNanovor","userRefId":"${socket.userId}","nanovorId":${selectNanovorId}}]]></body></msg>\x00`;

                    broadcastToBattle(selectBattle.name, selectMsg);

                    response = `<msg t="xt"><body action="xtRes" r="-1"><![CDATA[{"_cmd":"nanovorSelected","nanovorId":${selectNanovorId}}]]></body></msg>\x00`;
                } else {
                    response = `<msg t="xt"><body action="xtRes" r="-1"><![CDATA[{"_cmd":"gameError"}]]></body></msg>\x00`;
                }
            } else {
                response = `<msg t="xt"><body action="xtRes" r="-1"><![CDATA[{"_cmd":"gameError"}]]></body></msg>\x00`;
            }
            break;

        case 'setRoundInfo':
            // Set round information
            const roundInfo = params.roundInfo;
            const roundInfoBattle = socket.activeBattle ? battleRooms[socket.activeBattle] : null;

            if (roundInfoBattle) {
                // Update round info in battle
                roundInfoBattle.currentRoundInfo = roundInfo;

                // Notify all players about the round info
                const roundInfoMsg = `<msg t="xt"><body action="xtRes" r="-1"><![CDATA[{"_cmd":"setRoundInfo","roundInfo":${JSON.stringify(roundInfo)}}]}</body></msg>\x00`;

                broadcastToBattle(roundInfoBattle.name, roundInfoMsg);

                response = `<msg t="xt"><body action="xtRes" r="-1"><![CDATA[{"_cmd":"roundInfoSet","round":${roundInfoBattle.round}}]}</body></msg>\x00`;
            } else {
                response = `<msg t="xt"><body action="xtRes" r="-1"><![CDATA[{"_cmd":"gameError"}]]></body></msg>\x00`;
            }
            break;

        case 'showGameResults':
            // Show game results
            const gameResults = params.results;
            const resultsBattle = socket.activeBattle ? battleRooms[socket.activeBattle] : null;

            if (resultsBattle) {
                // Notify all players about the game results
                const resultsMsg = `<msg t="xt"><body action="xtRes" r="-1"><![CDATA[{"_cmd":"showGameResults","results":${JSON.stringify(gameResults)}}]}</body></msg>\x00`;

                broadcastToBattle(resultsBattle.name, resultsMsg);

                response = `<msg t="xt"><body action="xtRes" r="-1"><![CDATA[{"_cmd":"gameResultsShown","battleName":"${resultsBattle.name}"}]]></body></msg>\x00`;
            } else {
                response = `<msg t="xt"><body action="xtRes" r="-1"><![CDATA[{"_cmd":"gameError"}]]></body></msg>\x00`;
            }
            break;

        case 'gameQuit':
            console.log(`[GAMEXT_LOG] gameQuit command called by user ${socket.userId} (${socket.userName})`, params);
            // Quit the game
            const gameQuitBattle = socket.activeBattle ? battleRooms[socket.activeBattle] : null;

            if (gameQuitBattle) {
                // Remove player from the battle
                gameQuitBattle.players = gameQuitBattle.players.filter(p => p.id !== socket.userId);
                console.log(`[GAMEXT_LOG] gameQuit - user ${socket.userId} removed from battle ${gameQuitBattle.name}, ${gameQuitBattle.players.length} players remaining`);

                // If there's only one player left, end the game
                if (gameQuitBattle.players.length <= 1) {
                    gameQuitBattle.gameState = 'finished';
                    console.log(`[GAMEXT_LOG] gameQuit - only ${gameQuitBattle.players.length} player left, ending game`);

                    // Notify remaining players that the game is over
                    const gameOverMsg = `<msg t="xt"><body action="xtRes" r="-1"><![CDATA[{"_cmd":"gameOver","winnerId":"${gameQuitBattle.players[0]?.id || ''}","results":"Game ended due to player quit"}]]></body></msg>\x00`;

                    broadcastToBattle(gameQuitBattle.name, gameOverMsg);
                } else {
                    // Notify other players that someone quit
                    const playerQuitMsg = `<msg t="xt"><body action="xtRes" r="-1"><![CDATA[{"_cmd":"playerQuitGame","userRefId":"${socket.userId}","username":"${users[socket.userId]?.username || 'Unknown'}"}]]></body></msg>\x00`;
                    console.log(`[GAMEXT_LOG] gameQuit - notifying other players about user ${socket.userId} quitting`);

                    broadcastToBattle(gameQuitBattle.name, playerQuitMsg);
                }

                // Clear the active battle for the socket
                socket.activeBattle = null;

                response = `<msg t="xt"><body action="xtRes" r="-1"><![CDATA[{"_cmd":"gameQuitConfirmed","userRefId":"${socket.userId}"}]]></body></msg>\x00`;
                console.log(`[GAMEXT_LOG] gameQuit completed for user ${socket.userId}`);
            } else {
                console.log(`[GAMEXT_LOG] gameQuit failed - no active battle for user ${socket.userId}`);
                response = `<msg t="xt"><body action="xtRes" r="-1"><![CDATA[{"_cmd":"gameError"}]]></body></msg>\x00`;
            }
            break;

        case 'playerJoinAutoBattle':
            // Join an auto battle
            const autoBattleName = params.battleName;
            const gameCreator = params.gameCreator;
            const gameCreatorId = params.gameCreatorId;

            // Create or join the auto battle
            if (!battleRooms[autoBattleName]) {
                battleRooms[autoBattleName] = {
                    id: state.battleIdCounter++,
                    name: autoBattleName,
                    gameSwarmValue: 1000, // Default value
                    maxPlayers: 2,
                    players: [{
                        id: gameCreatorId,
                        name: gameCreator,
                        ready: true,
                        nanovorSwarm: [],
                        selectedNanovor: null,
                        enemyTarget: null
                    }, {
                        id: socket.userId,
                        name: socket.userName,
                        ready: true,
                        nanovorSwarm: [],
                        selectedNanovor: null,
                        enemyTarget: null
                    }],
                    creator: gameCreatorId,
                    creatorName: gameCreator,
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
                        id: socket.userId,
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

            // Set up turn order and start the game
            const finalAutoBattle = battleRooms[autoBattleName];
            finalAutoBattle.turnOrder = [...finalAutoBattle.players];
            finalAutoBattle.gameState = 'in_progress';

            // Send join auto battle message to all players
            const joinAutoMsg = `<msg t="xt"><body action="xtRes" r="-1"><![CDATA[{"_cmd":"playerJoinAutoBattle","battleName":"${autoBattleName}","username":"${socket.userName}","userRefId":"${socket.userId}","gameCreator":"${gameCreator}","gameCreatorId":"${gameCreatorId}"}]]></body></msg>\x00`;

            broadcastToBattle(autoBattleName, joinAutoMsg);

            response = `<msg t="xt"><body action="xtRes" r="-1"><![CDATA[{"_cmd":"joinedAutoBattle","battleName":"${autoBattleName}","gameCreator":"${gameCreator}","gameCreatorId":"${gameCreatorId}"}]]></body></msg>\x00`;
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

                    // Set up turn order
                    readyCheckBattle.turnOrder = [...readyCheckBattle.players];

                    // Send game started message to all players
                    const gameStartMsg = `<msg t="xt"><body action="xtRes" r="-1"><![CDATA[{"_cmd":"gameStarted","battleName":"${readyCheckBattle.name}","players":${JSON.stringify(readyCheckBattle.players.map(p => ({username: p.name, userRefId: p.id})))},"gameCreator":"${readyCheckBattle.creatorName}"}]]></body></msg>\x00`;

                    broadcastToBattle(readyCheckBattle.name, gameStartMsg);

                    response = `<msg t="xt"><body action="xtRes" r="-1"><![CDATA[{"_cmd":"allPlayersReady","battleStarted":true}]]></body></msg>\x00`;
                } else {
                    response = `<msg t="xt"><body action="xtRes" r="-1"><![CDATA[{"_cmd":"allPlayersReady","battleStarted":false}]]></body></msg>\x00`;
                }
            } else {
                response = `<msg t="xt"><body action="xtRes" r="-1"><![CDATA[{"_cmd":"gameError"}]]></body></msg>\x00`;
            }
            break;

        case 'waitingForPlayers':
            // Indicate waiting for players state
            const waitingBattle = socket.activeBattle ? battleRooms[socket.activeBattle] : null;

            if (waitingBattle) {
                waitingBattle.gameState = 'waiting_for_players';

                // Notify all players that we're waiting for more players
                const waitingMsg = `<msg t="xt"><body action="xtRes" r="-1"><![CDATA[{"_cmd":"waitingForPlayers","battleName":"${waitingBattle.name}","currentPlayers":${waitingBattle.players.length},"maxPlayers":${waitingBattle.maxPlayers}}]}</body></msg>\x00`;

                broadcastToBattle(waitingBattle.name, waitingMsg);

                response = `<msg t="xt"><body action="xtRes" r="-1"><![CDATA[{"_cmd":"waitingForPlayers","battleName":"${waitingBattle.name}","currentPlayers":${waitingBattle.players.length}}]}</body></msg>\x00`;
            } else {
                response = `<msg t="xt"><body action="xtRes" r="-1"><![CDATA[{"_cmd":"gameError"}]]></body></msg>\x00`;
            }
            break;

        case 'gameStarted':
            // Confirm game has started
            const startedBattle = socket.activeBattle ? battleRooms[socket.activeBattle] : null;

            if (startedBattle) {
                startedBattle.gameState = 'in_progress';

                // Set up turn order
                startedBattle.turnOrder = [...startedBattle.players];

                // Send game started message to all players
                const gameStartMsg = `<msg t="xt"><body action="xtRes" r="-1"><![CDATA[{"_cmd":"gameStarted","battleName":"${startedBattle.name}","players":${JSON.stringify(startedBattle.players.map(p => ({username: p.name, userRefId: p.id})))},"gameCreator":"${startedBattle.creatorName}"}]]></body></msg>\x00`;

                broadcastToBattle(startedBattle.name, gameStartMsg);

                response = `<msg t="xt"><body action="xtRes" r="-1"><![CDATA[{"_cmd":"gameStarted","battleName":"${startedBattle.name}","players":${JSON.stringify(startedBattle.players.map(p => ({username: p.name, userRefId: p.id})))}}]}</body></msg>\x00`;
            } else {
                response = `<msg t="xt"><body action="xtRes" r="-1"><![CDATA[{"_cmd":"gameError"}]]></body></msg>\x00`;
            }
            break;

        case 'gameSwarmValueSet':
            // Confirm swarm value is set
            const swarmValue = params.gameSwarmValue;
            const swarmValueBattle = socket.activeBattle ? battleRooms[socket.activeBattle] : null;

            if (swarmValueBattle) {
                swarmValueBattle.gameSwarmValue = swarmValue;

                // Notify other players of the change
                const swarmValueSetMsg = `<msg t="xt"><body action="xtRes" r="-1"><![CDATA[{"_cmd":"gameSwarmValueSet","battleName":"${swarmValueBattle.name}","gameSwarmValue":${swarmValue}}]}</body></msg>\x00`;

                broadcastToBattle(swarmValueBattle.name, swarmValueSetMsg, socket.userId);

                response = `<msg t="xt"><body action="xtRes" r="-1"><![CDATA[{"_cmd":"gameSwarmValueSet","battleName":"${swarmValueBattle.name}","gameSwarmValue":${swarmValue}}]}</body></msg>\x00`;
            } else {
                response = `<msg t="xt"><body action="xtRes" r="-1"><![CDATA[{"_cmd":"gameError"}]]></body></msg>\x00`;
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
                const swarmSelectedMsg = `<msg t="xt"><body action="xtRes" r="-1"><![CDATA[{"_cmd":"swarmSelected","battleName":"${swarmSelectBattle.name}","swarmCount":${swarmCount},"username":"${username}","userRefId":"${userRefId}"}]]></body></msg>\x00`;

                broadcastToBattle(swarmSelectBattle.name, swarmSelectedMsg, socket.userId);

                response = `<msg t="xt"><body action="xtRes" r="-1"><![CDATA[{"_cmd":"swarmSelected","battleName":"${swarmSelectBattle.name}","swarmCount":${swarmCount},"username":"${username}","userRefId":"${userRefId}"}]]></body></msg>\x00`;
            } else {
                response = `<msg t="xt"><body action="xtRes" r="-1"><![CDATA[{"_cmd":"gameError"}]]></body></msg>\x00`;
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
                const targetSelectedMsg = `<msg t="xt"><body action="xtRes" r="-1"><![CDATA[{"_cmd":"targetSelected","userRefId":"${userRefIdTarget}","targetUserRefId":"${selectedTargetUserRefId}","attackId":${attackIdTarget}}]}</body></msg>\x00`;

                broadcastToBattle(targetSelectBattle.name, targetSelectedMsg);

                response = `<msg t="xt"><body action="xtRes" r="-1"><![CDATA[{"_cmd":"targetSelected","userRefId":"${userRefIdTarget}","targetUserRefId":"${selectedTargetUserRefId}","attackId":${attackIdTarget}}]}</body></msg>\x00`;
            } else {
                response = `<msg t="xt"><body action="xtRes" r="-1"><![CDATA[{"_cmd":"gameError"}]]></body></msg>\x00`;
            }
            break;

        case 'readyForTurn':
            // Signal player is ready for turn
            const nanovorIdTurn = params.nanovorId;
            const isDead = params.isDead;
            const turnBattle = socket.activeBattle ? battleRooms[socket.activeBattle] : null;

            if (turnBattle) {
                // Send ready for turn notification to the player
                const readyForTurnMsg = `<msg t="xt"><body action="xtRes" r="-1"><![CDATA[{"_cmd":"readyForTurn","battleName":"${turnBattle.name}","nanovorId":${nanovorIdTurn},"isDead":${isDead}}]}</body></msg>\x00`;

                socket.write(readyForTurnMsg);

                response = `<msg t="xt"><body action="xtRes" r="-1"><![CDATA[{"_cmd":"readyForTurn","battleName":"${turnBattle.name}","nanovorId":${nanovorIdTurn},"isDead":${isDead}}]}</body></msg>\x00`;
            } else {
                response = `<msg t="xt"><body action="xtRes" r="-1"><![CDATA[{"_cmd":"gameError"}]]></body></msg>\x00`;
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
                const roundCompleteMsg = `<msg t="xt"><body action="xtRes" r="-1"><![CDATA[{"_cmd":"roundCompleted","round":${roundCompleteBattle.round}}]}</body></msg>\x00`;

                broadcastToBattle(roundCompleteBattle.name, roundCompleteMsg);

                response = `<msg t="xt"><body action="xtRes" r="-1"><![CDATA[{"_cmd":"roundCompleted","round":${roundCompleteBattle.round}}]}</body></msg>\x00`;
            } else {
                response = `<msg t="xt"><body action="xtRes" r="-1"><![CDATA[{"_cmd":"gameError"}]]></body></msg>\x00`;
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
                    const gameOverMsg = `<msg t="xt"><body action="xtRes" r="-1"><![CDATA[{"_cmd":"gameOver","winnerId":"${quitGameBattle.players[0]?.id || ''}","results":"Game ended due to player quit"}]]></body></msg>\x00`;

                    broadcastToBattle(quitGameBattle.name, gameOverMsg);
                } else {
                    // Notify other players that someone quit
                    const playerQuitMsg = `<msg t="xt"><body action="xtRes" r="-1"><![CDATA[{"_cmd":"playerQuitGame","userRefId":"${quitUserId}","username":"${quitUsername}"}]]></body></msg>\x00`;

                    broadcastToBattle(quitGameBattle.name, playerQuitMsg);
                }

                response = `<msg t="xt"><body action="xtRes" r="-1"><![CDATA[{"_cmd":"playerQuitConfirmed","userRefId":"${quitUserId}","username":"${quitUsername}"}]]></body></msg>\x00`;
            } else {
                response = `<msg t="xt"><body action="xtRes" r="-1"><![CDATA[{"_cmd":"gameError"}]]></body></msg>\x00`;
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
                const gameOverMsg = `<msg t="xt"><body action="xtRes" r="-1"><![CDATA[{"_cmd":"gameOver","winnerId":"${winnerId}","results":"${results}"}]]></body></msg>\x00`;

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

                response = `<msg t="xt"><body action="xtRes" r="-1"><![CDATA[{"_cmd":"gameOver","winnerId":"${winnerId}","results":"${results}"}]]></body></msg>\x00`;
            } else {
                console.log(`[GAMEXT_LOG] gameOver failed - no active battle for user ${socket.userId}`);
                response = `<msg t="xt"><body action="xtRes" r="-1"><![CDATA[{"_cmd":"gameError"}]]></body></msg>\x00`;
            }
            break;

        case 'roomDestroyed':
            // Report room destroyed
            const roomName = params.roomName;
            const destroyBattle = roomName ? battleRooms[roomName] : null;

            if (destroyBattle) {
                // Notify all players in the battle that the room is destroyed
                const roomDestroyMsg = `<msg t="xt"><body action="xtRes" r="-1"><![CDATA[{"_cmd":"roomDestroyed"}]}</body></msg>\x00`;

                broadcastToBattle(roomName, roomDestroyMsg);

                // Clean up the battle room
                delete battleRooms[roomName];

                response = `<msg t="xt"><body action="xtRes" r="-1"><![CDATA[{"_cmd":"roomDestroyed","roomName":"${roomName}"}]]></body></msg>\x00`;
            } else {
                response = `<msg t="xt"><body action="xtRes" r="-1"><![CDATA[{"_cmd":"gameError"}]]></body></msg>\x00`;
            }
            break;

        default:
            response = `<msg t="xt"><body action="xtRes" r="-1"><![CDATA[{"_cmd":"unknownCommand"}]]></body></msg>\x00`;
    }

    // Only send response if it's not handled by a specific case that sends its own messages
    if (response && !response.includes('invitationSent') && !response.includes('invitationRequest')) {  // Some responses are sent separately
        socket.write(response);
    }
}


module.exports = handleGameXtCommand;
