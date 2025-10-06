// Lightweight in-memory query metrics (resets on deploy)
// instrument(label, promiseFactory)
const metrics = {};

function record(label, durMs, ok) {
  const m = metrics[label] || { count:0, errorCount:0, totalMs:0, p95Window:[], max:0 };
  m.count++; m.totalMs += durMs; if (!ok) m.errorCount++; if (durMs>m.max) m.max = durMs;
  // Keep sliding window (last 50 measurements) for rough p95
  m.p95Window.push(durMs); if (m.p95Window.length>50) m.p95Window.shift();
  m.avg = m.totalMs / m.count;
  const sorted = [...m.p95Window].sort((a,b)=>a-b);
  m.p95 = sorted[Math.min(sorted.length-1, Math.floor(sorted.length*0.95))] || durMs;
  metrics[label] = m;
}

async function instrument(label, fn) {
  const start = Date.now(); let ok = true;
  try { return await fn(); }
  catch(e){ ok = false; throw e; }
  finally { record(label, Date.now()-start, ok); }
}

function getMetrics() {
  const out = {};
  Object.keys(metrics).forEach(k => { const { count,errorCount,avg,p95,max } = metrics[k]; out[k] = { count,errorCount,avg:Math.round(avg),p95:Math.round(p95),max:Math.round(max) }; });
  return out;
}

module.exports = { instrument, getMetrics };
