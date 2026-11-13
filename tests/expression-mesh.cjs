const assert=require('node:assert/strict');
const fs=require('node:fs'),vm=require('node:vm'),path=require('node:path');
const context=vm.createContext({console,Float32Array,Math,window:{}});
vm.runInContext(fs.readFileSync(path.join(__dirname,'../web/vendor/three.min.js'),'utf8'),context);
const T=context.THREE;context.window.THREE=T;
const {Slime}=require('../web/physics.js');
class BaseFixture {
  constructor(){this.group=new T.Group();this.body=new Slime();this.features=[new T.Group()];this.mood='calm';this.clock=1;this.attentionUntil=0;this.lookTarget=new T.Vector2();this.reduced={matches:false};this.facialState={hurt:false};}
  attachFeatures(){this.features.forEach(f=>f.visible=true);}
  draw(){this.attachFeatures();}
}
context.MoodPet=BaseFixture;
vm.runInContext(fs.readFileSync(path.join(__dirname,'../web/expressions.js'),'utf8'),context);
const {profiles,acting}=context.window.MoodExpressions,pet=new context.window.MoodPet();
assert.equal(Object.keys(pet.studyFaces).length,7);
for(const mood of ['happy','overwhelmed','angry']){
  pet.mood=mood;pet.attachFeatures();assert.equal(pet.studyState.active,false);
  assert(pet.features.every(f=>f.visible));assert(Object.values(pet.studyFaces).every(f=>f.group.visible===false),'Three.js only skips visible === false; undefined renders every face');
}
for(const mood of Object.keys(profiles)){
  pet.mood=mood;pet.body.values.fill(0);pet.body.prepare();pet.attachFeatures();
  assert(pet.studyState.active);assert(pet.features.every(f=>!f.visible));
  assert.deepEqual(Object.values(pet.studyFaces).filter(f=>f.group.visible!==false).map(f=>f.mood),[mood]);
  const face=pet.studyFaces[mood],ids=face.parts.map(p=>p.mesh.geometry.uuid);
  for(const values of [[0,0,0],[.85,0,0],[0,.8,.4]]){
    pet.body.values=[...values];pet.body.prepare();
    for(const t of [1,3.85,3.94,4.5,5.1]){
      pet.clock=t;pet.attachFeatures();
      for(const part of face.parts){
        assert(Array.from(part.mesh.geometry.attributes.position.array).every(Number.isFinite),mood+' has finite deformed vertices');
        const coords=part.mesh.geometry.attributes.faceCoordinate;
        if(coords)assert(Array.from(coords.array).every(Number.isFinite));
      }
    }
  }
  assert.deepEqual(face.parts.map(p=>p.mesh.geometry.uuid),ids,'animations reuse geometry instead of rebuilding it');
  const savedReduced=pet.reduced;pet.reduced={matches:false};
  const closeTime=mood==='sleepy'?4.9:3.94;
  pet.clock=closeTime;pet.attachFeatures();
  for(const eye of face.eyes){
    assert.equal(eye.upper,eye.lower,'fully closed lids meet');
    for(const part of [eye.white,eye.outline,eye.iris,eye.glint])assert.equal(part.mesh.visible,false,'closed eye exposes neither sclera nor iris');
    assert.equal(eye.lid.mesh.visible,true,'one gentle eyelid remains');
  }
  pet.clock=1;pet.attachFeatures();
  for(const eye of face.eyes)assert(eye.white.mesh.visible&&eye.iris.mesh.visible,'eye reopens after a blink');
  if(mood==='sleepy')assert(face.eyes.every(e=>e.shadow&&e.shadow.mesh.material.transparent),'sleepy has soft under-eye shading');
  pet.reduced=savedReduced;
  pet.facialState.hurt=true;pet.attachFeatures();assert.equal(face.group.visible,false,'injury feedback overrides the new face');pet.facialState.hurt=false;
  pet.image={};pet.attachFeatures();assert.equal(face.group.visible,false,'custom skins hide the native face');pet.image=null;
  const a=acting(mood,1,false,0,0,true),b=acting(mood,9,true,1,-1,true);
  assert.deepEqual(a,b,'reduced motion freezes autonomous face and gaze');
  for(let i=0;i<1500;i++){
    const pose=acting(mood,i/100,false,0,0,false);
    assert(Object.values(pose).every(Number.isFinite));assert(pose.open>=0&&pose.open<=1);
  }
}
// Exercise transitions after every new face, including the protected original moods.
for(const from of Object.keys(profiles))for(const to of ['happy','overwhelmed','angry']){
  pet.mood=from;pet.attachFeatures();pet.mood=to;pet.attachFeatures();
  for(const face of Object.values(pet.studyFaces))assert.equal(face.group.visible,false,from+' -> '+to+' must hide all new face groups');
}
assert(acting('calm',3.94,false,0,0,false).open<.1,'blink closes the lid, not the whole eye scale');
assert.equal(acting('anxious',.1,false,0,0,false).x,acting('anxious',.5,false,0,0,false).x,'anxious gaze holds between movements');
for(const mood of Object.keys(profiles)){
  assert(acting(mood,2,true,1,0,false).x>0);
  assert(acting(mood,2,true,-1,0,false).x<0);
}
const html=fs.readFileSync(path.join(__dirname,'../web/index.html'),'utf8');
assert(html.indexOf('pet.js')<html.indexOf('expressions.js')&&html.indexOf('expressions.js')<html.indexOf('app.js'),'new face class loads before the app creates its pet');
console.log('PASS: 7 new 3D faces, 3 protected moods, squeeze/stretch geometry, closed/reopened lids, skin/injury override, black circles, reduced motion, pointer direction and load order');
