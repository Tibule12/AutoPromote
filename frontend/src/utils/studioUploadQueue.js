// Backend fallback is a bounded transport queue. A 429 means no bytes were
// accepted; only that explicit refusal and its declared cooldown are retried.
export function createStudioUploadQueue({pause=ms=>new Promise(resolve=>setTimeout(resolve,ms)),maxWaitMs=120000}={}){
  let pending=Promise.resolve();
  return task=>{
    const next=pending.then(async()=>{
      let waited=0;
      for(;;){try{return await task();}catch(error){
        const delay=Number(error?.retryAfterMs);
        if(error?.httpStatus!==429||!Number.isFinite(delay)||delay<1||delay>60000||waited+delay>maxWaitMs)throw error;
        waited+=delay;await pause(delay);
      }}
    });
    pending=next.catch(()=>{});return next;
  };
}
