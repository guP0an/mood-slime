const assert=require('node:assert/strict');
const {faceMotion}=require('../web/physics.js');
const moods=require('../web/model.js').moods;
for(const {id} of moods){
  let previous;
  for(let i=0;i<2400;i++){
    const pose=faceMotion(id,i/100);
    assert(Object.values(pose).every(Number.isFinite));
    assert(Math.abs(pose.x)<=1&&Math.abs(pose.y)<=1&&pose.lid>=.06&&pose.lid<=1.1);
    if(previous)assert(Math.abs(pose.x-previous.x)<.08&&Math.abs(pose.y-previous.y)<.08,'idle gaze must move continuously');
    previous=pose;
  }
  assert.deepEqual(faceMotion(id,12,.9,-.9,true,true),{x:0,y:0,lid:1,brow:0,mouth:1});
}
const scan=Array.from({length:800},(_,i)=>faceMotion('anxious',i/100));
for(const axis of ['x','y'])assert(Math.max(...scan.map(p=>p[axis]))-Math.min(...scan.map(p=>p[axis]))>1,'anxiety scans both axes');
for(let t=0;t<8;t+=.1){
  assert(faceMotion('anxious',t,1,0,true).x>.5);
  assert(faceMotion('anxious',t,-1,0,true).x<-.5);
}
assert(faceMotion('tired',.42).lid<.15,'tired eyes close slowly');
assert(faceMotion('tired',1.2).lid>.85,'tired eyes reopen');
assert(Object.values(faceMotion('anxious',NaN,Infinity,NaN,true)).every(Number.isFinite));
console.log('PASS: nine continuous bounded eye motions, two-axis anxious scan, pointer attention, slow blink, reduced motion and invalid input');
