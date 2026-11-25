// Original educational graphics interchange; Studio is the animation renderer.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'../..'),assets=root+'/frontend/public/education/it-studio-v1',D=28;
const key=(property,time,value,easing='hold')=>({property,time,value,easing});
function scene(id,title,subtitle){
  const layers=[],groups=[];
  const text=(id,copy,x,y,width=90,scale=.7,startTime=0,duration=D,color='#f2f6fc')=>{const l={id,name:id,type:'text',text:copy,x,y,width,scale,rotation:0,opacity:1,fontWeight:600,textAlign:'center',color,startTime,duration,keys:[]};layers.push(l);return l};
  const rect=(id,x,y,width,height,fill='#15263d',stroke='#426078',line=0)=>{const l={id,name:id,type:'artwork',x,y,width,height,scale:1,rotation:0,opacity:1,startTime:0,duration:D,mediaFit:'stretch',vectorShape:{version:1,closed:true,nodes:[[1,1],[99,1],[99,99],[1,99]].map(([x,y])=>({x,y,in:[0,0],out:[0,0]})),fill:{kind:fill?'solid':'none',color:fill||'#ffffff',endColor:fill||'#ffffff',start:[0,0],end:[100,100]},stroke:{color:stroke,width:line}},keys:[]};layers.push(l);return l};
  text('course','AUTOPROMOTE EDUCATION  /  CONCEPTS IN MOTION',50,6,94,.48,0,D,'#9ce9ca');text('heading',title,50,15,94,1.2).fontWeight=900;text('subtitle',subtitle,50,24,95,.59);
  text('footnote','ORIGINAL SUPPLEMENTARY TEACHING EXAMPLE  /  PAUSE, PREDICT, EXPLAIN',50,96,95,.38,0,D,'#8398b3');
  return {id,layers,groups,text,rect,save(){const spec={format:'autopromote-graphics',version:1,name:title,width:1280,height:720,duration:D,layers,groups};fs.writeFileSync(assets+'/'+id+'.graphics.json',JSON.stringify(spec,null,2)+'\n');return spec}};
}
{
 const s=scene('variables-loops','A loop changes the state.','Read each array value once. Add it to a running total. Keep indices separate from values.');
 const xs=[25,50,75],values=[2,4,6];
 values.forEach((v,i)=>{s.rect('array-card-'+i,xs[i],42,14,14,['#a8edcd','#86d9f2','#c4afff'][i]);s.text('array-value-'+i,String(v),xs[i],42,12,1.55,0,D,'#101b2b');s.text('array-index-'+i,'index '+i,xs[i],32,18,.52,0,D,'#b4c2d5');});
 const box=s.rect('current-index',25,42,18,18,null,'#ffffff',1.7);box.keys=[key('opacity',0,0),key('opacity',3,1),key('opacity',21,0),key('x',0,25),key('x',9,50),key('x',15,75)];
 s.rect('watch-panel',50,68,72,12);s.text('initial-state','i = 0     sum = 0',50,68,68,.82,0,6);
 for(const [start,end,i,total]of [[6,8,0,2],[8,12,1,2],[12,14,1,6],[14,18,2,6],[18,20,2,12],[20,28,3,12]])s.text('watch-'+start,`i = ${i}     sum = ${total}`,50,68,68,.82,start,end-start, '#9ce9ca');
 s.text('start-rule','Initialise: i = 0; sum = 0. Test i before reading values[i].',50,82,95,.64,0,3);
 for(let i=0;i<3;i++){
  const start=3+6*i,token=s.text('read-copy-'+i,String(values[i]),xs[i],42,12,.8,start+.5,3,'#ffffff');
  s.groups.push({id:'read-'+i,name:'Read value '+values[i]+' · copied token',layerIds:[token.id],startTime:0,duration:D,keys:[key('x',0,0),key('x',start+.5,0),key('x',start+2.5,50-xs[i],'ease_in_out'),key('y',0,0),key('y',start+.5,0),key('y',start+2.5,26,'ease_in_out')]});
  s.text('iteration-'+i,`Iteration ${i+1}: i = ${i} is less than 3. Read ${values[i]}; add it; then increment i.`,50,82,95,.61,start,6);
 }
 s.text('stop','i = 3 is not less than 3. Stop. There is no index 3 in this array.',50,82,95,.61,21,3);
 s.text('exercise','Predict: initialise sum to 10 instead. What is the final total, and why?',50,82,95,.61,24,4);
 s.save();
 fs.writeFileSync(assets+'/variables-loops-trace.json',JSON.stringify({values,initial:{i:0,sum:0},iterations:[{i:0,before:0,read:2,after:2,nextI:1},{i:1,before:2,read:4,after:6,nextI:2},{i:2,before:6,read:6,after:12,nextI:3}],final:{i:3,sum:12},changedInitialSumAnswer:22,sourceArrayMutated:false},null,2)+'\n');
}
{
 const s=scene('validation-debugging','A guard protects the result.','Validate first. Convert only accepted input. A failing boundary test exposes the bug.');
 s.rect('input-card',22,43,25,16,'#86d9f2');s.text('input-caption','RAW INPUT',22,33,26,.5,0,D,'#9ce9ca');
 s.text('input-256','256',22,43,23,1.5,0,18,'#101b2b');s.text('input-18','18',22,43,23,1.5,18,10,'#101b2b');
 s.rect('guard-card',52,43,25,16);s.text('guard-label','Digits only?\n0 through 255?',52,43,23,.67);
 s.rect('reject-card',82,37,23,10,'#432230');s.text('reject-label','REJECT',82,37,22,.72,0,D,'#ffc1c4');
 s.rect('accept-card',82,53,23,10,'#16352c');s.text('accept-label','CONVERT',82,53,22,.72,0,D,'#9ce9ca');
 const packet=s.text('decision-packet','●',52,43,9,.8,3,6,'#ffc1c4');
 s.groups.push({id:'rejection-path',name:'Rejection path · decision token',layerIds:[packet.id],startTime:0,duration:D,keys:[key('x',0,0),key('x',5,0),key('x',7,30,'ease_in_out'),key('y',0,0),key('y',5,0),key('y',7,-6,'ease_in_out')]});
 for(const [start,end,copy,color]of [[0,3,'Test case: 256. Expected outcome: reject.','#f2f6fc'],[3,6,'Digits-only format passes. Now test the numeric range.','#f2f6fc'],[6,9,'256 is above 255. Reject; do not generate a byte.','#ffc1c4'],[9,14,'BUG: accepting 0 through 256 would allow a 9-bit result.','#ffc1c4'],[14,18,'FIX: maximum 255. Rerun the failing case; 256 is rejected.','#9ce9ca'],[18,24,'18 passes both guards. Convert: 18 = 00010010.','#9ce9ca'],[24,28,'Test next: 0, 255, -1 and 18.5. Predict each outcome first.','#f2f6fc']])s.text('case-'+start,copy,50,75,95,.66,start,end-start,color);
 s.text('wrong-result','Wrong output: 100000000  /  nine bits',50,85,94,.63,9,5,'#ffc1c4');
 s.text('correct-result','Accepted output: 00010010  /  eight bits',50,85,94,.63,18,6,'#9ce9ca');
 s.save();
}
{
 const s=scene('database-joins','A relationship connects the rows.','Synthetic team data. A foreign key references a primary key; a query selects useful information.');
 s.text('entries-title','ENTRIES',29,33,45,.7,0,D,'#9ce9ca');s.text('teams-title','TEAMS',75,33,37,.7,0,D,'#9ce9ca');
 s.rect('entries-table',29,48,46,24);s.rect('teams-table',75,45,33,18);
 s.text('entries-head','id     teamId     score',29,39,43,.61);s.text('teams-head','id       name',75,39,30,.61);
 const rows=[[101,10,60],[102,20,80],[103,10,75]];
 rows.forEach((r,i)=>s.text('entry-'+r[0],`${r[0]}        ${r[1]}        ${r[2]}`,29,45+i*6,43,.62));
 s.text('team-10','10       Orbit',75,45,30,.62);s.text('team-20','20       Prism',75,51,30,.62);
 const marker=s.rect('relation-marker',29,57,46,5.5,null,'#9ce9ca',1.6);marker.keys=[key('opacity',0,0),key('opacity',10,1),key('opacity',15,0)];
 s.groups.push({id:'relationship',name:'Relationship highlight · matching IDs',layerIds:[marker.id],startTime:0,duration:D,keys:[key('x',0,0),key('x',10,0),key('x',13,46,'ease_in_out'),key('y',0,0),key('y',10,0),key('y',13,-12,'ease_in_out')]});
 for(const [start,end,copy]of [[0,5,'Two tables store different facts. Read the field names before joining.'],[5,10,'Primary keys: Entries.id and Teams.id. Each identifies one row.'],[10,15,'Entries.teamId is a foreign key. Match 10 to Teams.id = 10.'],[15,20,'WHERE score is at least 70 keeps entries 102 and 103.'],[20,24,'JOIN on Teams.id = Entries.teamId adds the matching team name.'],[24,28,'ORDER BY score DESC: Prism 80, then Orbit 75.']])s.text('query-step-'+start,copy,50,72,96,.62,start,end-start);
 s.text('query-rule','SELECT team name, score  /  JOIN by ID  /  filter score  /  order descending',50,84,96,.53,0,24,'#b4c2d5');
 s.text('query-result','Prism   80       •       Orbit   75',50,84,96,.82,24,4,'#9ce9ca');
 s.save();
 fs.writeFileSync(assets+'/database-example.sql',`-- Original, fictional example. SQLite-compatible; adapt to the classroom DBMS.\nCREATE TABLE Teams (id INTEGER PRIMARY KEY, name TEXT NOT NULL);\nCREATE TABLE Entries (id INTEGER PRIMARY KEY, teamId INTEGER NOT NULL REFERENCES Teams(id), score INTEGER NOT NULL);\nINSERT INTO Teams VALUES (10, 'Orbit'), (20, 'Prism');\nINSERT INTO Entries VALUES (101,10,60), (102,20,80), (103,10,75);\nSELECT Teams.name, Entries.score FROM Entries JOIN Teams ON Teams.id = Entries.teamId WHERE Entries.score >= 70 ORDER BY Entries.score DESC;\n`);
}
console.log('Authored three editable concept compositions, not movies.');
