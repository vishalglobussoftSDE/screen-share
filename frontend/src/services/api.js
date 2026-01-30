import axios from "axios";

const api = axios.create({
  baseURL: "http://192.168.5.96:5000", // backend LAN IP
  timeout: 5000,
});

export default api;
