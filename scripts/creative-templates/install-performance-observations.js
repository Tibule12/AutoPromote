#!/usr/bin/env node
// Install bounded local observation jobs only after all real queue receipts exist.
const fs=require('node:fs'),path=require('node:path'),assert=require('node:assert/strict'),os=require('node:os'),{execFileSync}=require('node:child_process');
const root=path.resolve(__dirname,'../..'),report=path.join(root,'reports/content-performance-test-20261021'),book=JSON.parse(fs.readFileSync(path.join(report,'publishing/platform-packages.json')));
assert.equal(book.posts.length,6);assert(book.posts.every(p=>p.queueVerified&&p.contentId));
const units=path.join(os.homedir(),'.config/systemd/user');fs.mkdirSync(units,{recursive:true});const installed=[];
for(const p of book.posts)for(const hours of [24,72]){
 const at=new Date(Date.parse(p.scheduledAt)+(hours*60+10)*60000);assert(at.getTime()>Date.now());
 const calendar=at.toISOString().slice(0,19).replace('T',' ')+' UTC',name=`autopromote-performance-20261021-${p.platform}-${hours}h`;
 const log=path.join(report,'observations',name+'.private.log');fs.closeSync(fs.openSync(log,'a',0o600));
 fs.writeFileSync(path.join(units,name+'.service'),`[Unit]\nDescription=Observe the owned ${p.platform} restaurant test at ${hours} hours\nStartLimitIntervalSec=2h\nStartLimitBurst=3\n\n[Service]\nType=oneshot\nWorkingDirectory=${root}\nExecStart=${process.execPath} ${path.join(root,'scripts/creative-templates/measure-performance-cohort.js')} --platform ${p.platform} --hours ${hours}\nTimeoutStartSec=8min\nRestart=on-failure\nRestartSec=15min\nStandardOutput=append:${log}\nStandardError=append:${log}\n`,{mode:0o600});
 fs.writeFileSync(path.join(units,name+'.timer'),`[Unit]\nDescription=Observation window for ${p.platform} restaurant test\n\n[Timer]\nOnCalendar=${calendar}\nAccuracySec=1min\nPersistent=true\nUnit=${name}.service\n\n[Install]\nWantedBy=timers.target\n`,{mode:0o600});
 installed.push({platform:p.platform,windowHours:hours,scheduledAt:p.scheduledAt,observeAt:at.toISOString(),unit:name,timer:name+'.timer',contentId:p.contentId});
}
execFileSync('systemctl',['--user','daemon-reload']);for(const entry of installed)execFileSync('systemctl',['--user','enable','--now',entry.timer],{stdio:'pipe'});
for(const entry of installed)assert.equal(execFileSync('systemctl',['--user','is-active',entry.timer],{encoding:'utf8'}).trim(),'active');
fs.writeFileSync(path.join(report,'measurement-plan.json'),JSON.stringify({at:new Date().toISOString(),installed:true,normalSignedInAnalyticsUi:true,localMachineMustBeRunning:true,missedWindowsRecordActualAge:true,publicationAndReachAreNotGuaranteed:true,noPostingFromObserver:true,retentionUnavailable:true,observations:installed},null,2)+'\n');console.log(JSON.stringify({installedTimers:installed.length,windowsHours:[24,72],platforms:6}));
