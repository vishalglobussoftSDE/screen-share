import { useEffect, useRef, useState } from "react";
import { useParams, useNavigate } from "react-router-dom";
import socket from "../services/socket";

function Room() {
  const { roomId } = useParams();
  const navigate = useNavigate();

  // users = [{ userId, socketId }]
  const [users, setUsers] = useState([]);
  const [sharing, setSharing] = useState(false);

  const localVideoRef = useRef(null);
  const peers = useRef({}); // socketId -> RTCPeerConnection

  // persistent userId (same browser = same user)
  const savedId = localStorage.getItem("userId");
  const userId = useRef(savedId || Math.random().toString(36).substring(2, 8));
  useEffect(() => {
    localStorage.setItem("userId", userId.current);
  }, []);

  /* ---------------- JOIN ROOM ---------------- */
  useEffect(() => {
    socket.emit("join-room", { roomId, userId: userId.current });

    socket.on("room-users", (list) => {
      setUsers(list);
    });

    socket.on("already-joined", () => alert("Already joined"));
    socket.on("error", (msg) => alert(msg));

    /* --------- WEBRTC SIGNALING --------- */

    socket.on("webrtc-offer", async ({ fromSocketId, offer }) => {
      if (peers.current[fromSocketId]) return;

      const pc = createPeer(fromSocketId);
      peers.current[fromSocketId] = pc;

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

    return () => {
      leaveRoomCleanup();
      socket.off();
    };
  }, [roomId]);

  /* ---------------- PEER HELPER ---------------- */
  const createPeer = (targetSocketId) => {
    const pc = new RTCPeerConnection({
      iceServers: [{ urls: "stun:stun.l.google.com:19302" }],
    });

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

    if (localVideoRef.current?.srcObject) {
      localVideoRef.current.srcObject
        .getTracks()
        .forEach((t) => pc.addTrack(t, localVideoRef.current.srcObject));
    }

    return pc;
  };

  /* ---------------- START SHARE ---------------- */
  const startScreenShare = async () => {
    if (sharing) return;

    const stream = await navigator.mediaDevices.getDisplayMedia({
      video: true,
      audio: false,
    });

    localVideoRef.current.srcObject = stream;
    setSharing(true);

    // create offers to all others
    users.forEach(async ({ userId: uid, socketId }) => {
      if (uid === userId.current || peers.current[socketId]) return;

      const pc = createPeer(socketId);
      peers.current[socketId] = pc;

      const offer = await pc.createOffer();
      await pc.setLocalDescription(offer);

      socket.emit("webrtc-offer", {
        targetSocketId: socketId,
        offer,
      });
    });
  };

  /* ---------------- LEAVE ROOM ---------------- */
  const leaveRoomCleanup = () => {
    Object.values(peers.current).forEach((pc) => pc.close());
    peers.current = {};

    if (localVideoRef.current?.srcObject) {
      localVideoRef.current.srcObject.getTracks().forEach((t) => t.stop());
      localVideoRef.current.srcObject = null;
    }

    socket.emit("leave-room", { roomId, userId: userId.current });
  };

  const leaveRoom = () => {
    leaveRoomCleanup();
    navigate("/");
  };

  /* ---------------- UI ---------------- */
  return (
    <div style={{ textAlign: "center", marginTop: 20 }}>
      <h2>Room: {roomId}</h2>
      <p>Connected Users: {users.length}</p>

      <div>
        <button onClick={startScreenShare} disabled={sharing} style={btn}>
          Start Screen Share
        </button>
        <button onClick={leaveRoom} style={leaveBtn}>
          Leave Room
        </button>
      </div>

      <div style={grid}>
        <div>
          <p>You</p>
          <video ref={localVideoRef} autoPlay muted style={video} />
        </div>

        {users.map(
          ({ userId: uid, socketId }) =>
            uid !== userId.current && (
              <div key={socketId}>
                <p>{uid}</p>
                <video
                  id={`video-${socketId}`}
                  autoPlay
                  playsInline
                  style={video}
                />
              </div>
            )
        )}
      </div>
    </div>
  );
}

/* ---------------- STYLES ---------------- */
const btn = {
  padding: "10px 20px",
  margin: 10,
  background: "#101727",
  color: "white",
  border: "none",
  borderRadius: 5,
  fontWeight: "bold",
};

const leaveBtn = { ...btn, background: "red" };

const grid = {
  display: "flex",
  flexWrap: "wrap",
  justifyContent: "center",
  gap: 15,
  marginTop: 20,
};

const video = {
  width: 300,
  height: 200,
  border: "2px solid #101727",
  borderRadius: 5,
  objectFit: "cover",
};

export default Room;
