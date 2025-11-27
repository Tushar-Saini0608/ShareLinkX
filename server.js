

// server.js - Enhanced version
const express = require("express");
const http = require("http");
const { Server } = require("socket.io");
const crypto = require("crypto");
const cors = require("cors");

const app = express();

app.use(
  cors({
    origin: "*",
    methods: ["GET", "POST"],
    credentials: true
  })
);

app.use(express.static("public"));

const server = http.createServer(app);

const io = new Server(server, {
  cors: {
    origin: "*",
    methods: ["GET", "POST"]
  },
  transports: ["websocket", "polling"],
  allowEIO3: true,
  pingTimeout: 60000,
  pingInterval: 25000
});

/* Room storage */
const rooms = new Map();

function genId() {
  return crypto.randomBytes(3).toString("base64url");
}

io.on("connection", (socket) => {
  console.log("🔗 Client connected:", socket.id);

  socket.on("create", (cb) => {
    const id = genId();
    rooms.set(id, [socket.id]);
    socket.join(id);
    console.log("📌 Room created:", id, "by", socket.id);
    cb({ room: id });
  });

  socket.on("join", ({ room }, cb) => {
    const participants = rooms.get(room) || [];

    console.log("🚪 Join attempt for room:", room, "by", socket.id);
    console.log("   Current participants:", participants);

    if (participants.length === 0) {
      // Room doesn't exist, create it
      rooms.set(room, [socket.id]);
      socket.join(room);
      console.log("✅ Room auto-created and joined");
      cb({ ok: true, isInitiator: true });
      return;
    }

    if (participants.length >= 2) {
      console.log("❌ Room full");
      cb({ ok: false, error: "room-full" });
      return;
    }

    // Join existing room
    participants.push(socket.id);
    rooms.set(room, participants);
    socket.join(room);

    console.log("👥 Peer joined room:", room);
    console.log("   Updated participants:", participants);

    // Notify the creator that peer joined
    socket.to(room).emit("peer-joined", { id: socket.id });

    cb({ ok: true, isInitiator: false });
  });

  socket.on("signal", ({ room, type, data }) => {
    
    
    // Forward signal to other peer(s) in the room
    socket.to(room).emit("signal", { type, data });
  });

  socket.on("disconnect", () => {
    console.log("❌ Disconnected:", socket.id);

    // Remove from all rooms and notify peers
    for (const [roomId, participants] of rooms.entries()) {
      const idx = participants.indexOf(socket.id);
      if (idx !== -1) {
        participants.splice(idx, 1);
        
        console.log(`   Removed from room [${roomId}]`);
        
        // Notify other peers
        socket.to(roomId).emit("peer-left", { id: socket.id });

        // Clean up empty rooms
        if (participants.length === 0) {
          rooms.delete(roomId);
          console.log(`   Room [${roomId}] deleted (empty)`);
        } else {
          rooms.set(roomId, participants);
        }
      }
    }
  });

  // Heartbeat to keep connection alive
  socket.on("ping", () => {
    socket.emit("pong");
  });
});

// Health check endpoint
app.get("/health", (req, res) => {
  res.json({ 
    status: "ok", 
    rooms: rooms.size,
    connections: io.sockets.sockets.size 
  });
});

// Debug endpoint to see active rooms
app.get("/debug/rooms", (req, res) => {
  const roomList = {};
  rooms.forEach((participants, roomId) => {
    roomList[roomId] = participants;
  });
  res.json(roomList);
});

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => {
  console.log(`🚀 Server running on port ${PORT}`);
  console.log(`📍 Local: http://localhost:${PORT}`);
});

// Graceful shutdown
process.on('SIGTERM', () => {
  console.log('SIGTERM signal received: closing HTTP server');
  server.close(() => {
    console.log('HTTP server closed');
  });
});