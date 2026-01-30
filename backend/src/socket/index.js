const rooms = new Map();
// roomId -> Set of socketIds

export default function registerSockets(io) {
  io.on("connection", (socket) => {
    console.log("🟢 Connected:", socket.id);

    // 🔹 Create a new room
    socket.on("create-room", () => {
      const roomId = Math.random().toString(36).substring(2, 8);

      rooms.set(roomId, new Set([socket.id]));
      socket.join(roomId);

      socket.emit("room-created", roomId);
      console.log(`📦 Room created: ${roomId}`);
    });

    // 🔹 Join an existing room
    socket.on("join-room", (roomId) => {
      if (!rooms.has(roomId)) {
        socket.emit("error", "Room does not exist");
        return;
      }

      rooms.get(roomId).add(socket.id);
      socket.join(roomId);

      io.to(roomId).emit(
        "room-users",
        Array.from(rooms.get(roomId))
      );

      console.log(`👥 ${socket.id} joined room ${roomId}`);
    });

    // 🔹 Handle disconnect
    socket.on("disconnect", () => {
      for (const [roomId, users] of rooms) {
        if (users.has(socket.id)) {
          users.delete(socket.id);

          if (users.size === 0) {
            rooms.delete(roomId);
            console.log(`🧹 Room deleted: ${roomId}`);
          } else {
            io.to(roomId).emit(
              "room-users",
              Array.from(users)
            );
          }
        }
      }

      console.log("🔴 Disconnected:", socket.id);
    });
    // 🔹 WebRTC signaling events

    // offer sent from one peer
    socket.on("webrtc-offer", ({ targetSocketId, offer }) => {
      io.to(targetSocketId).emit("webrtc-offer", {
        from: socket.id,
        offer,
      });
    });

    // answer sent from one peer
    socket.on("webrtc-answer", ({ targetSocketId, answer }) => {
      io.to(targetSocketId).emit("webrtc-answer", {
        from: socket.id,
        answer,
      });
    });

    // ICE candidate
    socket.on("webrtc-ice-candidate", ({ targetSocketId, candidate }) => {
      io.to(targetSocketId).emit("webrtc-ice-candidate", {
        from: socket.id,
        candidate,
      });
    });

  });
}
