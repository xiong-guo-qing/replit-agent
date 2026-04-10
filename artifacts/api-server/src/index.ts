import app from "./app";
import { logger } from "./lib/logger";

const rawPort = process.env["PORT"];

if (!rawPort) {
  throw new Error(
    "PORT environment variable is required but was not provided.",
  );
}

const port = Number(rawPort);

if (Number.isNaN(port) || port <= 0) {
  throw new Error(`Invalid PORT value: "${rawPort}"`);
}

const server = app.listen(port, (err) => {
  if (err) {
    logger.error({ err }, "Error listening on port");
    process.exit(1);
  }

  logger.info({ port }, "Server listening");
});

// Disable all Node.js-level timeouts so long model requests (o3, claude-opus)
// are not killed by the HTTP server before the model finishes responding.
server.timeout = 0;          // no socket inactivity timeout
server.requestTimeout = 0;   // no request-level timeout (Node 14+)
server.headersTimeout = 0;   // default is 60 000ms — would kill long waits
server.keepAliveTimeout = 620_000; // > typical upstream 600s limit
