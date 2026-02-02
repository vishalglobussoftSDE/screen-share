import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import socket from "../services/socket";

function Landing() {
  const [roomId, setRoomId] = useState("");
  const navigate = useNavigate();

  useEffect(() => {
    socket.on("room-created", (id) => {
      navigate(`/room/${id}`);
    });

    socket.on("error", (msg) => alert(msg));

    return () => socket.off();
  }, []);

  const createRoom = () => socket.emit("create-room");
  const joinRoom = () => roomId && navigate(`/room/${roomId}`);

  return (
    <div style={container}>
      <h1>🎥 Screen Share</h1>

      <button onClick={createRoom}>Create Room</button>

      <p>OR</p>

      <input
        placeholder="Enter Room ID"
        value={roomId}
        onChange={(e) => setRoomId(e.target.value)}
      />
      <button onClick={joinRoom}>Join Room</button>
    </div>
  );
}

const container = {
  height: "100vh",
  display: "flex",
  flexDirection: "column",
  alignItems: "center",
  justifyContent: "center",
  gap: "12px",
};

export default Landing;
