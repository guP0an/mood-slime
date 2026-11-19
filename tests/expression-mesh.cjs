const assert=require('node:assert/strict');
const fs=require('node:fs'),vm=require('node:vm'),path=require('node:path');
const context=vm.createContext({console,Float32Array,Math,window:{}});
vm.runInContext(fs.readFileSync(path.join(__dirname,'../web/vendor/three.min.js'),'utf8'),context);
const T=context.THREE;context.window.THREE=T;
const {Slime}=require('../web/physics.js');
class BaseFixture {
  constructor(){this.group=new T.Group();this.body=new Slime();this.features=[new T.Group()];this.mood='calm';this.clock=1;this.attentionUntil=0;this.lookTarget=new T.Vector2();this.reduced={matches:false};this.facialState={hurt:false};this.mapped=[];}
  deformable(geometry,material){const mesh=new T.Mesh(geometry,material);this.mapped.push({mesh,rest:Float32Array.from(geometry.attributes.position.array)});this.group.add(mesh);return mesh;}
  attachFeatures(){this.features.forEach(f=>f.visible=true);}
  draw(){this.attachFeatures();}
}
context.MoodPet=BaseFixture;
vm.runInContext(fs.readFileSync(path.join(__dirname,'../web/expressions.js'),'utf8'),context);
const {profiles,acting}=context.window.MoodExpressions,pet=new context.window.MoodPet();
assert.equal(Object.keys(pet.studyFaces).length,14);
for(const mood of ['happy','angry','overwhelmed']){
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
  const closeTime=['sleepy','sick','headache','verytired'].includes(mood)?4.9:3.94;
  if(mood!=='overwhelmed'){
  pet.clock=closeTime;pet.attachFeatures();
  for(const eye of face.eyes){
    assert.equal(eye.upper,eye.lower,'fully closed lids meet');
    for(const part of [eye.white,eye.outline,eye.iris,eye.glint])assert.equal(part.mesh.visible,false,'closed eye exposes neither sclera nor iris');
    assert.equal(eye.lid.mesh.visible,true,'one gentle eyelid remains');
    if(eye.rim)assert.equal(eye.rim.mesh.visible,false,'illness rim disappears on complete closure');
  }
  pet.clock=1;pet.attachFeatures();
  for(const eye of face.eyes)assert(eye.white.mesh.visible&&eye.iris.mesh.visible,'eye reopens after a blink');
  }
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
for(const from of Object.keys(profiles))for(const to of ['happy','angry','overwhelmed']){
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
console.log('PASS: 14 3D faces, 3 protected faces, squeeze/stretch geometry, closed/reopened lids, skin/injury override, black circles, reduced motion, pointer direction and load order');

assert(pet.studyFaces.headache.wraps.length===2);assert(pet.studyFaces.sick.thermometer);
assert(pet.studyFaces.coding.keyboard.position.z>1.5,'keyboard leaves a visible gap in front of the body');
assert(pet.studyFaces.coding.hands.every(h=>h.position.z>1.5),'typing hands follow the moved keyboard');

const jailed=pet.studyFaces.jailed;
assert(jailed,'jailed state has its own face');
assert.equal(jailed.bars.length,5);assert.equal(jailed.hands.length,2);
assert.equal(jailed.grin.mesh.geometry.type,'TubeGeometry','jailed mouth is closed without teeth');
assert(Math.abs(jailed.grin.u)<.02,'mouth remains centered');
for(const eye of jailed.eyes)for(const bar of jailed.bars)assert(Math.abs(bar.position.x-eye.u)-eye.w-bar.geometry.parameters.radius>.035,'bars leave visible eye gaps');
pet.mood='jailed';pet.clock=1;pet.attachFeatures();
assert(jailed.hands.every(h=>h.position.y===-.40),'jailed hands stay on bars instead of running the coding animation');

const slacking=pet.studyFaces.slacking;
assert(slacking&&slacking.fish&&slacking.fishTail,'slacking has a real fish and tail');
assert.equal(slacking.hands.length,2);
pet.mood='slacking';pet.clock=1;pet.reduced={matches:false};pet.attachFeatures();
const firstStroke=slacking.hands[1].position.clone(),firstTail=slacking.fishTail.rotation.y;
pet.clock=1.6;pet.attachFeatures();
assert(slacking.hands[1].position.distanceTo(firstStroke)>.01,'petting hand strokes over time');
assert(Math.abs(slacking.fishTail.rotation.y-firstTail)>.01,'fish tail gently moves');
pet.reduced={matches:true};pet.attachFeatures();const stillHand=slacking.hands[1].position.clone(),stillTail=slacking.fishTail.rotation.y;
pet.clock=12;pet.attachFeatures();assert.equal(slacking.hands[1].position.distanceTo(stillHand),0);assert.equal(slacking.fishTail.rotation.y,stillTail);
pet.reduced={matches:false};pet.body.grab(pet.body.x,pet.body.y);pet.attachFeatures();const heldHand=slacking.hands[1].position.clone();pet.clock=14;pet.attachFeatures();assert.equal(slacking.hands[1].position.distanceTo(heldHand),0,'holding body stops petting');pet.body.release();
slacking.group.traverse(o=>{if(o.geometry)assert(Array.from(o.geometry.attributes.position.array).every(Number.isFinite));});

assert(slacking.mouth,'slacking owns the broad asymmetric smile');
const smileStart=slacking.mouth.point(0),smileEnd=slacking.mouth.point(1),smileCenter=slacking.mouth.point(.5);
assert(smileEnd[0]-smileStart[0]>.70,'smile spans most of the space below both eyes');
assert(smileEnd[1]-smileStart[1]>.05,'right smile corner curls upward');
assert(smileCenter[1]<smileStart[1]-.08,'smile has a rounded lower sweep');

const confident=pet.studyFaces.confident;
assert(confident&&confident.crown&&confident.sparkles.length===2,'confidence has a tilted crown and two sparkles');
pet.mood='confident';pet.clock=1;pet.reduced={matches:false};pet.attachFeatures();
assert(confident.eyes[0].v!==confident.eyes[1].v,'confident eyes have asymmetric placement');
assert(confident.smile.mesh.geometry.type==='ShapeGeometry','confidence has a shaped ivory grin');
const glow=confident.sparkles[0].scale.x;pet.clock=1.7;pet.attachFeatures();assert(Math.abs(glow-confident.sparkles[0].scale.x)>.005);
pet.reduced={matches:true};pet.attachFeatures();const stillSpark=confident.sparkles[0].scale.x;pet.clock=8;pet.attachFeatures();assert.equal(confident.sparkles[0].scale.x,stillSpark);
