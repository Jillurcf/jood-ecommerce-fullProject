import { Server } from "socket.io";
import jwt from "jsonwebtoken";
import { env } from "../config/index.js";
import { logger } from "../common/logger.js";
import { prisma } from "./prisma.js";
let io;
function getIO() {
  return io;
}
function initSocketIO(httpServer) {
  io = new Server(httpServer, {
    cors: {
      origin: [
        env.FRONTEND_URL,
        "http://localhost:3000",
        "http://127.0.0.1:3000"
      ],
      credentials: true
    },
    transports: ["websocket", "polling"]
  });
  io.on("connection", (socket) => {
    logger.debug("socket connected", { id: socket.id });
    socket.on("disconnect", () => {
      logger.debug("socket disconnected", { id: socket.id });
    });
  });
  io.of("/admin").use(async (socket, next) => {
    try {
      const token = socket.handshake.auth?.token || socket.handshake.headers?.authorization?.replace("Bearer ", "");
      if (!token) {
        return next(new Error("Authentication required"));
      }
      const payload = jwt.verify(token, env.JWT_ACCESS_SECRET, {
        issuer: "jood-api"
      });
      if (payload.type !== "admin") {
        return next(new Error("Admin authentication required"));
      }
      const account = await prisma.adminAccount.findUnique({
        where: { id: payload.sub },
        select: { id: true, status: true, sessionVersion: true }
      });
      if (!account || account.status !== "active") {
        return next(new Error("Account not active"));
      }
      if (account.sessionVersion !== payload.sv) {
        return next(new Error("Session expired"));
      }
      socket.data = {
        userId: account.id,
        role: payload.role
      };
      next();
    } catch {
      next(new Error("Invalid token"));
    }
  });
  io.of("/admin").on("connection", (socket) => {
    const d = socket.data;
    logger.debug("admin socket connected", { id: socket.id, userId: d.userId });
    socket.on("disconnect", () => {
      logger.debug("admin socket disconnected", { id: socket.id });
    });
  });
  io.of("/customer").use(async (socket, next) => {
    try {
      const token = socket.handshake.auth?.token || socket.handshake.headers?.authorization?.replace("Bearer ", "");
      if (!token) {
        return next(new Error("Authentication required"));
      }
      const payload = jwt.verify(token, env.JWT_ACCESS_SECRET, {
        issuer: "jood-api"
      });
      if (payload.type !== "customer") {
        return next(new Error("Customer authentication required"));
      }
      const account = await prisma.customerAccount.findUnique({
        where: { id: payload.sub },
        select: { id: true, status: true, sessionVersion: true }
      });
      if (!account || account.status !== "active") {
        return next(new Error("Account not active"));
      }
      if (account.sessionVersion !== payload.sv) {
        return next(new Error("Session expired"));
      }
      socket.data = {
        userId: account.id
      };
      next();
    } catch {
      next(new Error("Invalid token"));
    }
  });
  io.of("/customer").on("connection", (socket) => {
    const d = socket.data;
    logger.debug("customer socket connected", { id: socket.id, userId: d.userId });
    socket.on("disconnect", () => {
      logger.debug("customer socket disconnected", { id: socket.id });
    });
  });
  if (env.SERVER_EMIT_SOCKET_TEST === "1") {
    setInterval(() => {
      io.emit("socket_test", { ok: true, time: Date.now() });
    }, 3e3);
  }
  return io;
}
export {
  getIO,
  initSocketIO
};
