const state = require('../../state');
const debug = require('../../debug/Debug');
const { users } = state;

// Function to update user status and notify their buddies
function updateUserStatus(userId, newStatus) {
    if (!users[userId]) {
        console.log(`[BUDDYLISTXT_LOG] updateUserStatus failed - user ${userId} not found`);
        return;
    }

    // Only update if status is actually changing to prevent unnecessary notifications
    if (users[userId].status === newStatus) {
        return;
    }

    // Update the user's status
    users[userId].status = newStatus;
    
    // Get the user's buddy list
    const buddyList = users[userId].buddyList || [];
    
    // Notify all buddies about the status change
    for (const buddyId of buddyList) {
        if (users[buddyId] && users[buddyId].socket) {
            // Send buddy list update to the buddy
            const buddyUpdateMsg = JSON.stringify({
                "t": "xt",
                "b": {
                    "action": "xtRes",
                    "r": -1,
                    "o": {
                        "_cmd": "buddyStatusChanged",
                        "username": users[userId].username,
                        "userRefId": userId,
                        "status": newStatus,
                        "avatarId": users[userId].avatarId || 0,
                        "nmp": users[userId].nmp || 0
                    }
                }
            }) + '\x00';
            
            users[buddyId].socket.write(buddyUpdateMsg);
        }
    }
    
    console.log(`[BUDDYLISTXT_LOG] updateUserStatus - user ${userId} (${users[userId].username}) status updated to: ${newStatus}`);
}

// Function to send buddy list to a user
function sendBuddyList(socket, userId) {
    if (!users[userId]) {
        console.log(`[BUDDYLISTXT_LOG] sendBuddyList failed - user ${userId} not found`);
        return;
    }
    
    const buddyList = users[userId].buddyList || [];
    const buddyDetails = [];
    
    // Build the buddy list with current statuses
    for (const buddyId of buddyList) {
        if (users[buddyId]) {
            buddyDetails.push({
                "username": users[buddyId].username,
                "userRefId": buddyId,
                "status": users[buddyId].status || 'online',
                "avatarId": users[buddyId].avatarId || 0,
                "nmp": users[buddyId].nmp || 0
            });
        }
    }
    
    // Send the buddy list to the user
    const buddyListMsg = JSON.stringify({
        "t": "xt",
        "b": {
            "action": "xtRes",
            "r": -1,
            "o": {
                "_cmd": "buddyListLoaded",
                "buddyList": buddyDetails
            }
        }
    }) + '\x00';
    
    socket.write(buddyListMsg);
    console.log(`[BUDDYLISTXT_LOG] sendBuddyList - sent to user ${userId}, ${buddyDetails.length} buddies`);
}

// Function to send recently played list to a user
function sendRecentlyPlayedList(socket, userId) {
    if (!users[userId]) {
        console.log(`[BUDDYLISTXT_LOG] sendRecentlyPlayedList failed - user ${userId} not found`);
        return;
    }
    
    // For now, return an empty list - in a real implementation, this would come from a database
    const recentlyPlayedList = [];
    
    // Send the recently played list to the user
    const recentlyPlayedListMsg = JSON.stringify({
        "t": "xt",
        "b": {
            "action": "xtRes",
            "r": -1,
            "o": {
                "_cmd": "recentlyPlayedListLoaded",
                "recentlyPlayedList": recentlyPlayedList
            }
        }
    }) + '\x00';
    
    socket.write(recentlyPlayedListMsg);
    console.log(`[BUDDYLISTXT_LOG] sendRecentlyPlayedList - sent to user ${userId}, ${recentlyPlayedList.length} recently played users`);
}

// Handle buddyListXt commands
function handleBuddyCommand(socket, command, params) {
    console.log(`[BUDDYLISTXT_LOG] Handling buddyListXt command: ${command}`, params);
    
    // Log the extension request for debugging
    debug.logExtensionRequest('buddyListXt', command, params, {
        remoteAddress: socket.remoteAddress,
        remotePort: socket.remotePort,
        userId: socket.userId,
        userName: socket.userName
    });

    let response = '';
    
    switch (command) {
        case 'getBuddyList':
            // Send the user's buddy list
            sendBuddyList(socket, socket.userId);
            break;
            
        case 'inviteBuddy':
            // Invite a user to be a buddy
            const buddyToInvite = params.buddy;
            let buddyIdToInvite = null;
            
            // Find the buddy's user ID by username (case-insensitive)
            for (const id in users) {
                if (users[id].username.toLowerCase() === buddyToInvite.toLowerCase()) {
                    buddyIdToInvite = id;
                    break;
                }
            }
            
            if (buddyIdToInvite) {
                // Check if they're already buddies
                if (!users[socket.userId].buddyList) {
                    users[socket.userId].buddyList = [];
                }
                if (!users[buddyIdToInvite].buddyList) {
                    users[buddyIdToInvite].buddyList = [];
                }
                
                if (users[socket.userId].buddyList.includes(buddyIdToInvite)) {
                    // Already buddies
                    response = JSON.stringify({
                        "t": "xt",
                        "b": {
                            "action": "xtRes",
                            "r": -1,
                            "o": {
                                "_cmd": "buddyInvitationError",
                                "msg": "Already in buddy list"
                            }
                        }
                    }) + '\x00';
                } else {
                    // Send invitation request to the buddy
                    if (users[buddyIdToInvite].socket) {
                        const invitationMsg = JSON.stringify({
                            "t": "xt",
                            "b": {
                                "action": "xtRes",
                                "r": -1,
                                "o": {
                                    "_cmd": "buddyInvitationRequest",
                                    "inviter": socket.userName
                                }
                            }
                        }) + '\x00';
                        
                        users[buddyIdToInvite].socket.write(invitationMsg);
                        
                        // Respond to the inviter
                        response = JSON.stringify({
                            "t": "xt",
                            "b": {
                                "action": "xtRes",
                                "r": -1,
                                "o": {
                                    "_cmd": "buddyInvited",
                                    "username": buddyToInvite
                                }
                            }
                        }) + '\x00';
                    } else {
                        // Buddy is offline, send offline invitation
                        response = JSON.stringify({
                            "t": "xt",
                            "b": {
                                "action": "xtRes",
                                "r": -1,
                                "o": {
                                    "_cmd": "buddyInvitedOffline",
                                    "offlineInvitee": {
                                        "username": buddyToInvite
                                    }
                                }
                            }
                        }) + '\x00';
                    }
                }
            } else {
                response = JSON.stringify({
                    "t": "xt",
                    "b": {
                        "action": "xtRes",
                        "r": -1,
                        "o": {
                            "_cmd": "buddyDoesNotExist",
                            "username": buddyToInvite
                        }
                    }
                }) + '\x00';
            }
            break;
            
        case 'replyBuddyInvitation':
            // Reply to a buddy invitation (accept/reject)
            const inviterName = params.buddy;
            const accept = params.accept;
            let inviterId = null;
            
            // Find the inviter's user ID (case-insensitive)
            for (const id in users) {
                if (users[id].username.toLowerCase() === inviterName.toLowerCase()) {
                    inviterId = id;
                    break;
                }
            }
            
            if (inviterId) {
                if (accept) {
                    // Accept the invitation - add both users to each other's buddy lists
                    if (!users[socket.userId].buddyList) {
                        users[socket.userId].buddyList = [];
                    }
                    if (!users[inviterId].buddyList) {
                        users[inviterId].buddyList = [];
                    }
                    
                    // Add to both buddy lists if not already there
                    if (!users[socket.userId].buddyList.includes(inviterId)) {
                        users[socket.userId].buddyList.push(inviterId);
                    }
                    if (!users[inviterId].buddyList.includes(socket.userId)) {
                        users[inviterId].buddyList.push(socket.userId);
                    }
                    
                    // Notify the inviter that the invitation was accepted
                    if (users[inviterId].socket) {
                        const acceptMsg = JSON.stringify({
                            "t": "xt",
                            "b": {
                                "action": "xtRes",
                                "r": -1,
                                "o": {
                                    "_cmd": "buddyInvitationAccepted",
                                    "username": socket.userName,
                                    "userRefId": socket.userId,
                                    "avatarId": users[socket.userId].avatarId || 0,
                                    "status": users[socket.userId].status || 'online',
                                    "nmp": users[socket.userId].nmp || 0
                                }
                            }
                        }) + '\x00';
                        
                        users[inviterId].socket.write(acceptMsg);
                    }
                    
                    // Send updated buddy list to both users
                    sendBuddyList(users[inviterId].socket, inviterId);
                    sendBuddyList(socket, socket.userId);
                    
                    response = JSON.stringify({
                        "t": "xt",
                        "b": {
                            "action": "xtRes",
                            "r": -1,
                            "o": {
                                "_cmd": "buddyInvitationAccepted",
                                "username": inviterName,
                                "userRefId": inviterId
                            }
                        }
                    }) + '\x00';
                } else {
                    // Reject the invitation
                    if (users[inviterId].socket) {
                        const rejectMsg = JSON.stringify({
                            "t": "xt",
                            "b": {
                                "action": "xtRes",
                                "r": -1,
                                "o": {
                                    "_cmd": "buddyInvitationRejected",
                                    "username": socket.userName
                                }
                            }
                        }) + '\x00';
                        
                        users[inviterId].socket.write(rejectMsg);
                    }
                    
                    response = JSON.stringify({
                        "t": "xt",
                        "b": {
                            "action": "xtRes",
                            "r": -1,
                            "o": {
                                "_cmd": "buddyInvitationRejected",
                                "username": inviterName
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
                            "_cmd": "buddyInvitationError",
                            "msg": "Inviter not found"
                        }
                    }
                }) + '\x00';
            }
            break;
            
        case 'removeBuddy':
            // Remove a buddy from the list
            const buddyRefId = params.buddyRefId;
            
            if (users[socket.userId].buddyList && users[socket.userId].buddyList.includes(buddyRefId)) {
                // Remove from current user's buddy list
                users[socket.userId].buddyList = users[socket.userId].buddyList.filter(id => id !== buddyRefId);
                
                // Remove current user from the buddy's buddy list
                if (users[buddyRefId] && users[buddyRefId].buddyList) {
                    users[buddyRefId].buddyList = users[buddyRefId].buddyList.filter(id => id !== socket.userId);
                }
                
                // Notify both users of the removal
                if (users[buddyRefId] && users[buddyRefId].socket) {
                    const removeMsg = JSON.stringify({
                        "t": "xt",
                        "b": {
                            "action": "xtRes",
                            "r": -1,
                            "o": {
                                "_cmd": "buddyRemoved",
                                "msg": `${users[socket.userId].username} removed you from their buddy list`,
                                "userRefId": socket.userId,
                                "buddyRefId": buddyRefId
                            }
                        }
                    }) + '\x00';
                    
                    users[buddyRefId].socket.write(removeMsg);
                }
                
                // Send updated buddy list to current user
                sendBuddyList(socket, socket.userId);
                
                response = JSON.stringify({
                    "t": "xt",
                    "b": {
                        "action": "xtRes",
                        "r": -1,
                        "o": {
                            "_cmd": "buddyRemoved",
                            "msg": `Removed from buddy list`,
                            "userRefId": socket.userId,
                            "buddyRefId": buddyRefId
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
                            "_cmd": "buddyRemoveError",
                            "msg": "Buddy not found in list"
                        }
                    }
                }) + '\x00';
            }
            break;
            
        case 'loadInvitations':
            // Load pending buddy invitations
            // For now, just send that there are no invitations
            // In a real implementation, this would check a database for pending invitations
            response = JSON.stringify({
                "t": "xt",
                "b": {
                    "action": "xtRes",
                    "r": -1,
                    "o": {
                        "_cmd": "noInvitations"
                    }
                }
            }) + '\x00';
            break;
            
        case 'getRecentlyPlayedList':
            // Send the user's recently played list
            sendRecentlyPlayedList(socket, socket.userId);
            break;
            
        default:
            // Log invalid buddyListXt command
            debug.logInvalidRequest('buddyListXt', command, params, {
                remoteAddress: socket.remoteAddress,
                remotePort: socket.remotePort,
                userId: socket.userId,
                userName: socket.userName
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

module.exports = {
    handleBuddyCommand,
    updateUserStatus
};