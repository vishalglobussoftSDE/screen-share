import socket from "../services/socket";

export function createPeerConnection(remoteSocketId, onTrackCallback) {
  const pc = new RTCPeerConnection({
    iceServers: [{ urls: "stun:stun.l.google.com:19302" }],
  });

  // When remote track received
  pc.ontrack = (event) => {
    onTrackCallback(event.streams[0]);
  };

  // When local ICE candidate is generated
  pc.onicecandidate = (event) => {
    if (event.candidate) {
      socket.emit("webrtc-ice-candidate", { targetSocketId: remoteSocketId, candidate: event.candidate });
    }
  };

  return pc;
}
