import express from "express";
import cors from "cors";

const app = express();

// ✅ CORS — MUST be before routes
app.use(
  cors({
    origin: "*", // LAN + localhost frontend
    methods: ["GET", "POST", "PUT", "DELETE"],
  })
);

app.use(express.json());

// ✅ Health check route
app.get("/health", (req, res) => {
  res.json({ message: "Server is healthy ✅" });
});

export default app;
