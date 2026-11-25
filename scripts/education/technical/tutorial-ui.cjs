// Actual controls with concise orientation. The owner removed the requirement
// to record long scrolling: show a path label and highlight the reached control.
const makeVisible=require('../cat/visible-ui.cjs');
module.exports=(page,clock,events)=>{
 const old=makeVisible(page,clock,events);
 async function orient(path){await page.evaluate(path=>{let el=document.getElementById('technical-teaching-path');if(!el){el=document.createElement('div');el.id='technical-teaching-path';el.style.cssText='position:fixed;z-index:2147483501;left:50%;top:8px;transform:translateX(-50%);max-width:650px;padding:9px 18px;border:1px solid #8eefd0;border-radius:9px;background:#0c1628;color:#eefaee;font:600 15px Arial;pointer-events:none;box-shadow:0 4px 16px #0008';document.body.append(el)}el.textContent=path},path);events.push({kind:'orientation-path',path,time:clock()});}
 async function aim(loc){await loc.waitFor({state:'attached'});await loc.evaluate(e=>e.scrollIntoView({block:'center',behavior:'instant'}));await page.waitForTimeout(250);const b=await loc.boundingBox();if(!b)throw Error('Control has no visible bounds');await old.move(b.x+b.width/2,b.y+b.height/2);await loc.evaluate(e=>{e.style.outline='3px solid #b0efcb';e.style.outlineOffset='3px';e.dataset.teachingFocus='1'});await page.waitForTimeout(250);return b;}
 async function click(loc){const b=await aim(loc);await page.mouse.click(b.x+b.width/2,b.y+b.height/2);await page.waitForTimeout(450);await old.clear()}
 async function fill(loc,v){await aim(loc);await loc.fill(String(v));await loc.press('Tab');await page.waitForTimeout(450);await old.clear()}
 async function select(loc,v){await aim(loc);await loc.selectOption(v);await page.waitForTimeout(450);await old.clear()}
 async function range(loc,value){await aim(loc);if(value===Number(await loc.getAttribute('min')||0)){await loc.press('Home')}else{const bounds=await loc.evaluate(e=>({min:Number(e.min||0),max:Number(e.max||100),step:Number(e.step)||1/24})),current=Number(await loc.inputValue()),steps=Math.round((value-current)/bounds.step);if(Math.abs(steps)<250){for(let i=0;i<Math.abs(steps);i++)await loc.press(steps>0?'ArrowRight':'ArrowLeft')}else{const b=await loc.boundingBox();await page.mouse.click(b.x+8+(b.width-16)*(value-bounds.min)/(bounds.max-bounds.min),b.y+b.height/2)}}await page.waitForTimeout(400);await old.clear()}
 async function tool(name){await orient(name);const hide=page.getByRole('button',{name:'Hide media',exact:true});if(await hide.isVisible())await click(hide);await click(page.getByRole('navigation',{name:'Creative tools'}).getByRole('button',{name,exact:true}))}
 return{...old,aim,click,fill,select,range,tool,orient};
};
