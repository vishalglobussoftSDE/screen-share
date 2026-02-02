import { useEffect, useRef, useState } from "react";
import { useParams, useNavigate } from "react-router-dom";
import socket from "../services/socket";

function Room() {
  const { roomId } = useParams();
  const navigate = useNavigate();
  const [users, setUsers] = useState([]);
  const localVideoRef = useRef(null);
  const peers = useRef({});
  const [sharing, setSharing] = useState(false);
  const userId = useRef(Math.random().toString(36).substring(2, 8));

  useEffect(() => {
    // Join room on load
    socket.emit("join-room", { roomId, userId: userId.current });

    socket.on("room-users", (ids) => setUsers(ids));
    socket.on("already-joined", () => alert("You are already in the room"));
    socket.on("error", (msg) => alert(msg));

    // WebRTC signaling
    socket.on("webrtc-offer", async ({ fromSocketId, offer }) => {
      if (peers.current[fromSocketId]) return;

      const pc = new RTCPeerConnection({ iceServers: [{ urls: "stun:stun.l.google.com:19302" }] });
      peers.current[fromSocketId] = pc;

      localVideoRef.current?.srcObject?.getTracks().forEach((track) => pc.addTrack(track, localVideoRef.current.srcObject));

      pc.onicecandidate = (e) => e.candidate && socket.emit("webrtc-ice-candidate", { targetSocketId: fromSocketId, candidate: e.candidate });
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
      peers.current[fromSocketId]?.setRemoteDescription(answer);
    });

    socket.on("webrtc-ice-candidate", ({ fromSocketId, candidate }) => {
      peers.current[fromSocketId]?.addIceCandidate(candidate);
    });

    return () => {
      // Cleanup on unmount
      stopScreenShare();
      socket.off();
    };
  }, [roomId]);

  const startScreenShare = async () => {
    if (sharing) return;
    const stream = await navigator.mediaDevices.getDisplayMedia({ video: true, audio: false });
    localVideoRef.current.srcObject = stream;
    setSharing(true);

    users.forEach(async (id) => {
      if (id === userId.current || peers.current[id]) return;

      const pc = new RTCPeerConnection({ iceServers: [{ urls: "stun:stun.l.google.com:19302" }] });
      peers.current[id] = pc;

      stream.getTracks().forEach((track) => pc.addTrack(track, stream));

      pc.onicecandidate = (e) => e.candidate && socket.emit("webrtc-ice-candidate", { targetSocketId: id, candidate: e.candidate });
      pc.ontrack = (e) => {
        const video = document.getElementById(`video-${id}`);
        if (video) video.srcObject = e.streams[0];
      };

      const offer = await pc.createOffer();
      await pc.setLocalDescription(offer);
      socket.emit("webrtc-offer", { targetSocketId: id, offer });
    });
  };

  const stopScreenShare = () => {
    if (localVideoRef.current?.srcObject) {
      localVideoRef.current.srcObject.getTracks().forEach((track) => track.stop());
      localVideoRef.current.srcObject = null;
      setSharing(false);
    }

    // Close all peer connections
    Object.values(peers.current).forEach((pc) => pc.close());
    peers.current = {};
  };

  const leaveRoom = () => {
    stopScreenShare();
    socket.emit("leave-room", { roomId, userId: userId.current });
    navigate("/"); // back to Landing
  };

  return (
    <div style={{ textAlign: "center", marginTop: "20px" }}>
      <h2>Room: {roomId}</h2>
      <p>Connected Users: {users.length}</p>

      <div>
        <button onClick={startScreenShare} disabled={sharing} style={buttonStyleShare}>Start Screen Share</button>
        <button onClick={leaveRoom} style={buttonStyleLeave}>Leave Room</button>
      </div>

      <div style={videoGridStyle}>
        <div style={videoWrapperStyle}>
          <p>You</p>
          <video ref={localVideoRef} autoPlay muted style={videoStyle} />
        </div>
        {users.map((id) =>
          id !== userId.current && (
            <div key={id} style={videoWrapperStyle}>
              <p>{id.slice(0, 6)}</p>
              <video id={`video-${id}`} autoPlay playsInline style={videoStyle} />
            </div>
          )
        )}
      </div>
    </div>
  );
}

const buttonStyleShare = {
  padding: "10px 20px",
  margin: "10px",
  borderRadius: "5px",
  border: "none",
  backgroundColor: "#101727",
  color: "white",
  fontWeight: "bold",
  cursor: "pointer",
};

const buttonStyleLeave = {
  padding: "10px 20px",
  margin: "10px",
  borderRadius: "5px",
  border: "none",
  backgroundColor: "red",
  color: "white",
  fontWeight: "bold",
  cursor: "pointer",
};

const videoGridStyle = { display: "flex", flexWrap: "wrap", justifyContent: "center", gap: "15px", marginTop: "20px" };
const videoWrapperStyle = { textAlign: "center" };
const videoStyle = { width: "300px", height: "200px", border: "2px solid #101727", borderRadius: "5px", objectFit: "cover" };

export default Room;
