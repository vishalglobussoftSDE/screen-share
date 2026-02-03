import http from "http";
import express from "express";
import cors from "cors";
import { Server } from "socket.io";

const app = express();
app.use(cors());
app.use(express.json());

app.get("/", (req, res) => res.send("Backend is running 🚀"));

const PORT = process.env.PORT || 5000;
const server = http.createServer(app);

const io = new Server(server, {
  cors: { origin: "*" },
  transports: ["websocket"],
});

// rooms: Map<roomId, Map<userId, socketId>>
const rooms = new Map();

const emitRoomUsers = (roomId) => {
  const users = rooms.get(roomId);
  if (!users) return;

  io.to(roomId).emit(
    "room-users",
    Array.from(users.entries()).map(([userId, socketId]) => ({
      userId,
      socketId,
    }))
  );
};

io.on("connection", (socket) => {
  console.log("🟢 Connected:", socket.id);

  /* -------- CREATE ROOM -------- */
  socket.on("create-room", () => {
    const roomId = Math.random().toString(36).substring(2, 8);
    rooms.set(roomId, new Map());
    socket.emit("room-created", roomId);
    console.log("📦 Room created:", roomId);
  });

  /* -------- JOIN ROOM -------- */
  socket.on("join-room", ({ roomId, userId }) => {
    if (!rooms.has(roomId)) {
      socket.emit("room-error", "Room does not exist");
      return;
    }

    const users = rooms.get(roomId);
    if (users.has(userId)) {
      socket.emit("already-joined");
      return;
    }

    users.set(userId, socket.id);
    socket.join(roomId);

    emitRoomUsers(roomId);
    console.log(`👥 ${userId} joined room ${roomId}`);
  });

  /* -------- WEBRTC SIGNALING -------- */
  socket.on("webrtc-offer", ({ targetSocketId, offer }) => {
    io.to(targetSocketId).emit("webrtc-offer", {
      fromSocketId: socket.id,
      offer,
    });
  });

  socket.on("webrtc-answer", ({ targetSocketId, answer }) => {
    io.to(targetSocketId).emit("webrtc-answer", {
      fromSocketId: socket.id,
      answer,
    });
  });

  socket.on("webrtc-ice-candidate", ({ targetSocketId, candidate }) => {
    io.to(targetSocketId).emit("webrtc-ice-candidate", {
      fromSocketId: socket.id,
      candidate,
    });
  });

  /* -------- CHAT -------- */
  socket.on("send-message", ({ roomId, message, userId }) => {
    socket.to(roomId).emit("receive-message", { message, userId });
  });

  /* -------- LEAVE ROOM (manual) -------- */
  socket.on("leave-room", ({ roomId, userId }) => {
    removeUserFromRoom(roomId, userId);
  });

  /* -------- DISCONNECT -------- */
  socket.on("disconnect", () => {
    for (const [roomId, users] of rooms.entries()) {
      for (const [userId, socketId] of users.entries()) {
        if (socketId === socket.id) {
          removeUserFromRoom(roomId, userId);
          break;
        }
      }
    }
    console.log("🔴 Disconnected:", socket.id);
  });

  const removeUserFromRoom = (roomId, userId) => {
    if (!rooms.has(roomId)) return;

    const users = rooms.get(roomId);
    users.delete(userId);
    socket.leave(roomId);

    if (users.size === 0) {
      rooms.delete(roomId);
      console.log(`🧹 Room deleted: ${roomId}`);
    } else {
      emitRoomUsers(roomId);
    }

    console.log(`❌ ${userId} left room ${roomId}`);
  };
});

server.listen(PORT, "0.0.0.0", () => {
  console.log(`🚀 Server running on port ${PORT}`);
});
