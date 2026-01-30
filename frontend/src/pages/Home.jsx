import { useEffect, useRef, useState } from "react";
import socket from "../services/socket";

function Home() {
  const [users, setUsers] = useState([]);
  const [roomId, setRoomId] = useState("");
  const localVideoRef = useRef(null);
  const peers = useRef({});
  let localStream;

  // --- Join or create room
  const createRoom = () => {
    socket.emit("create-room");
  };

  const joinRoom = () => {
    if (roomId) socket.emit("join-room", roomId);
  };

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
    <div>
      <h2>Screen Share</h2>
      <button onClick={createRoom}>Create Room</button>
      <input value={roomId} onChange={(e) => setRoomId(e.target.value)} placeholder="Room ID" />
      <button onClick={joinRoom}>Join Room</button>
      <button onClick={startScreenShare}>Start Screen Share</button>

      <video ref={localVideoRef} autoPlay muted style={{ width: "400px", border: "2px solid green" }} />
      {users.map(
        (id) =>
          id !== socket.id && (
            <video key={id} id={`video-${id}`} autoPlay playsInline style={{ width: "400px", border: "1px solid black", margin: "10px" }} />
          )
      )}
    </div>
  );
}

export default Home;
