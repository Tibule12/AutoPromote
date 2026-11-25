// Keep the already built, actual Education components available for local
// review without running another compiler or starting any processing worker.
const fs=require('fs'),path=require('path'),express=require('express');
const root=path.resolve(__dirname,'../..'),build=process.env.EDUCATION_PREVIEW_BUILD||'/home/tibule12/.local/share/autopromote-qa/education-20261124/site-build',bundle=build+'/static/js/bundle.js';
if(!fs.existsSync(bundle))throw Error('Build the Education preview before serving it.');
const catalog=require(root+'/frontend/src/education/catCatalog.json');
for(const lesson of catalog.lessons)for(const name of ['result.mp4','tutorial.mp4','practice-kit.zip','student-worksheet.pdf','teacher-guide.pdf'])if(!fs.existsSync(root+'/frontend/public/education/cat-html-v1/'+lesson.id+'/'+name))throw Error('Missing review material: '+lesson.id+'/'+name);
const app=express();
app.get('/',(_req,res)=>res.type('html').send('<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>AutoPromote Education · CAT teacher review</title></head><body style="margin:0"><div id="root"></div><script defer src="/static/js/bundle.js"></script></body></html>'));
app.use(express.static(build));app.use(express.static(root+'/frontend/public'));
app.listen(5067,'127.0.0.1',()=>console.log('CAT review page ready: http://127.0.0.1:5067/#/education/cat — actual local components and verified materials.'));
