// Centralized HTTP/HTTPS keep-alive agents to reduce TLS & TCP handshake latency
// Configurable via env vars:
//   KEEP_ALIVE_MAX_SOCKETS (default 50)
//   KEEP_ALIVE_MAX_FREE_SOCKETS (default 10)
//   KEEP_ALIVE_SOCKET_TIMEOUT_MS (default 60000) - active socket timeout
//   KEEP_ALIVE_FREE_SOCKET_TIMEOUT_MS (default 15000) - free socket keep-alive duration
// These agents are installed as the Node global agents in server.js for outbound requests.

const http = require('http');
const https = require('https');

const maxSockets = parseInt(process.env.KEEP_ALIVE_MAX_SOCKETS || '50', 10);
const maxFreeSockets = parseInt(process.env.KEEP_ALIVE_MAX_FREE_SOCKETS || '10', 10);
const timeout = parseInt(process.env.KEEP_ALIVE_SOCKET_TIMEOUT_MS || '60000', 10);
const freeSocketTimeout = parseInt(process.env.KEEP_ALIVE_FREE_SOCKET_TIMEOUT_MS || '15000', 10);

const httpAgent = new http.Agent({
  keepAlive: true,
  maxSockets,
  maxFreeSockets,
  timeout,
  freeSocketTimeout
});

const httpsAgent = new https.Agent({
  keepAlive: true,
  maxSockets,
  maxFreeSockets,
  timeout,
  freeSocketTimeout
});

// Lightweight introspection helper (optional usage in diagnostics routes)
function summarizeAgent(agent){
  try {
    return {
      maxSockets: agent.maxSockets,
      socketsInUse: Object.values(agent.sockets || {}).reduce((a,arr)=>a+arr.length,0),
      freeSockets: Object.values(agent.freeSockets || {}).reduce((a,arr)=>a+arr.length,0),
      requestsQueued: Object.values(agent.requests || {}).reduce((a,arr)=>a+arr.length,0)
    };
  } catch(_) { return { error: 'summarize_failed' }; }
}

module.exports = { httpAgent, httpsAgent, summarizeAgent };
