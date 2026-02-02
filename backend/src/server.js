import http from "http";
import { Server } from "socket.io";
import express from "express";
import cors from "cors";

const app = express();
app.use(cors());
app.use(express.json());

const PORT = process.env.PORT || 5000;

app.get("/health", (req, res) => {
  res.json({ message: "Backend is healthy ✅" });
});

const httpServer = http.createServer(app);

const io = new Server(httpServer, {
  cors: { origin: "*" },
  transports: ["websocket"], // ensures WSS works on deployed HTTPS frontend
});

const rooms = {};

io.on("connection", (socket) => {
  console.log("🟢 Connected:", socket.id);

  socket.on("create-room", () => {
    const roomId = Math.random().toString(36).substring(2, 8);
    rooms[roomId] = [socket.id];
    socket.join(roomId);
    socket.emit("room-created", roomId);
    io.to(roomId).emit("room-users", rooms[roomId]);
    console.log("📦 Room created:", roomId);
  });

  socket.on("join-room", (roomId) => {
    if (!rooms[roomId]) rooms[roomId] = [];
    if (!rooms[roomId].includes(socket.id)) {
      rooms[roomId].push(socket.id);
      socket.join(roomId);
      io.to(roomId).emit("room-users", rooms[roomId]);
      console.log(`👥 ${socket.id} joined room ${roomId}`);
    }
  });

  socket.on("webrtc-offer", ({ targetSocketId, offer }) => {
    io.to(targetSocketId).emit("webrtc-offer", { fromSocketId: socket.id, offer });
  });

  socket.on("webrtc-answer", ({ targetSocketId, answer }) => {
    io.to(targetSocketId).emit("webrtc-answer", { fromSocketId: socket.id, answer });
  });

  socket.on("webrtc-ice-candidate", ({ targetSocketId, candidate }) => {
    io.to(targetSocketId).emit("webrtc-ice-candidate", { fromSocketId: socket.id, candidate });
  });

  socket.on("disconnect", () => {
    for (const roomId in rooms) {
      rooms[roomId] = rooms[roomId].filter((id) => id !== socket.id);
      io.to(roomId).emit("room-users", rooms[roomId]);
    }
    console.log("🔴 Disconnected:", socket.id);
  });
});

httpServer.listen(PORT, "0.0.0.0", () => {
  console.log(`🚀 Server running on http://localhost:${PORT}`);
});
