const express = require("express");
const authMiddleware = require("../authMiddleware");
const adminOnly = require("../middlewares/adminOnly");
function createRouter(service, screenplayService = null) {
  const router = express.Router();
  router.use(authMiddleware, adminOnly, (req, res, next) => {
    if (process.env.CONTENT_FACTORY_ENABLED !== "true") return res.status(404).json({ error: "not_found" });
    if (!req.user?.uid || req.userId !== req.user.uid) return res.status(401).json({ error: "auth_required" });
    const founders = (process.env.CONTENT_FACTORY_ADMIN_UIDS || "").split(",").map(s => s.trim()).filter(Boolean);
    if (!founders.includes(req.user.uid)) return res.status(403).json({ error: "founder_required" });
    next();
  });
  const act = fn => async (req, res) => { try { await fn(req, res); }
    catch (e) { res.status(e.statusCode || 503).json({ ok: false, error: e.code || "CONTENT_FACTORY_UNAVAILABLE" }); } };
  router.post('/screenplays',act(async(req,res)=>{
    if(!screenplayService)return res.status(503).json({ok:false,error:'SCREENPLAY_SERVICE_UNCONFIGURED'});
    const result=await screenplayService.create({uid:req.user.uid,input:req.body});
    res.status(result.duplicate?200:202).json({ok:true,...result});
  }));
  router.get('/screenplays/:productionId',act(async(req,res)=>{
    if(!screenplayService)return res.status(503).json({ok:false,error:'SCREENPLAY_SERVICE_UNCONFIGURED'});
    res.json({ok:true,job:await screenplayService.get(req.user.uid,req.params.productionId)});
  }));
  router.post("/jobs", act(async (req, res) => {
    const result = await service.create({ uid: req.user.uid, input: req.body });
    res.status(result.duplicate ? 200 : 202).json({ ok: true, job: result.job, duplicate: result.duplicate });
  }));
  router.get("/jobs/:jobId", act(async (req, res) => res.json({ ok: true, job: await service.get(req.user.uid, req.params.jobId) })));
  router.post("/jobs/:jobId/cancel", act(async (req, res) => res.json({ ok: true, job: await service.cancel({ uid: req.user.uid, jobId: req.params.jobId }) })));
  router.post("/jobs/:jobId/retry", act(async (req, res) => res.status(202).json({ ok: true, job: await service.retry({ uid: req.user.uid, jobId: req.params.jobId }) })));
  router.post("/jobs/:jobId/outputs/:outputId/review",act(async(req,res)=>res.json({ok:true,job:await service.reviewOutput({
    uid:req.user.uid,jobId:req.params.jobId,outputId:req.params.outputId,artifactSha256:req.body?.artifactSha256,
    accepted:req.body?.accepted,note:req.body?.note})})));
  return router;
}
const { db } = require("../firebaseAdmin");
const { firestoreFactoryStore } = require("../services/contentFactoryStore");
const { createContentFactoryService } = require("../services/contentFactoryService");
const { createScreenplayProductionService } = require('../services/screenplayProductionService');
const store=firestoreFactoryStore(db), factory=createContentFactoryService({store,providers:null});
module.exports = createRouter(factory,createScreenplayProductionService({store,factory,providers:null}));
module.exports.createRouter = createRouter;
