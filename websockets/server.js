const WebSocket = require("ws");

const wss = new WebSocket.Server({
    port: 8000
});

console.log("WebSocket is running on port 8000");

wss.on("connection", (socket) => {

    console.log("Client connected");

    socket.on("message", (message) => {

        const data = JSON.parse(message.toString());

        // Normal chat message
        if (data.type === "message") {

            console.log("Type:", data.type);
            console.log("Username:", data.username);
            console.log("Text:", data.text);

        }

        // User is typing
        if (data.type === "typing") {

            console.log("Type:", data.type);
            console.log("Username:", data.username);

        }

        // User stopped typing
        if (data.type === "stop_typing") {

            console.log("Type:", data.type);
            console.log("Username:", data.username);

        }

        // Send the event to all connected clients
        wss.clients.forEach((client) => {

            if (client.readyState === WebSocket.OPEN) {

                client.send(JSON.stringify(data));

            }

        });

    });

    socket.on("close", () => {

        console.log("Client disconnected");

    });

});