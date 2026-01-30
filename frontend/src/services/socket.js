import { io } from "socket.io-client";

// Use Railway backend URL
const BACKEND_URL = "https://screenshareglobussoft.up.railway.app";

const socket = io(BACKEND_URL, {
  transports: ["websocket"],
});

export default socket;
