const state = require('../../state');
const user = require('../../user');
const { updateUserStatus } = require('./buddyXt'); // Import the buddy status update function
const debug = require('../../debug/Debug');
const { users } = state;
const { saveUserData } = user;

function handleTradeCommand(socket, command, params) {
    console.log(`Handling trade command: ${command}, params:`, params);

    // Log the trade request for debugging
    debug.logExtensionRequest('tradeXt', command, params, {
        remoteAddress: socket.remoteAddress,
        remotePort: socket.remotePort,
        userId: socket.userId,
        userName: socket.userName,
        playerId: socket.playerId
    });

    let response = '';

    switch (command) {
        case 'createTrade':
            // Create a new trade
            response = `{"t":"xt","b":{"action":"xtRes","r":-1,"o":{"_cmd":"tradeCreated","tradeId":"${Date.now()}","creatorId":"${socket.userId}","creatorName":"${socket.userName}"}}}\x00`;

            // Update user's status to "in trade" and notify their buddies
            updateUserStatus(socket.userId, 'in trade');
            break;

        case 'inviteUserToTrade':
            // Invite a user to trade
            const inviteeName = params.username;
            
            // Find the user ID for the invitee
            let inviteeId = null;
            for (const userId in users) {
                if (users[userId].username === inviteeName) {
                    inviteeId = userId;
                    break;
                }
            }

            if (inviteeId) {
                // Send invitation to the invitee
                const invitationMsg = `{"t":"xt","b":{"action":"xtRes","r":-1,"o":{"_cmd":"tradeInvitationRequest","inviter":{"username":"${socket.userName}","userRefId":"${socket.playerId}"}}}}\x00`;

                // In a real implementation, we would send this to the invitee's socket
                // For now, we'll just acknowledge the request
                response = `{"t":"xt","b":{"action":"xtRes","r":-1,"o":{"_cmd":"tradeInvitationSent","invitedUser":"${inviteeName}"}}}\x00`;
            } else {
                response = `{"t":"xt","b":{"action":"xtRes","r":-1,"o":{"_cmd":"tradeError","errorMessage":"User not found"}}}\x00`;
            }
            break;

        case 'replyInvitationToTrade':
            // Reply to a trade invitation (accept/decline)
            const accept = params.accept;
            const tradeId = params.tradeId;

            if (accept) {
                // Update user's status to "in trade" and notify their buddies
                updateUserStatus(socket.userId, 'in trade');

                response = `{"t":"xt","b":{"action":"xtRes","r":-1,"o":{"_cmd":"tradeInvitationAccepted","tradeId":"${tradeId}","accepterId":"${socket.userId}","accepterName":"${socket.userName}"}}}\x00`;
            } else {
                response = `{"t":"xt","b":{"action":"xtRes","r":-1,"o":{"_cmd":"tradeInvitationDeclined","tradeId":"${tradeId}","declinerId":"${socket.userId}","declinerName":"${socket.userName}"}}}\x00`;
            }
            break;

        case 'cancelTradeInvitation':
            // Cancel a trade invitation
            response = `{"t":"xt","b":{"action":"xtRes","r":-1,"o":{"_cmd":"tradeInvitationCancelled"}}}\x00`;
            break;

        case 'joinAndGetCollections':
            // Join trade and get collections
            response = `{"t":"xt","b":{"action":"xtRes","r":-1,"o":{"_cmd":"collectionsRetrieved","collections":[]}}}\x00`;
            break;

        case 'startTrade':
            // Start the trade
            response = `{"t":"xt","b":{"action":"xtRes","r":-1,"o":{"_cmd":"tradeStarted","tradeId":"${params.tradeId}"}}}\x00`;
            break;

        case 'addToCart':
            // Add item to trade cart
            response = `{"t":"xt","b":{"action":"xtRes","r":-1,"o":{"_cmd":"itemAddedToCart","itemId":"${params.itemId}","cartSize":1}}}\x00`;
            break;

        case 'removeFromCart':
            // Remove item from trade cart
            response = `{"t":"xt","b":{"action":"xtRes","r":-1,"o":{"_cmd":"itemRemovedFromCart","itemId":"${params.itemId}","cartSize":0}}}\x00`;
            break;

        case 'makeOffer':
            // Make an offer in the trade
            response = `{"t":"xt","b":{"action":"xtRes","r":-1,"o":{"_cmd":"offerMade","offerId":"${Date.now()}"}}}\x00`;
            break;

        case 'confirmTransaction':
            // Confirm the transaction
            response = `{"t":"xt","b":{"action":"xtRes","r":-1,"o":{"_cmd":"transactionConfirmed","result":"success"}}}\x00`;

            // Update user's status back to "online" and notify their buddies
            updateUserStatus(socket.userId, 'online');
            break;

        case 'quitTrade':
            // Quit the trade
            response = `{"t":"xt","b":{"action":"xtRes","r":-1,"o":{"_cmd":"tradeQuit","result":"success"}}}\x00`;

            // Update user's status back to "online" and notify their buddies
            updateUserStatus(socket.userId, 'online');
            break;

        case 'getBadgeList':
            // Return empty badge list for trade
            response = `{"t":"xt","b":{"action":"xtRes","r":-1,"o":{"_cmd":"tradeBadgeList","badges":[]}}}\x00`;
            break;

        default:
            // Log invalid tradeXt command
            debug.logInvalidRequest('tradeXt', command, params, {
                remoteAddress: socket.remoteAddress,
                remotePort: socket.remotePort,
                userId: socket.userId,
                userName: socket.userName,
                playerId: socket.playerId
            });
            response = `{"t":"xt","b":{"action":"xtRes","r":-1,"o":{"_cmd":"unknownCommand"}}}\x00`;
            break;
    }

    socket.write(response);
}

module.exports = handleTradeCommand;