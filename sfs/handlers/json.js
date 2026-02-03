/**
 * SFS JSON message handler - dispatches to extension handler.
 */

const handleExtensionCommand = require('./extension');

function handleJsonMessage(socket, message) {
    try {
        const obj = JSON.parse(message);
        const msgType = obj.t;

        if (msgType === 'xt') {
            const body = obj.b;
            const extension = body.x;
            const command = body.c;

            console.log(`Extension command: ${extension}.${command}`);

            handleExtensionCommand(socket, extension, command, body.p);
        }
    } catch (e) {
        console.error('Error parsing JSON message:', e);
    }
}

module.exports = handleJsonMessage;
