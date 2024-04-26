// websocket/index.js
const WebSocket = require("ws");

const wss = new WebSocket.Server({ port: 8081 });

wss.on("connection", function connection(ws) {
  ws.on("error", console.error);

  ws.on("message", function message(data) {
    console.log("received: %s", data);
  });

  ws.send("something");
});
