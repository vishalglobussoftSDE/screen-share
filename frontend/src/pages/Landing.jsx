import { useState } from "react";
import { useNavigate } from "react-router-dom";
import socket from "../services/socket";

function Landing() {
  const [roomIdInput, setRoomIdInput] = useState("");
  const navigate = useNavigate();

  const createRoom = () => {
    socket.emit("create-room");
    socket.once("room-created", (id) => {
      console.log("Room created:", id);
      navigate(`/room/${id}`);
    });
  };

  const joinRoom = () => {
    if (!roomIdInput) return alert("Enter Room ID");
    navigate(`/room/${roomIdInput}`);
  };

  return (
    <div style={{ textAlign: "center", marginTop: "50px" }}>
      <h1>🎥 Screen Share App</h1>
      <div style={{ margin: "20px" }}>
        <button onClick={createRoom} style={buttonStyle}>Create Room</button>
      </div>
      <div>
        <input
          placeholder="Enter Room ID"
          value={roomIdInput}
          onChange={(e) => setRoomIdInput(e.target.value)}
          style={inputStyle}
        />
        <button onClick={joinRoom} style={buttonStyle}>Join Room</button>
      </div>
    </div>
  );
}

const buttonStyle = {
  padding: "10px 20px",
  margin: "10px",
  borderRadius: "5px",
  border: "none",
  backgroundColor: "#101727",
  color: "white",
  fontWeight: "bold",
  cursor: "pointer",
};

const inputStyle = {
  padding: "8px",
  borderRadius: "5px",
  border: "1px solid #ccc",
  minWidth: "140px",
};

export default Landing;
