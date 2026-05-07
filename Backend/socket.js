const { Server } = require("socket.io");
const logger     = require("./utils/logger");

let io          = null;
let authorityIo = null;

const initSocket = (httpServer) => {
  io = new Server(httpServer, {
    cors: {
      origin:      process.env.ALLOWED_ORIGINS
        ? process.env.ALLOWED_ORIGINS.split(",").map((o) => o.trim())
        : "*",
      methods:     ["GET", "POST"],
      credentials: true,
    },
    pingInterval: 25000,
    pingTimeout:  60000,
  });

  const mainNs      = io.of("/");
  const authorityNs = io.of("/authority");

  authorityIo = authorityNs;

  mainNs.on("connection", (socket) => {
    logger.info(`Socket.io [main] → client connected (id: ${socket.id})`);
    socket.on("disconnect", (reason) => {
      logger.info(`Socket.io [main] → client disconnected (id: ${socket.id}, reason: ${reason})`);
    });
  });

  authorityNs.on("connection", (socket) => {
    logger.info(`Socket.io [authority] → authority client connected (id: ${socket.id})`);
    socket.on("disconnect", (reason) => {
      logger.info(`Socket.io [authority] → disconnected (id: ${socket.id}, reason: ${reason})`);
    });
  });

  logger.info("Socket.io → initialised (namespaces: /, /authority)");
  return io;
};

const emitAlert = (alertPayload) => {
  if (!io) {
    logger.warn("socket.emitAlert → Socket.io not yet initialised; skipping");
    return;
  }
  logger.info(`socket.emitAlert → broadcasting "new-alert" | location=${alertPayload.location}`);
  io.emit("new-alert", alertPayload);
  if (authorityIo) {
    authorityIo.emit("authority-alert", alertPayload);
  }
};

const getAuthorityIo = () => authorityIo;

module.exports = { initSocket, emitAlert, getAuthorityIo };
