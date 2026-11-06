const assert=require('node:assert/strict');
const {Slime,Rolling}=require('../web/physics.js');
const s=new Slime(250,200,80);
const step=count=>{for(let i=0;i<count;i++)s.step(1/120);};
const det=(a,b,c)=>a.x*(b.y*c.z-b.z*c.y)-a.y*(b.x*c.z-b.z*c.x)+a.z*(b.x*c.y-b.y*c.x);
function positiveJacobian(body,x,y,z){
  const h=.001,p=body.deform(x,y,z),points=[[x+h,y,z],[x,y+h,z],[x,y,z+h]].map(v=>body.deform(...v));
  const axes=points.map(q=>({x:(q.x-p.x)/h,y:(q.y-p.y)/h,z:(q.z-p.z)/h}));
  assert(det(...axes)>.01,'deformation must never invert or collapse a volume cell');
}
s.grab(250,200);step(130);assert(s.press>.9);assert(s.sy>.3&&s.sy<.5,'pressure flattens, while retaining thickness');
assert(s.sx>1.5,'compression expands transverse directions');
for(let x=-.8;x<=.8;x+=.2)for(let y=-.8;y<=.8;y+=.2)positiveJacobian(s,x,y,.2);
s.release();step(1200);assert(s.deformation<.1,'compression recovers');
s.grab(250,200);s.move(450,10);step(100);assert(s.deformation>40,'drag stretches body');
for(let x=-.8;x<=.8;x+=.2)for(let y=-.8;y<=.8;y+=.2)positiveJacobian(s,x,y,.2);
s.release();step(1400);assert(s.deformation<.1,'stretch recovers');
for(let j=0;j<500;j++){
  s.grab(250,200);s.move(3000*(j%3-1),2000*(j%5-2));step(10);s.release();step(5);
  assert(s.values.every(Number.isFinite)&&s.velocity.every(Number.isFinite));
  assert(s.sy>.3&&s.expansion>0&&s.contraction>0);
  positiveJacobian(s,.2,-.1,.5);
}
step(1800);assert(s.deformation<.1,'500 extreme gestures recover');
s.grab(250,200);s.resize(180,150,60);assert(!s.hold,'resize cancels gesture');
for(const dt of [0,NaN,-1,Infinity])s.step(dt);assert(s.values.every(Number.isFinite));
console.log('PASS: 3D compression, positive thickness, stretch/recovery, 500 extreme gestures, 600+ non-inversion checks, resize cancellation, invalid frame gaps');
const right=new Rolling(),leftRoll=new Rolling();right.move(30,0,90);leftRoll.move(-30,0,90);
for(let i=0;i<15;i++){right.step(1/120);leftRoll.step(1/120);}
assert(right.angle<-.1&&leftRoll.angle>.1,'rolling follows travel direction');
for(let i=0;i<500;i++)right.step(1/120);
assert(!right.moving&&right.angle===0,'stopped rolling springs back upright');
for(let j=0;j<600;j++){
 leftRoll.move((j%3-1)*40,(j%5-2)*10,80);for(let i=0;i<6;i++)leftRoll.step(1/120);
 assert(Number.isFinite(leftRoll.angle)&&Number.isFinite(leftRoll.velocity));
}
leftRoll.reset();assert(!leftRoll.moving);
for(const [x,y,r] of [[NaN,0,80],[1,0,0],[Infinity,1,50],[10000,0,80]])leftRoll.move(x,y,r);
assert(!leftRoll.moving,'invalid movement and screen teleports do not spin');
console.log('PASS: rolling direction, rest/upright recovery, 600 interrupted moves, reset and teleport rejection');
