/**
 * @file socket.js
 * @description Socket.io initialisation and real-time alert broadcasting
 *              for Sentinel AI.
 *
 *              Architecture
 *              ────────────
 *              This module is a singleton.  server.js calls `initSocket(httpServer)`
 *              once at startup and stores the io instance internally.
 *              Any other module (e.g. panicService) can then import `emitAlert`
 *              to broadcast events without needing a reference to the HTTP server.
 *
 *              WebSocket event catalogue
 *              ──────────────────────────
 *              Event name   : "new-alert"
 *              Direction    : Server → All connected clients
 *              Payload shape: {
 *                               message:     string,   // e.g. "Possible Riot Rumor Detected"
 *                               location:    string,   // e.g. "Bengaluru"
 *                               severity:    string,   // "HIGH" | "CRITICAL"
 *                               panic_index: number,   // 0-100
 *                             }
 *
 *              React frontend snippet to subscribe
 *              ────────────────────────────────────
 *              import { io } from "socket.io-client";
 *              const socket = io();               // connect to same origin
 *              socket.on("new-alert", (payload) => {
 *                console.log("🚨 Alert received:", payload);
 *              });
 *
 * @dependencies socket.io, ./utils/logger
 */

const { Server } = require("socket.io");
const logger     = require("./utils/logger");

/* ─── Module-level singleton ─────────────────────────────────────────────── */

/** @type {import('socket.io').Server | null} */
let io = null;

/* ─── Exported functions ─────────────────────────────────────────────────── */

/**
 * Attaches Socket.io to the existing HTTP server and configures CORS.
 * Call this ONCE from server.js immediately after `app.listen()`.
 *
 * @param {import('http').Server} httpServer - The Node.js HTTP server instance
 * @returns {import('socket.io').Server}
 */
const initSocket = (httpServer) => {
  io = new Server(httpServer, {
    cors: {
      // Mirror the same allowed origins as the Express CORS config
      origin:      process.env.ALLOWED_ORIGINS
        ? process.env.ALLOWED_ORIGINS.split(",").map((o) => o.trim())
        : "*",
      methods:     ["GET", "POST"],
      credentials: true,
    },
    // Ping clients every 25 s and disconnect unresponsive ones after 60 s
    pingInterval: 25000,
    pingTimeout:  60000,
  });

  /* ── Connection lifecycle logging ────────────────────────────────────── */
  io.on("connection", (socket) => {
    logger.info(`Socket.io → client connected (id: ${socket.id})`);

    // Log disconnections to help debug dropped clients
    socket.on("disconnect", (reason) => {
      logger.info(
        `Socket.io → client disconnected (id: ${socket.id}, reason: ${reason})`
      );
    });
  });

  logger.info("Socket.io → initialised and listening for connections");
  return io;
};

/**
 * Broadcasts a "new-alert" event to ALL connected Socket.io clients.
 *
 * Safe to call even before `initSocket` has been called — if io is null
 * (e.g. during unit tests or startup race conditions) the call is a no-op
 * and a warning is logged.
 *
 * @param {{ message: string, location: string, severity: string, panic_index: number }} alertPayload
 */
const emitAlert = (alertPayload) => {
  if (!io) {
    logger.warn("socket.emitAlert → Socket.io not yet initialised; skipping broadcast");
    return;
  }

  logger.info(
    `socket.emitAlert → broadcasting "new-alert" to all clients | location=${alertPayload.location}`
  );

  io.emit("new-alert", alertPayload);
};

module.exports = { initSocket, emitAlert };
