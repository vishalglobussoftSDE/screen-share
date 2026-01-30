import { io } from "socket.io-client";

const socket = io("http://192.168.5.96:5000"); // Your LAN IP + backend port

export default socket;
