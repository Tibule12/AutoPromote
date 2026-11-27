const express = require('express');
const request = require('supertest');
const {PassThrough} = require('node:stream');
const mockPost = jest.fn();

jest.mock('axios',()=>({get:jest.fn(),post:mockPost}));
jest.mock('../authMiddleware',()=> (req,_res,next)=>{
  req.user={uid:'region-owner'};req.userId='region-owner';next();
});
jest.mock('../services/billingService',()=>({getEffectiveTierSnapshot:jest.fn(async()=>({testerAccess:null}))}));
jest.mock('../utils/cloudRunAuth',()=>({buildWorkerRequestConfig:jest.fn(async(_url,config)=>config)}));
jest.mock('../creditSystem',()=>({deductCredits:jest.fn(),refundCredits:jest.fn(),getCreditBreakdown:jest.fn()}));
jest.mock('../services/videoEditingService',()=>jest.fn().mockImplementation(()=>({})));

const routes=require('../mediaRoutes');
const app=()=>express().use('/api/media',routes);

test('authenticated region samples are disk-spooled and streamed as multipart, without a cloud upload or JSON amplification',async()=>{
  const packet=Buffer.from('APGRD001-private-programme-samples');
  let received;
  mockPost.mockImplementationOnce(async(_url,form,config)=>{
    expect(config.maxBodyLength).toBe(41*1024*1024);
    expect(config.headers['content-type']).toMatch(/^multipart\/form-data/);
    expect(config.signal).toBeDefined();
    const stream=new PassThrough(),chunks=[];
    const done=new Promise((resolve,reject)=>{stream.on('data',b=>chunks.push(b));stream.on('end',resolve);stream.on('error',reject);});
    form.pipe(stream);await done;received=Buffer.concat(chunks);
    return {data:{version:1,keyframes:[{time:0}],reviewRequired:true}};
  });
  const response=await request(app()).post('/api/media/track-studio-region').attach('file',packet,'programme.stframes');
  expect(response.statusCode).toBe(200);
  expect(response.body.reviewRequired).toBe(true);
  expect(received.includes(packet)).toBe(true);
  expect(received.toString()).toContain('filename="programme.stframes"');
  expect(mockPost.mock.calls[0][0]).toMatch(/\/track-studio-region$/);
});

test('missing samples and rejected worker analysis leave the selection unchanged',async()=>{
  const empty=await request(app()).post('/api/media/track-studio-region');
  expect(empty.statusCode).toBe(400);
  mockPost.mockRejectedValueOnce({response:{status:422,data:{detail:'This area has too little visible detail to track safely.'}}});
  const response=await request(app()).post('/api/media/track-studio-region').attach('file',Buffer.from('bad'),'programme.stframes');
  expect(response.statusCode).toBe(422);
  expect(response.body.error).toMatch(/too little visible detail/);
});

test('old live APIs cannot advertise the new render and tracking protocol',async()=>{
  const response=await request(app()).get('/api/media/studio-grade-capabilities');
  expect(response.statusCode).toBe(200);
  expect(response.body).toEqual({selectiveGradingVersion:3,regionTrackingVersion:1,faceRestorationVersion:2});
});
