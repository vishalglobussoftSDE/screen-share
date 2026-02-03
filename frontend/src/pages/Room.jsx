import { useEffect, useRef, useState } from "react";
import { useParams, useNavigate } from "react-router-dom";
import socket from "../services/socket";

function Room() {
  const { roomId } = useParams();
  const navigate = useNavigate();

  const localVideoRef = useRef(null);
  const peers = useRef({});
  const recognitionRef = useRef(null);

  const savedId = localStorage.getItem("userId");
  const userId = useRef(savedId || Math.random().toString(36).substring(2, 8));

  const [users, setUsers] = useState([]);
  const [sharing, setSharing] = useState(false);
  const [micOn, setMicOn] = useState(true);

  const [messages, setMessages] = useState([]);
  const [text, setText] = useState("");
  const [listening, setListening] = useState(false);

  useEffect(() => {
    localStorage.setItem("userId", userId.current);
  }, []);

  /* ---------------- SPEECH TO TEXT ---------------- */
  useEffect(() => {
    const SR = window.SpeechRecognition || window.webkitSpeechRecognition;
    if (!SR) return;

    const rec = new SR();
    rec.lang = "en-IN";
    rec.onresult = (e) => setText(e.results[0][0].transcript);
    rec.onend = () => setListening(false);
    recognitionRef.current = rec;
  }, []);

  /* ---------------- JOIN ROOM ---------------- */
  useEffect(() => {
    socket.emit("join-room", { roomId, userId: userId.current });

    socket.on("room-users", setUsers);

    socket.on("receive-message", ({ message, userId }) => {
      setMessages((p) => [...p, { message, userId }]);
    });

    socket.on("webrtc-offer", async ({ fromSocketId, offer }) => {
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

    return () => leaveRoom();
  }, [roomId]);

  /* ---------------- PEER ---------------- */
  const createPeer = (socketId) => {
    const pc = new RTCPeerConnection({
      iceServers: [{ urls: "stun:stun.l.google.com:19302" }],
    });

    pc.onicecandidate = (e) => {
      if (e.candidate) {
        socket.emit("webrtc-ice-candidate", {
          targetSocketId: socketId,
          candidate: e.candidate,
        });
      }
    };

    pc.ontrack = (e) => {
      const video = document.getElementById(`video-${socketId}`);
      if (video) {
        video.srcObject = e.streams[0];
        video.play().catch(() => {});
      }
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

    const screen = await navigator.mediaDevices.getDisplayMedia({ video: true });
    const mic = await navigator.mediaDevices.getUserMedia({ audio: true });

    const stream = new MediaStream([
      ...screen.getVideoTracks(),
      ...mic.getAudioTracks(),
    ]);

    localVideoRef.current.srcObject = stream;
    setSharing(true);

    users.forEach(async ({ socketId, userId: uid }) => {
      if (uid === userId.current) return;

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

  /* ---------------- MIC ---------------- */
  const toggleMic = () => {
    localVideoRef.current?.srcObject
      ?.getAudioTracks()
      .forEach((t) => (t.enabled = !t.enabled));
    setMicOn((p) => !p);
  };

  /* ---------------- CHAT ---------------- */
  const sendMessage = () => {
    if (!text.trim()) return;

    setMessages((p) => [...p, { message: text, userId: "You" }]);
    socket.emit("send-message", {
      roomId,
      message: text,
      userId: userId.current,
    });
    setText("");
  };

  const startListening = () => {
    setListening(true);
    recognitionRef.current?.start();
  };

  /* ---------------- LEAVE ---------------- */
  const leaveRoom = () => {
    Object.values(peers.current).forEach((pc) => pc.close());
    peers.current = {};
    socket.emit("leave-room", { roomId, userId: userId.current });
    navigate("/");
  };

  /* ---------------- UI ---------------- */
  return (
    <div style={layout}>
      <div style={left}>
        <h3>Room: {roomId}</h3>

        <button onClick={startScreenShare} style={btn}>Share</button>
        <button onClick={toggleMic} style={btn}>
          {micOn ? "Mute 🔇" : "Unmute 🎙️"}
        </button>
        <button onClick={leaveRoom} style={leaveBtn}>Leave</button>

        <video ref={localVideoRef} autoPlay muted style={video} />

        <div style={grid}>
          {users.map(
            ({ socketId, userId: uid }) =>
              uid !== userId.current && (
                <video
                  key={socketId}
                  id={`video-${socketId}`}
                  autoPlay
                  playsInline
                  style={video}
                />
              )
          )}
        </div>
      </div>

      <div style={right}>
        <h3>Chat</h3>

        <div style={chatMessages}>
          {messages.map((m, i) => (
            <div key={i}><b>{m.userId}:</b> {m.message}</div>
          ))}
        </div>

        <input
          value={text}
          onChange={(e) => setText(e.target.value)}
          placeholder="Type..."
          style={chatInput}
        />

        <button onClick={sendMessage} style={btn}>Send</button>
        <button onClick={startListening} style={btn}>
          {listening ? "Listening..." : "🎙️ Speak"}
        </button>
      </div>
    </div>
  );
}

/* ---------------- STYLES ---------------- */
const layout = { display: "flex", height: "100vh" };
const left = { flex: 3, padding: 10 };
const right = { flex: 1, borderLeft: "2px solid #101727", padding: 10 };
const btn = { margin: 5, padding: "8px 12px", background: "#101727", color: "#fff", border: "none" };
const leaveBtn = { ...btn, background: "red" };
const video = { width: 300, height: 200, border: "2px solid #101727", margin: 5 };
const grid = { display: "flex", flexWrap: "wrap" };
const chatMessages = { height: 300, overflowY: "auto", border: "1px solid #ccc", padding: 5 };
const chatInput = { width: "100%", padding: 5 };

export default Room;
