import { useEffect, useRef, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import socket from "../services/socket";

function Room() {
  const { roomId } = useParams();
  const navigate = useNavigate();

  const [users, setUsers] = useState([]);
  const [sharing, setSharing] = useState(false);

  const localVideoRef = useRef(null);
  const peers = useRef({});
  const localStreamRef = useRef(null);

  /* ---------------- JOIN ROOM ---------------- */
  useEffect(() => {
    if (!roomId) return;

    socket.emit("join-room", roomId);

    socket.on("room-users", (ids) => {
      setUsers(ids);
    });

    socket.on("error", (msg) => {
      alert(msg);
      navigate("/");
    });

    return () => {
      socket.off("room-users");
      socket.off("error");
    };
  }, [roomId, navigate]);

  /* ---------------- WEBRTC SIGNALING ---------------- */
  useEffect(() => {
    socket.on("webrtc-offer", async ({ fromSocketId, offer }) => {
      if (peers.current[fromSocketId]) return;

      const pc = createPeer(fromSocketId);
      await pc.setRemoteDescription(offer);

      const answer = await pc.createAnswer();
      await pc.setLocalDescription(answer);

      socket.emit("webrtc-answer", {
        targetSocketId: fromSocketId,
        answer,
      });
    });

    socket.on("webrtc-answer", ({ fromSocketId, answer }) => {
      peers.current[fromSocketId]?.setRemoteDescription(answer);
    });

    socket.on("webrtc-ice-candidate", ({ fromSocketId, candidate }) => {
      peers.current[fromSocketId]?.addIceCandidate(candidate);
    });

    return () => socket.off();
  }, []);

  /* ---------------- PEER CONNECTION ---------------- */
  const createPeer = (targetSocketId) => {
    const pc = new RTCPeerConnection({
      iceServers: [{ urls: "stun:stun.l.google.com:19302" }],
    });

    peers.current[targetSocketId] = pc;

    localStreamRef.current?.getTracks().forEach((track) =>
      pc.addTrack(track, localStreamRef.current)
    );

    pc.onicecandidate = (e) => {
      if (e.candidate) {
        socket.emit("webrtc-ice-candidate", {
          targetSocketId,
          candidate: e.candidate,
        });
      }
    };

    pc.ontrack = (e) => {
      const video = document.getElementById(`video-${targetSocketId}`);
      if (video) video.srcObject = e.streams[0];
    };

    return pc;
  };

  /* ---------------- START SCREEN SHARE ---------------- */
  const startScreenShare = async () => {
    if (sharing) return;

    const stream = await navigator.mediaDevices.getDisplayMedia({
      video: true,
      audio: false,
    });

    localStreamRef.current = stream;
    localVideoRef.current.srcObject = stream;
    setSharing(true);

    users.forEach(async (id) => {
      if (id === socket.id || peers.current[id]) return;

      const pc = createPeer(id);
      const offer = await pc.createOffer();
      await pc.setLocalDescription(offer);

      socket.emit("webrtc-offer", {
        targetSocketId: id,
        offer,
      });
    });

    stream.getVideoTracks()[0].onended = stopScreenShare;
  };

  /* ---------------- STOP SCREEN SHARE ---------------- */
  const stopScreenShare = () => {
    localStreamRef.current?.getTracks().forEach((t) => t.stop());
    localStreamRef.current = null;
    setSharing(false);
  };

  /* ---------------- LEAVE ROOM ---------------- */
  const leaveRoom = () => {
    Object.values(peers.current).forEach((pc) => pc.close());
    peers.current = {};
    socket.disconnect();
    navigate("/");
  };

  /* ---------------- UI ---------------- */
  return (
    <div style={container}>
      {/* Top Bar */}
      <div style={topBar}>
        <span>Room: <b>{roomId}</b></span>
        <button onClick={leaveRoom} style={dangerBtn}>Leave</button>
      </div>

      {/* Videos */}
      <div style={videoGrid}>
        <div style={videoBox}>
          <p>You</p>
          <video ref={localVideoRef} autoPlay muted style={video} />
        </div>

        {users.map(
          (id) =>
            id !== socket.id && (
              <div key={id} style={videoBox}>
                <p>{id.slice(0, 6)}</p>
                <video id={`video-${id}`} autoPlay playsInline style={video} />
              </div>
            )
        )}
      </div>

      {/* Controls */}
      <div style={controls}>
        <button onClick={startScreenShare} disabled={sharing} style={btn}>
          {sharing ? "Sharing..." : "Start Screen Share"}
        </button>
      </div>
    </div>
  );
}

/* ---------------- STYLES ---------------- */
const container = { padding: 20, maxWidth: 1100, margin: "auto" };
const topBar = { display: "flex", justifyContent: "space-between", marginBottom: 15 };
const videoGrid = { display: "flex", gap: 15, flexWrap: "wrap", justifyContent: "center" };
const videoBox = { textAlign: "center" };
const video = { width: 300, height: 200, border: "2px solid #101727", borderRadius: 6 };
const controls = { textAlign: "center", marginTop: 20 };
const btn = { padding: "10px 18px", background: "#101727", color: "#fff", border: "none", borderRadius: 6 };
const dangerBtn = { ...btn, background: "#dc2626" };

export default Room;
