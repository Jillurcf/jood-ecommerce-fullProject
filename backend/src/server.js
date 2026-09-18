import http from "http";
import app from "./app.js";
import { env } from "./config/index.js";
import { initSocketIO } from "./lib/socket.js";
import { logger } from "./common/logger.js";
import { prisma } from "./lib/prisma.js";
const PORT = env.PORT;
const httpServer = http.createServer(app);
initSocketIO(httpServer);
httpServer.listen(PORT, () => {
  logger.info("backend listening", { port: PORT, health: `http://localhost:${PORT}/api/health`, node: process.version });
});
async function shutdown(signal) {
  logger.info(`received ${signal}, shutting down`);
  httpServer.close(async () => {
    try {
      await prisma.$disconnect();
    } catch (err) {
      logger.error("prisma disconnect error", err);
    }
    logger.info("shutdown complete");
    process.exit(0);
  });
  setTimeout(() => process.exit(1), 1e4).unref();
}
process.on("SIGINT", () => void shutdown("SIGINT"));
process.on("SIGTERM", () => void shutdown("SIGTERM"));
