jest.mock("../src/authMiddleware",()=> (req,res,next)=>{
  const uid=req.get("x-test-uid");if(!uid)return res.status(401).json({error:"auth_required"});
  req.user={uid,isAdmin:req.get("x-test-admin")==="true"};req.userId=uid;next();
});
jest.mock("../src/firebaseAdmin",()=>({db:{collection:jest.fn()}}));
const express=require("express"),request=require("supertest");
const {createRouter}=require("../src/routes/adminContentFactoryRoutes");
let app,service;
beforeEach(()=>{
  process.env.CONTENT_FACTORY_ENABLED="true";process.env.CONTENT_FACTORY_ADMIN_UIDS="founder";
  service={create:jest.fn(async()=>({job:{jobId:"a".repeat(64),status:"queued"},duplicate:false})),
    get:jest.fn(async()=>({private:true})),cancel:jest.fn(),retry:jest.fn()};
  app=express();app.use(express.json());app.use("/api/admin/content-factory",createRouter(service));
});
afterEach(()=>{delete process.env.CONTENT_FACTORY_ENABLED;delete process.env.CONTENT_FACTORY_ADMIN_UIDS;});
const post=()=>request(app).post("/api/admin/content-factory/jobs").send({requestId:"campaign-one",brief:"Make a campaign from an idea"});
test("unauthenticated request cannot queue generation",async()=>{expect((await post()).status).toBe(401);expect(service.create).not.toHaveBeenCalled();});
test("ordinary customer cannot queue generation",async()=>{expect((await post().set("x-test-uid","founder")).status).toBe(403);expect(service.create).not.toHaveBeenCalled();});
test("admin outside founder allowlist cannot queue generation",async()=>{expect((await post().set("x-test-uid","other").set("x-test-admin","true")).status).toBe(403);});
test("feature remains disabled even for the founder",async()=>{delete process.env.CONTENT_FACTORY_ENABLED;expect((await post().set("x-test-uid","founder").set("x-test-admin","true")).status).toBe(404);expect(service.create).not.toHaveBeenCalled();});
test("configured founder gets a private durable queued job with no render side effect",async()=>{
  const result=await post().set("x-test-uid","founder").set("x-test-admin","true");expect(result.status).toBe(202);
  expect(service.create).toHaveBeenCalledWith({uid:"founder",input:{requestId:"campaign-one",brief:"Make a campaign from an idea"}});
});
test("job lookup is passed to owner-scoped service",async()=>{
  await request(app).get(`/api/admin/content-factory/jobs/${"a".repeat(64)}`).set("x-test-uid","founder").set("x-test-admin","true");
  expect(service.get).toHaveBeenCalledWith("founder","a".repeat(64));
});
test('screenplay submission uses the same private founder gate and does no GPU work in HTTP',async()=>{
  const screenplay={create:jest.fn(async()=>({job:{productionId:'b'.repeat(64),status:'screenplay_ready'},duplicate:false}))};
  const filmApp=express();filmApp.use(express.json());filmApp.use('/factory',createRouter(service,screenplay));
  const body={requestId:'film-one',format:'fountain',text:'INT. ROOM - DAY\n\nA light appears.'};
  expect((await request(filmApp).post('/factory/screenplays').send(body)).status).toBe(401);
  expect((await request(filmApp).post('/factory/screenplays').set('x-test-uid','other').set('x-test-admin','true').send(body)).status).toBe(403);
  const result=await request(filmApp).post('/factory/screenplays').set('x-test-uid','founder').set('x-test-admin','true').send(body);
  expect(result.status).toBe(202);expect(screenplay.create).toHaveBeenCalledTimes(1);expect(screenplay.create).toHaveBeenCalledWith({uid:'founder',input:body});
  delete process.env.CONTENT_FACTORY_ENABLED;expect((await request(filmApp).post('/factory/screenplays').set('x-test-uid','founder').set('x-test-admin','true').send(body)).status).toBe(404);
});
