#!/usr/bin/env node
const fs = require("fs/promises");
const path = require("path");
const { localFactoryStore, firestoreFactoryStore } = require("../src/services/contentFactoryStore");
const { createContentFactoryService } = require("../src/services/contentFactoryService");
const { createNvidiaFactoryProviders } = require("../src/services/contentFactoryProviders");

async function main() {
  const args=process.argv.slice(2),get=name=>{const i=args.indexOf(name);return i>=0?args[i+1]:null;};
  if(process.env.CONTENT_FACTORY_ENABLED!=="true")throw new Error("Set CONTENT_FACTORY_ENABLED=true for this private founder workflow");
  const root=path.resolve(get("--root") || process.env.CONTENT_FACTORY_ARTIFACT_ROOT || "/var/lib/autopromote/content-factory");
  const uid=get("--owner") || process.env.CONTENT_FACTORY_OWNER_UID;
  const allowed=(process.env.CONTENT_FACTORY_ADMIN_UIDS || "").split(",").map(s=>s.trim());
  if(!uid || !allowed.includes(uid))throw new Error("Owner must be explicitly present in CONTENT_FACTORY_ADMIN_UIDS");
  const store=args.includes("--firestore") ? firestoreFactoryStore(require("../src/firebaseAdmin").db) : localFactoryStore(root);
  const windowFile=get("--gpu-window");
  const window=windowFile?JSON.parse(await fs.readFile(windowFile,"utf8")):{};
  const directionFile=get("--direction");
  const libraryFile=get("--asset-library");
  const providers=createNvidiaFactoryProviders({root,host:process.env.CONTENT_FACTORY_NVIDIA_SSH_HOST,
    ...(process.env.CONTENT_FACTORY_NVIDIA_SSH_PORT?{sshPort:Number(process.env.CONTENT_FACTORY_NVIDIA_SSH_PORT)}:{}),
    remoteRoot:process.env.CONTENT_FACTORY_NVIDIA_ROOT,deadlineEpoch:Number(window.deadline_epoch || process.env.CONTENT_FACTORY_GPU_DEADLINE_EPOCH),
    python:process.env.CONTENT_FACTORY_PYTHON || "python3",suppliedDirection:directionFile?JSON.parse(await fs.readFile(directionFile,"utf8")):null,
    assetLibrary:libraryFile?JSON.parse(await fs.readFile(libraryFile,"utf8")):null});
  const service=createContentFactoryService({store,providers});
  let jobId=get("--job");
  if(get("--brief-file")) {
    const input={requestId:get("--request") || `founder-${Date.now()}`,brief:await fs.readFile(get("--brief-file"),"utf8")};
    const result=await service.create({uid,input});jobId=result.job.jobId;
    process.stdout.write(JSON.stringify({jobId,duplicate:result.duplicate})+"\n");
  }
  if(jobId) {
    await service.get(uid,jobId);
    if(args.includes("--retry"))await service.retry({uid,jobId});
    const result=await service.process(jobId);process.stdout.write(JSON.stringify({jobId,status:result?.status,stage:result?.stage,failure:result?.failure})+"\n");
    if(result?.status!=="awaiting_founder_review")process.exitCode=1;
  } else if(args.includes("--worker")) {
    for(const id of await service.listQueued(uid))await service.process(id);
  } else throw new Error("Provide --brief-file, --job or --worker");
}
main().catch(e=>{process.stderr.write(`${e.code || "CONTENT_FACTORY_FAILED"}: ${e.message}\n`);process.exitCode=1;});
