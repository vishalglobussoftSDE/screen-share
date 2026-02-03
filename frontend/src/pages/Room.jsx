import { useEffect, useRef, useState } from "react";
import { useParams, useNavigate } from "react-router-dom";
import socket from "../services/socket";

function Room() {
  const { roomId } = useParams();
  const navigate = useNavigate();

  const recognitionRef = useRef(null);
  const [listening, setListening] = useState(false);


  const [users, setUsers] = useState([]); // [{ userId, socketId }]
  const [sharing, setSharing] = useState(false);

  const localVideoRef = useRef(null);
  const peers = useRef({}); // socketId -> RTCPeerConnection

  // persistent userId
  const savedId = localStorage.getItem("userId");
  const userId = useRef(savedId || Math.random().toString(36).substring(2, 8));

  const [messages, setMessages] = useState([]);
  const [text, setText] = useState("");
  const [micOn, setMicOn] = useState(true);


  useEffect(() => {
    localStorage.setItem("userId", userId.current);
  }, []);

  //speechRecogition
  useEffect(() => {
    const SpeechRecognition =
      window.SpeechRecognition || window.webkitSpeechRecognition;

    if (!SpeechRecognition) {
      alert("Speech Recognition not supported in this browser");
      return;
    }

    const recognition = new SpeechRecognition();
    recognition.lang = "en-IN"; // change to hi-IN for Hindi
    recognition.continuous = false;
    recognition.interimResults = false;

    recognition.onresult = (event) => {
      const spokenText = event.results[0][0].transcript;
      setText(spokenText); // auto fill input
    };

    recognition.onend = () => {
      setListening(false);
    };

    recognitionRef.current = recognition;
  }, []);

  /* ---------------- JOIN ROOM ---------------- */
  useEffect(() => {
    socket.emit("join-room", { roomId, userId: userId.current });

    socket.on("room-users", (list) => {
      setUsers(list);
    });

    socket.on("already-joined", () => alert("Already joined"));
    socket.on("error", (msg) => alert(msg));

    /* -------- WEBRTC -------- */
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

    /* -------- CHAT -------- */
    socket.on("receive-message", ({ message, userId }) => {
      setMessages((prev) => [...prev, { message, userId }]);
    });

    return () => {
      leaveRoomCleanup();
      socket.off();
    };
  }, [roomId]);

  /* ---------------- PEER ---------------- */
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
        .forEach((t) =>
          pc.addTrack(t, localVideoRef.current.srcObject)
        );
    }

    return pc;
  };

  /* ---------------- SCREEN SHARE ---------------- */
  const startScreenShare = async () => {
    if (sharing) return;

    const stream = await navigator.mediaDevices.getDisplayMedia({
      video: true,
      audio: true,
    });

    localVideoRef.current.srcObject = stream;
    setSharing(true);

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
  const toggleMic = () => {
    if (!localVideoRef.current?.srcObject) return;

    localVideoRef.current.srcObject
      .getAudioTracks()
      .forEach(track => {
        track.enabled = !track.enabled;
        setMicOn(track.enabled);
      });
  };


  /* ---------------- CHAT SEND ---------------- */
  const sendMessage = () => {
    if (!text.trim()) return;

    setMessages((prev) => [
      ...prev,
      { message: text, userId: "You" },
    ]);

    socket.emit("send-message", {
      roomId,
      message: text,
      userId: userId.current,
    });

    setText("");
  };

  /* ---------------- LEAVE ---------------- */
  const leaveRoomCleanup = () => {
    Object.values(peers.current).forEach((pc) => pc.close());
    peers.current = {};

    if (localVideoRef.current?.srcObject) {
      localVideoRef.current.srcObject
        .getTracks()
        .forEach((t) => t.stop());
      localVideoRef.current.srcObject = null;
    }

    socket.emit("leave-room", { roomId, userId: userId.current });
  };
  const startListening = () => {
    if (!recognitionRef.current) return;

    setListening(true);
    recognitionRef.current.start();
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

      <button onClick={startScreenShare} disabled={sharing} style={btn}>
        Start Screen Share
      </button>
      <button onClick={toggleMic} style={btn}>
        {micOn ? "Mute Mic 🔇" : "Unmute Mic 🎙️"}
      </button>

      <button onClick={leaveRoom} style={leaveBtn}>
        Leave Room
      </button>

      {/* VIDEO */}
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

      {/* CHAT */}
      <div style={chatBox}>
        <div style={chatMessages}>
          {messages.map((m, i) => (
            <div key={i}>
              <b>{m.userId}:</b> {m.message}
            </div>
          ))}
        </div>

        <div>
          <input
            value={text}
            onChange={(e) => setText(e.target.value)}
            placeholder="Type message..."
            style={chatInput}
            onKeyDown={(e) => e.key === "Enter" && sendMessage()}
          />
          <button onClick={sendMessage} style={sendBtn}>
            Send
          </button>
          <button onClick={startListening} style={btn}>
            {listening ? "Listening... 🎧" : "Speak 🎙️"}
          </button>

        </div>
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

const chatBox = {
  marginTop: 20,
  width: 300,
  marginInline: "auto",
};

const chatMessages = {
  border: "1px solid #101727",
  height: 150,
  overflowY: "auto",
  padding: 5,
  marginBottom: 10,
};

const chatInput = {
  width: "70%",
  padding: 5,
};

const sendBtn = {
  padding: "6px 10px",
  marginLeft: 5,
};

export default Room;
