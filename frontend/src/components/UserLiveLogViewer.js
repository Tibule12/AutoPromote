import React, { useEffect, useState, useRef } from "react";
import "./LiveLogViewer.css"; // Reuse Admin Terminal CSS
import { db, auth } from "../firebaseClient";
import { collection, query, where, orderBy, limit, onSnapshot } from "firebase/firestore";

const UserLiveLogViewer = () => {
  const [logs, setLogs] = useState([]);
  const [loading, setLoading] = useState(true);
  const [active, setActive] = useState(true);
  const logsEndRef = useRef(null);

  useEffect(() => {
    if (!auth.currentUser) return;
    const uid = auth.currentUser.uid;

    // 1. Listen to Content Uploads
    const qContent = query(
      collection(db, "content"),
      where("userId", "==", uid),
      orderBy("createdAt", "desc"),
      limit(5)
    );

    // 2. Listen to Notifications
    const qNotifs = query(
      collection(db, "notifications"),
      where("userId", "==", uid),
      orderBy("createdAt", "desc"),
      limit(5)
    );

    // 3. Listen to Transactions (Credits/Money)
    const qTrans = query(
      collection(db, "transactions"),
      where("userId", "==", uid),
      orderBy("createdAt", "desc"),
      limit(5)
    );

    const unsubContent = onSnapshot(qContent, snap => {
      snap.docChanges().forEach(change => {
        if (change.type === "added") {
          addLog({
            type: "upload",
            message: `📹 Content Uploaded: ${change.doc.data().title || "Untitled"}`,
            ts: change.doc.data().createdAt,
          });
        }
      });
    });

    const unsubNotifs = onSnapshot(qNotifs, snap => {
      snap.docChanges().forEach(change => {
        if (change.type === "added") {
          const data = change.doc.data();
          addLog({
            type: "info",
            message: `🔔 ${data.title || "Notification"}: ${data.message || ""}`,
            ts: data.createdAt,
          });
        }
      });
    });

    const unsubTrans = onSnapshot(qTrans, snap => {
      snap.docChanges().forEach(change => {
        if (change.type === "added") {
          const data = change.doc.data();
          const symbol = data.currency || (data.type === "credit" ? "Credits" : "$");
          const amount = data.amount || 0;
          const isPositive = amount > 0;

          addLog({
            type: isPositive ? "revenue" : "credit", // Green for income, Gold for spend
            message: `${isPositive ? "💰 Received" : "💎 Spent"} ${Math.abs(amount)} ${symbol} (${data.description || "Transaction"})`,
            ts: data.createdAt,
          });
        }
      });
    });

    // Add periodic "System Heartbeat" specific to user region/shard
    const interval = setInterval(() => {
      if (Math.random() < 0.1) {
        addLog({
          type: "success",
          message: `❤️ System Heartbeat: Node ${Math.floor(Math.random() * 90) + 10} Operational`,
          ts: new Date(),
        });
      }
    }, 5000);

    setLoading(false);

    return () => {
      unsubContent();
      unsubNotifs();
      unsubTrans();
      clearInterval(interval);
    };
  }, []);

  const addLog = newLog => {
    setLogs(prev => {
      // Avoid duplicates if possible (simple check)
      const exists = prev.some(
        l => l.message === newLog.message && Math.abs(new Date(l.ts) - new Date(newLog.ts)) < 2000
      );
      if (exists) return prev;

      const entry = {
        ...newLog,
        // Format timestamp if it's Firestore Timestamp
        timeStr: newLog.ts?.toDate
          ? newLog.ts.toDate().toLocaleTimeString()
          : new Date().toLocaleTimeString(),
      };
      return [...prev.slice(-49), entry]; // Keep last 50
    });
  };

  useEffect(() => {
    logsEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [logs]);

  return (
    <div className="live-log-container user-terminal">
      <div className="live-log-header">
        <h4>📡 Mission Control Live Feed</h4>
        <div style={{ display: "flex", gap: "10px" }}>
          <span className="live-indicator">● LIVE</span>
        </div>
      </div>
      <div className="live-log-console">
        {loading && <div className="log-line">Initializing link to satellite...</div>}
        {logs.length === 0 && !loading && (
          <div className="log-line">Waiting for mission activity...</div>
        )}
        {logs.map((log, i) => (
          <div key={i} className={`log-line log-${log.type}`}>
            <span className="log-ts">{log.timeStr}</span>
            <span className={log.type === "info" ? "log-raw" : "log-highlight"}>{log.message}</span>
          </div>
        ))}
        <div ref={logsEndRef} />
      </div>
    </div>
  );
};

export default UserLiveLogViewer;
