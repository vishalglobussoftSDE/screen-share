import { useState, useEffect } from "react";
import socket from "../services/socket"; // Always services/socket
import { createPeerConnection } from "../webrtc/peer";

// Global object to keep track of all peer connections
const peers = {};
let localStream = null;

function Home() {
  const [users, setUsers] = useState([]);
  const [roomId, setRoomId] = useState("");
  const [currentRoom, setCurrentRoom] = useState(null);

  // -----------------------------
  // SOCKET.IO LISTENERS
  // -----------------------------
  useEffect(() => {
    // Room created
    socket.on("room-created", (id) => setCurrentRoom(id));

    // Users update in room
    socket.on("room-users", (usersList) => {
      setUsers(usersList);

      usersList.forEach((userId) => {
        if (userId === socket.id || peers[userId]) return;

        const pc = createPeerConnection(userId, (stream) => {
          const videoEl = document.getElementById(`video-${userId}`);
          if (videoEl) videoEl.srcObject = stream;
        });

        peers[userId] = pc;

        // Add local stream tracks if available
        if (localStream) {
          localStream.getTracks().forEach((track) => pc.addTrack(track, localStream));
        }

        // Create offer and send to the new peer
        pc.createOffer().then(async (offer) => {
          await pc.setLocalDescription(offer);
          socket.emit("webrtc-offer", { targetSocketId: userId, offer });
        });
      });
    });

    // Receive offer from another peer
    socket.on("webrtc-offer", async ({ offer, fromSocketId }) => {
      if (!peers[fromSocketId]) {
        const pc = createPeerConnection(fromSocketId, (stream) => {
          const videoEl = document.getElementById(`video-${fromSocketId}`);
          if (videoEl) videoEl.srcObject = stream;
        });
        peers[fromSocketId] = pc;

        if (localStream) {
          localStream.getTracks().forEach((track) => pc.addTrack(track, localStream));
        }
      }

      const pc = peers[fromSocketId];
      await pc.setRemoteDescription(offer);
      const answer = await pc.createAnswer();
      await pc.setLocalDescription(answer);
      socket.emit("webrtc-answer", { targetSocketId: fromSocketId, answer });
    });

    // Receive answer to your offer
    socket.on("webrtc-answer", async ({ answer, fromSocketId }) => {
      const pc = peers[fromSocketId];
      if (!pc) return;
      await pc.setRemoteDescription(answer);
    });

    // ICE candidate exchange
    socket.on("webrtc-ice-candidate", async ({ candidate, fromSocketId }) => {
      const pc = peers[fromSocketId];
      if (!pc) return;
      await pc.addIceCandidate(candidate);
    });

    return () => {
      socket.off("room-created");
      socket.off("room-users");
      socket.off("webrtc-offer");
      socket.off("webrtc-answer");
      socket.off("webrtc-ice-candidate");
    };
  }, []);

  // -----------------------------
  // FUNCTIONS
  // -----------------------------
  const createRoom = () => socket.emit("create-room");

  const joinRoom = () => {
    if (!roomId) return;
    socket.emit("join-room", roomId);
    setCurrentRoom(roomId);
  };

  const startScreenShare = async () => {
    try {
      const screenStream = await navigator.mediaDevices.getDisplayMedia({ video: true, audio: false });
      localStream = screenStream;

      // Attach local video
      const myVideo = document.getElementById("video-self");
      if (myVideo) myVideo.srcObject = localStream;

      // Replace/add tracks for all peers
      Object.entries(peers).forEach(([socketId, pc]) => {
        localStream.getTracks().forEach((track) => {
          const sender = pc.getSenders().find((s) => s.track?.kind === track.kind);
          if (sender) {
            sender.replaceTrack(track);
          } else {
            pc.addTrack(track, localStream);
          }
        });
      });
    } catch (err) {
      console.error("Screen share failed:", err);
    }
  };

  // -----------------------------
  // JSX
  // -----------------------------
  return (
    <div style={{ padding: 20 }}>
      {!currentRoom ? (
        <>
          <button onClick={createRoom}>Create Room</button>
          <input
            placeholder="Enter Room ID"
            value={roomId}
            onChange={(e) => setRoomId(e.target.value)}
            style={{ marginLeft: 10 }}
          />
          <button onClick={joinRoom} style={{ marginLeft: 10 }}>
            Join Room
          </button>
        </>
      ) : (
        <>
          <h3>Room ID: {currentRoom}</h3>
          <p>Users in room: {users.length}</p>

          {/* Screen Share Button */}
          <button onClick={startScreenShare}>Share Screen</button>

          {/* Your local video */}
          <video
            id="video-self"
            autoPlay
            muted
            playsInline
            style={{ width: "400px", border: "2px solid green", margin: "10px" }}
          />

          {/* Remote peers video */}
          {users.map(
            (id) =>
              id !== socket.id && (
                <video
                  key={id}
                  id={`video-${id}`}
                  autoPlay
                  playsInline
                  style={{ width: "400px", border: "1px solid black", margin: "10px" }}
                />
              )
          )}
        </>
      )}
    </div>
  );
}

export default Home;
