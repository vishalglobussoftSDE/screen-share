import { useEffect, useRef, useState } from "react";
import socket from "../services/socket";

function Home() {
  const [users, setUsers] = useState([]);
  const [roomId, setRoomId] = useState("");
  const localVideoRef = useRef(null);
  const peers = useRef({});
  let localStream;

  // Create or join room
  const createRoom = () => socket.emit("create-room");
  const joinRoom = () => roomId && socket.emit("join-room", roomId);

  useEffect(() => {
    socket.on("room-created", (id) => {
      setRoomId(id);
      console.log("Room created:", id);
    });

    socket.on("room-users", (ids) => {
      setUsers(ids);
    });

    // WebRTC signaling
    socket.on("webrtc-offer", async ({ fromSocketId, offer }) => {
      const pc = new RTCPeerConnection({
        iceServers: [{ urls: "stun:stun.l.google.com:19302" }],
      });
      peers.current[fromSocketId] = pc;

      localStream?.getTracks().forEach((track) => pc.addTrack(track, localStream));

      pc.onicecandidate = (e) => {
        if (e.candidate) {
          socket.emit("webrtc-ice-candidate", {
            targetSocketId: fromSocketId,
            candidate: e.candidate,
          });
        }
      };

      pc.ontrack = (e) => {
        const video = document.getElementById(`video-${fromSocketId}`);
        if (video) video.srcObject = e.streams[0];
      };

      await pc.setRemoteDescription(offer);
      const answer = await pc.createAnswer();
      await pc.setLocalDescription(answer);

      socket.emit("webrtc-answer", { targetSocketId: fromSocketId, answer });
    });

    socket.on("webrtc-answer", ({ fromSocketId, answer }) => {
      peers.current[fromSocketId].setRemoteDescription(answer);
    });

    socket.on("webrtc-ice-candidate", ({ fromSocketId, candidate }) => {
      peers.current[fromSocketId].addIceCandidate(candidate);
    });

    return () => socket.off();
  }, [localStream]);

  const startScreenShare = async () => {
    localStream = await navigator.mediaDevices.getDisplayMedia({ video: true, audio: false });
    localVideoRef.current.srcObject = localStream;

    users.forEach(async (id) => {
      if (id === socket.id) return;

      const pc = new RTCPeerConnection({
        iceServers: [{ urls: "stun:stun.l.google.com:19302" }],
      });
      peers.current[id] = pc;

      localStream.getTracks().forEach((track) => pc.addTrack(track, localStream));

      pc.onicecandidate = (e) => {
        if (e.candidate) {
          socket.emit("webrtc-ice-candidate", { targetSocketId: id, candidate: e.candidate });
        }
      };

      pc.ontrack = (e) => {
        const video = document.getElementById(`video-${id}`);
        if (video) video.srcObject = e.streams[0];
      };

      const offer = await pc.createOffer();
      await pc.setLocalDescription(offer);
      socket.emit("webrtc-offer", { targetSocketId: id, offer });
    });
  };

  return (
    <div style={{ padding: "20px", fontFamily: "Arial, sans-serif", maxWidth: "1000px", margin: "auto" }}>
      <h2 style={{ textAlign: "center", marginBottom: "20px" }}>🎥 Screen Share App</h2>

      <div style={{ display: "flex", justifyContent: "center", gap: "10px", marginBottom: "20px" }}>
        <button onClick={createRoom} style={buttonStyle}>Create Room</button>
        <input
          value={roomId}
          onChange={(e) => setRoomId(e.target.value)}
          placeholder="Room ID"
          style={inputStyle}
        />
        <button onClick={joinRoom} style={buttonStyle}>Join Room</button>
        <button onClick={startScreenShare} style={buttonStyle}>Start Screen Share</button>
      </div>

      <div style={{ display: "flex", flexWrap: "wrap", justifyContent: "center", gap: "15px" }}>
        <div style={{ textAlign: "center" }}>
          <p>You</p>
          <video ref={localVideoRef} autoPlay muted style={videoStyle} />
        </div>

        {users.map(
          (id) =>
            id !== socket.id && (
              <div key={id} style={{ textAlign: "center" }}>
                <p>{id}</p>
                <video id={`video-${id}`} autoPlay playsInline style={videoStyle} />
              </div>
            )
        )}
      </div>
    </div>
  );
}

// --- Styles ---
const buttonStyle = {
  padding: "8px 16px",
  borderRadius: "5px",
  border: "none",
  backgroundColor: "#101727",
  color: "white",
  cursor: "pointer",
  fontWeight: "bold",
};

const inputStyle = {
  padding: "8px",
  borderRadius: "5px",
  border: "1px solid #ccc",
  minWidth: "120px",
};

const videoStyle = {
  width: "300px",
  height: "200px",
  border: "2px solid #101727",
  borderRadius: "5px",
  objectFit: "cover",
};

export default Home;
