import axios from "axios";

const api = axios.create({
  baseURL: "https://screenshareglobussoft.up.railway.app", // backend LAN IP
  timeout: 5000,
});

export default api;
