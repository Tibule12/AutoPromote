// metricsRecorder.js - lightweight counter aggregation (best-effort, no strong consistency)
const { db, admin } = require("../firebaseAdmin");

function createMetricRecorder(database, increment) {
  const pending = new Map();
  return function record(key, amount = 1) {
    if(typeof amount!=='number'||!Number.isFinite(amount))return Promise.resolve();
    let entry=pending.get(key);
    if(!entry){entry={amount:0,waiters:[],running:false};pending.set(key,entry);}
    entry.amount+=amount;
    const result=new Promise(resolve=>entry.waiters.push(resolve));
    if(!entry.running){
      entry.running=true;
      void (async()=>{
        while(entry.waiters.length){
          const value=entry.amount,waiters=entry.waiters.splice(0);entry.amount=0;
          try{await database.collection("system_counters").doc(key).set({value:increment(value),updatedAt:new Date().toISOString()},{merge:true});}
          catch(e){console.warn("[metricsRecorder] increment failed",key,e.message);}
          waiters.forEach(resolve=>resolve());
        }
        pending.delete(key);
      })();
    }
    return result;
  };
}
const incrCounter=createMetricRecorder(db,value=>admin.firestore.FieldValue.increment(value));
module.exports = { incrCounter,createMetricRecorder };
