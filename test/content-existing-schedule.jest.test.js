const express = require('express');
const request = require('supertest');

describe('schedule an existing owned recording', () => {
  let app, db, schedule;
  const owner = 'ownedRecordingUser123';
  const future = () => new Date(Date.now() + 3600000).toISOString();
  beforeEach(async () => {
    jest.resetModules();
    schedule = jest.fn(async (contentId, options) => ({id:'new-owned-schedule',contentId,...options}));
    jest.doMock('../src/promotionService', () => ({schedulePromotion:schedule}));
    db = require('../src/firebaseAdmin').db;
    await db.collection('content').doc('owned-recording').set({user_id:owner,url:'https://example.test/owned.mp4',type:'video'});
    app=express();app.use(express.json());app.use('/api/content',require('../src/contentRoutes'));
  });
  const send = (app, body, user=owner) => request(app).post('/api/content/owned-recording/promotion-schedules')
    .set('Authorization',`Bearer test-token-for-${user}`).send(body);
  test('retains exact copy, timezone and per-destination time on the existing content ID', async () => {
    const time=future(),later=new Date(Date.parse(time)+600000).toISOString();
    const options={title:'An editable outcome',commentary:'Platform-specific body',media_url:'https://example.test/owned.mp4'};
    await send(app,{time,timezone:'Africa/Johannesburg',platforms:['linkedin'],platformTimes:{linkedin:later},platformOptions:{linkedin:options}}).expect(200);
    expect(schedule).toHaveBeenCalledWith('owned-recording',expect.objectContaining({platform:'linkedin',startTime:later,frequency:'once',timezone:'Africa/Johannesburg',platformSpecificSettings:options}));
  });
  test('rejects another user before creating a schedule', async () => {
    await send(app,{time:future(),platforms:['linkedin']},'otherRecordingUser123').expect(403);
    expect(schedule).not.toHaveBeenCalled();
  });
  test.each([
    {platforms:['linkedin'],time:'2000-01-01T00:00:00Z'},
    {platforms:['linkedin','linkedin']},
    {platforms:['not-a-platform']},
    {platforms:['linkedin'],timezone:'Invalid/Zone'},
    {platforms:['linkedin'],platformOptions:{linkedin:{media_url:'https://example.test/another.mp4'}}},
  ])('rejects invalid destination data before writing: %j', async invalid => {
    await send(app,{time:future(),...invalid}).expect(400);
    expect(schedule).not.toHaveBeenCalled();
  });
});
