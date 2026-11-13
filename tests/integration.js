const checks=[];
const renderErrors=[];window.addEventListener('error',e=>renderErrors.push(e.message));
function check(value,label){if(!value)throw Error(label);checks.push(label);}
const wait=ms=>new Promise(r=>setTimeout(r,ms));
const app=window.moodApp;
const native=(action,data={})=>new Promise(resolve=>{const id=100000+Math.floor(Math.random()*100000);const original=window.nativeReply;window.nativeReply=(rid,value)=>{if(rid===id){window.nativeReply=original;resolve(value);}else original(rid,value);};window.webkit.messageHandlers.mood.postMessage({id,action,...data});});
await app.ready;
await native('testShowWindow');
const visibleDeadline=performance.now()+2500;while(document.hidden&&performance.now()<visibleDeadline)await wait(40);
check(!document.hidden,'PRECONDITION: native UI verification requires an unlocked Mac and a visible window: '+JSON.stringify(await native('testMenuInfo')));
await wait(120);
check(!!app,'app booted in native WebKit');
const initialCanvas=document.getElementById('pet'),gl=app.pet.renderer.getContext(),pixel=new Uint8Array(4);
app.pet.draw();gl.readPixels(Math.floor(initialCanvas.width/2),Math.floor(initialCanvas.height/2),1,1,gl.RGBA,gl.UNSIGNED_BYTE,pixel);
check(pixel[3]>0,'3D pet is painted before any interaction');
check(app.pet.mesh.geometry.attributes.position.count>2000&&app.pet.material.isMeshPhysicalMaterial,'real 3D mesh and physically lit material');
check(document.getElementById('record').getBoundingClientRect().bottom<=innerHeight,'record action is visible without scrolling');
check(document.querySelectorAll('.mood-option').length===10,'ten selectable moods include sleepy');
check(Object.keys(app.snapshot().summaries).length>0,'missed midnights archived at launch');
document.querySelector('.local-label').textContent='合成数据 · 集成自检';
const before=app.snapshot().events.length;
document.querySelector('[data-mood="happy"]').click();
document.getElementById('note').value='<img src=x onerror=alert(1)> 合成测试';
document.getElementById('record').click();await app.whenIdle();
check(app.snapshot().events.length===before+1,'record button saves to native bridge');
check(!document.querySelector('.timeline img')&&document.querySelector('.timeline').textContent.includes('<img'),'notes render as literal text');
check(document.getElementById('save-state').textContent.includes('已保存'),'save acknowledged before saved label');
await Promise.all([app.saveMood('calm','并发合成 A'),app.saveMood('tired','并发合成 B')]);
check(app.snapshot().events.length===before+3,'serialized saves preserve both rapid records');
document.getElementById('today').click();
check(document.querySelectorAll('.timeline li').length===3,'daily timeline matches saved events');
check(document.getElementById('time-cursor').step==='1'&&document.getElementById('time-cursor').max==='1439','time slider supports all 1440 minutes');
check(document.querySelectorAll('#time-points .time-point').length===3,'same-minute changes all retain an individual record point');
check(!document.getElementById('record-details').open,'record list is collapsed beneath the primary time axis');
const cursor=document.getElementById('time-cursor');
cursor.value='0';cursor.dispatchEvent(new Event('input',{bubbles:true}));
check(document.getElementById('moment-mood').textContent==='\u672a\u8bb0\u5f55','time before first entry stays unrecorded');
document.querySelector('#time-points .time-point').click();
check(document.getElementById('moment-note').textContent.includes('<img')&&!document.querySelector('#moment img'),'record point inspection preserves literal note safely');
const timelineDay=app.snapshot().events.find(e=>e.id==='synthetic-axis-0').day;

if(!document.querySelector('[data-day="'+timelineDay+'"]'))document.getElementById('prev-month').click();
document.querySelector('[data-day="'+timelineDay+'"]').click();
const axis=MoodModel.dayTimeline(app.snapshot(),timelineDay);
check(Math.abs([...document.querySelectorAll('.time-segment')].reduce((sum,node)=>sum+Number(node.dataset.end)-Number(node.dataset.start),0)-axis.knownMinutes)<.001,'rendered segments match model durations rather than record counts');
check(axis.knownMinutes===890&&axis.segments.length===4,'historical 24-hour axis preserves 9:10 to midnight sample intervals');
cursor.value='720';cursor.dispatchEvent(new Event('input',{bubbles:true}));
check(document.getElementById('moment-mood').textContent==='\u5e73\u9759'&&document.getElementById('moment-range').textContent.includes('11:40:00'),'minute slider finds the correct mood interval and exact bounds');
check(document.getElementById('moment-note').textContent==='\u5408\u6210\u793a\u4f8b\uff1a\u5b89\u9759\u505a\u4e8b','minute inspector shows interval note');
document.querySelector('.day-detail').scrollIntoView({block:'end'});await wait(100);
check(!document.querySelector('.axis-top').textContent.includes(String.fromCharCode(92)+'u'),'time axis headings display real text rather than escapes');
check((await native('testSnapshot',{name:'time-axis.png'})).ok,'24-hour time axis screenshot');
window.scrollTo(0,0);
document.getElementById('today').click();
check(document.querySelector('.day[aria-pressed=true] svg rect')!==null,'calendar renders mood colors');

async function showWindow(){
  if(document.hidden||!document.hasFocus())await native('testShowWindow');
  const deadline=performance.now()+2000;
  while(document.hidden&&performance.now()<deadline)await wait(40);
  check(!document.hidden,'PRECONDITION: animated checks require a genuinely visible native window: '+JSON.stringify(await native('testMenuInfo')));
}
await native('testFailNextSave');
check(!(await app.saveMood('angry','合成失败测试')),'failed native write is surfaced');
check(app.snapshot().events.length===before+3&&!app.pending,'failed save never invents a saved record or leaves controls blocked');
check(document.getElementById('save-state').textContent.includes('失败'),'failed save shows actionable message');
check(await app.saveMood('happy','合成恢复测试'),'recording recovers after failed write');
await wait(80);
document.getElementById('record-details').open=true;
check((await native('testSnapshot',{name:'calendar.png'})).ok,'calendar screenshot');
document.getElementById('record-details').open=false;
const canvas=document.getElementById('pet');
await showWindow();
const focusDeadline=performance.now()+2000;while(!document.hasFocus()&&performance.now()<focusDeadline)await wait(40);
check(document.hasFocus(),'PRECONDITION: keyboard focus assertions require the native test window to own focus');
canvas.dispatchEvent(new PointerEvent('pointerdown',{button:0,pointerId:991,clientX:-1000,clientY:-1000,bubbles:true}));
canvas.focus({preventScroll:true});
check(getComputedStyle(canvas).outlineStyle==='none','pointer-focused canvas has no green rectangular focus frame');
document.dispatchEvent(new KeyboardEvent('keydown',{key:'Tab',bubbles:true}));
check(getComputedStyle(canvas).outlineStyle==='solid','keyboard focus remains visible for accessible interaction');
const pressClock=app.pet.clock,pressFrame=app.pet.renderer.info.render.frame,pressWall=performance.now();
canvas.dispatchEvent(new KeyboardEvent('keydown',{code:'Space',key:' ',bubbles:true}));await wait(750);
check(app.pet.body.press>.6&&app.pet.body.deformation>20,'held press creates real soft-body compression: '+JSON.stringify({press:app.pet.body.press,deformation:app.pet.body.deformation,held:!!app.pet.body.hold,hidden:document.hidden,focused:document.hasFocus(),simulationSeconds:app.pet.clock-pressClock,renderedFrames:app.pet.renderer.info.render.frame-pressFrame,wallMilliseconds:performance.now()-pressWall}));
check(app.pet.injury>.4,'compression adds bandage state');
check((await native('testSnapshot',{name:'squashed.png'})).ok,'squashed bandage screenshot');
canvas.dispatchEvent(new KeyboardEvent('keyup',{code:'Space',key:' ',bubbles:true}));
check(!app.pet.body.hold,'key release clears gesture');
app.pet.setMood('happy');app.pet.draw();
check(app.pet.injury>.4&&app.pet.patches.some(p=>p.visible),'release preserves visible bandages');
check(!app.pet.wasHurt&&!app.pet.tear.visible&&app.pet.mouth.userData.expression==='happy'&&app.pet.happyEyes.every(e=>e.visible)&&app.pet.grin.visible,'happy mood restores the closed-eye toothy smile with bandages after release');

app.pet.body.grab(app.pet.body.x+30,app.pet.body.y);app.pet.body.move(app.pet.body.x+130,app.pet.body.y-90);await wait(600);
check(Array.from(app.pet.mesh.geometry.attributes.position.array).every(Number.isFinite),'pulled 3D mesh remains finite');
check((await native('testSnapshot',{name:'stretch.png'})).ok,'3D stretch screenshot');app.pet.release();
app.pet.press();window.dispatchEvent(new Event('blur'));check(!app.pet.body.hold,'focus loss releases press');
const injuryBeforeStroke=app.pet.injury;
document.getElementById('stroke').click();check(app.pet.injury<injuryBeforeStroke&&!app.pet.body.hold,'stroking reduces accumulated injuries and releases the gesture');
await wait(900);
await app.desktop(true);await wait(350);
check(app.mini&&document.body.classList.contains('mini'),'desktop mode enabled');
check(canvas.getBoundingClientRect().width<350,'desktop canvas fits mini window');
const initialMini=await native('testMenuInfo');
check(initialMini.scale===.5&&initialMini.width===170&&initialMini.height===150,'desktop starts at the small 50 percent default');
await showWindow();canvas.dataset.input='keyboard';canvas.focus({preventScroll:true});
const desktopFocusDeadline=performance.now()+2000;
while(document.activeElement!==canvas&&performance.now()<desktopFocusDeadline){canvas.focus({preventScroll:true});await wait(40);}
check(document.activeElement===canvas,'desktop keyboard indicator requires actual canvas focus');
check(getComputedStyle(canvas).outlineStyle==='none','desktop keyboard focus cannot paint a clipped line above the notification bubble');
const focusSlot=document.getElementById('mini-pet-slot'),focusMark=getComputedStyle(focusSlot,'::after');
check(focusMark.width==='4px','desktop keyboard focus retains a small corner indicator: '+JSON.stringify({width:focusMark.width,content:focusMark.content,input:canvas.dataset.input,active:document.activeElement===canvas,matches:focusSlot.matches(':has(canvas[data-input="keyboard"]:focus)'),body:document.body.className,windowFocus:document.hasFocus()}));
canvas.dataset.input='pointer';canvas.blur();
check(!document.querySelector('#mini-ui button')&&getComputedStyle(document.getElementById('pet-reaction')).clipPath==='inset(50%)','desktop has only the ball, with no color bar, labels or toolbar');
const codexEventCount=app.snapshot().events.length;
const alert=await native('testCodexAlert');
check(alert.badgeVisible&&alert.safeChatURL,'native Codex badge supports attention and safe chat navigation');
check(getComputedStyle(document.getElementById('mini-pet-slot')).paddingTop==='16px','desktop pet reserves 16px below the native notification badge');
for(const [kind,label] of [['completed','Codex 有消息'],['question','小问题'],['approval','点头']]){
  const message=await native('testCodexAlert',{kind});
  check(message.badgeVisible&&message.badgeTitle.includes(label)&&message.fitsWindow,'cute '+kind+' notification is distinct and fits the small desktop window');
  check(message.horizontalPadding>=8&&message.verticalPadding>=8,'notification text has comfortable horizontal and vertical padding for '+kind);
  const paper=await native('testCodexPaper');
  check(paper.shown&&paper.paused&&paper.labels.length===1&&paper.labels[0].includes('设计桌面心情日历')&&paper.labels[0].split('\n').length===3&&paper.textFits,'native paper shows chat title, turn status and time, fits all lines and pauses following for '+kind);
  check((await native('testSnapshot',{name:'paper-'+kind+'.png'})).ok,'native paper component rendering captured for '+kind);
  const closed=await native('testCodexPaper',{close:true});
  check(!closed.shown&&!closed.paused,'paper closes and restores following gate for '+kind);
}
check((await native('testDismissCodexAlert')).ok,'Codex badge dismisses after handling');
check(alert.allSpaces&&alert.allApps&&alert.fullScreen&&alert.topmost&&alert.nonactivating,'desktop panel joins all spaces and applications with nonactivating topmost behavior');
check(app.snapshot().events.length===codexEventCount,'Codex task alerts never create mood entries');
const fullScreen=await native('testFullScreenOverlay');
check(fullScreen.ok&&fullScreen.fixtureFullscreen&&fullScreen.fixtureActive,'independent fixture app enters a real full-screen space: '+JSON.stringify(fullScreen));
check(fullScreen.ok&&fullScreen.fixtureFullscreen&&fullScreen.fixtureActive&&fullScreen.overlayDiagnostics.serverAboveFixture&&fullScreen.overlayDiagnostics.consecutive>=3,'pet and independent fullscreen fixture are simultaneously on screen, pet ordered above it in three consecutive samples: '+JSON.stringify(fullScreen));
check(document.scrollingElement.scrollHeight<=innerHeight&&document.scrollingElement.scrollWidth<=innerWidth,'desktop document fits the window without scrollable overflow');
window.scrollTo(0,100);
check(scrollY===0&&getComputedStyle(document.documentElement).overflowY==='hidden','desktop page cannot scroll or show a root scroll indicator');
await showWindow();
const settleClock=app.pet.clock,settlingDeadline=performance.now()+2500;while(!app.pet.body.settled&&performance.now()<settlingDeadline)await wait(40);
check(app.pet.body.settled,'body recovers after stretching before desktop rest state: '+JSON.stringify({hidden:document.hidden,simulated:app.pet.clock-settleClock,values:app.pet.body.values,speed:app.pet.body.speed,held:!!app.pet.body.hold,native:await native('testMenuInfo'),renderErrors}));
const menu=await native('testMenuInfo');
const flatten=items=>items.flatMap(i=>[i,...flatten(i.children||[])]);
const menuItems=flatten(menu.items);
check(menuItems.filter(i=>i.command?.startsWith('mood:')).length===10,'native context menu exposes all ten moods');
check(['follow','stroke','squish','move','skin','resetSkin','export','storage','calendar','hide','quit'].every(command=>menuItems.some(i=>i.command===command)),'native context menu exposes follow, interaction, settings and calendar actions');
check(!menu.following,'cursor following is opt-in by default');
check((await native('testMenuCommand',{command:'follow'})).ok,'native follow menu toggles on');
const followMenu=await native('testMenuInfo');
check(followMenu.following&&flatten(followMenu.items).find(i=>i.command==='follow').checked,'follow menu checkmark reflects enabled state');
const motion=await native('testDesktopMotion');
check(motion.defaultSqueezes&&motion.optionDrags&&motion.controlOpensMenu,'desktop plain left input squeezes, Option drags and Control retains menu');
check(motion.moved,'follow policy moves the actual native window toward a synthetic cursor target');
check(motion.buttonsPause&&motion.dragPauses&&motion.calendarPauses,'following pauses for held buttons, direct drag and calendar');
await native('testMenuCommand',{command:'follow'});
check(!(await native('testMenuInfo')).following,'native follow menu toggles off');
await native('testMenuCommand',{command:'size:0.5'});
await native('testMenuCommand',{command:'follow'});
check((await native('testMenuCommand',{command:'recover'})).ok,'recover menu restores the desktop ball');
await wait(120);
const recovered=await native('testMenuInfo');
check(Math.abs(recovered.scale-.5)<.01&&Math.abs(recovered.width-170)<2&&recovered.onScreen&&!recovered.following&&!recovered.moving,'recovery keeps the requested small default visible and pauses following');
const countBeforeRolling=app.snapshot().events.length;
check((await native('testRollingMove')).ok,'Option-down and dragged handlers move the native window before mouse-up');
await wait(130);
check(app.pet.reduced.matches||Math.abs(app.pet.rolling.angle)>.04,'moving native window visibly rotates the whole character');
check((await native('testMenuInfo')).dragging,'character renders rotation while native drag is still held');
check((await native('testSnapshot',{name:'rolling.png'})).ok,'actual rolling character screenshot');
check((await native('testRollingEnd')).ok,'mouse-up releases native drag state');
await wait(1800);
check(Math.abs(app.pet.rolling.angle)<.015,'character settles upright after movement stops');
check(app.snapshot().events.length===countBeforeRolling,'rolling never records a mood');
check(menuItems.filter(i=>i.command?.startsWith('size:')).length===5,'native size menu exposes five size presets');
for(const [command,width] of [['size:0.5',170],['size:1.5',510],['size:2',680],['size:1',340]]){
  check((await native('testMenuCommand',{command})).ok,'native resize accepts '+command);
  await wait(120);
  check(app.pet.rolling.angle===0,'resizing resets roll without a spin: '+command);
  const info=await native('testMenuInfo'),actual=canvas.getBoundingClientRect();
  check(Math.abs(info.width-width)<2&&Math.abs(actual.width-width)<2&&info.onScreen,'native and rendered ball resize proportionally on screen: '+command);
  check(document.scrollingElement.scrollHeight<=innerHeight&&scrollY===0,'resizing creates no desktop scroll bar: '+command);
  check(flatten(info.items).find(i=>i.command===command).checked,'size menu selection matches current size: '+command);
}
await showWindow();
canvas.dispatchEvent(new KeyboardEvent('keydown',{code:'Space',key:' ',bubbles:true}));
const pressDeadline=performance.now()+2000;while(app.pet.body.hold&&app.pet.body.press<=.6&&performance.now()<pressDeadline)await wait(40);
check(!!app.pet.body.hold&&app.pet.body.press>.6,'desktop squeeze remains functional after zooming and moving: '+JSON.stringify({hidden:document.hidden,held:!!app.pet.body.hold,press:app.pet.body.press}));
canvas.dispatchEvent(new KeyboardEvent('keyup',{code:'Space',key:' ',bubbles:true}));
check(!app.pet.body.hold,'desktop press releases after zoom');
await wait(1300);
app.pet.release();app.pet.lookAtDesktop(.8,-.6);
check(Math.abs(app.pet.lookTarget.x-.24)<.001&&Math.abs(app.pet.lookTarget.y+.09)<.001||app.pet.reduced.matches,'native desktop gaze accepts cursor positions outside the canvas: '+JSON.stringify({held:!!app.pet.body.hold,x:app.pet.lookTarget.x,y:app.pet.lookTarget.y,reduced:app.pet.reduced.matches}));
const menuBefore=app.snapshot().events.length;
check((await native('testMenuCommand',{command:'mood:happy'})).ok,'native mood menu command succeeds');
check(app.snapshot().events.length===menuBefore+1&&app.snapshot().events.at(-1).mood==='happy','native menu mood command saves a timestamped entry');
const checkedMenu=flatten((await native('testMenuInfo')).items);
check(checkedMenu.find(i=>i.command==='mood:happy').checked,'native mood menu checkmark matches saved mood');
app.pet.injury=.6;app.pet.draw();
check(!app.pet.wasHurt&&app.pet.mouth.userData.expression==='happy'&&!app.pet.tear.visible,'desktop happy mood remains cheerful while wearing bandages');
check((await native('testSnapshot',{name:'happy-bandaged.png'})).ok,'happy bandaged desktop screenshot');
check((await native('testMenuCommand',{command:'stroke'})).ok&&app.pet.injury<.1,'native stroke menu heals the ball');
const move=await native('testMenuCommand',{command:'move'});
check(move.ok&&move.moving,'native move command arms the next drag');
check((await native('testSnapshot',{name:'desktop.png'})).ok,'desktop screenshot');
check((await native('testMenuCommand',{command:'calendar'})).ok,'native menu opens calendar');await wait(250);
check(!app.mini&&canvas.getBoundingClientRect().width>350,'calendar mode restores canvas');
check(!document.documentElement.classList.contains('desktop-mode')&&getComputedStyle(document.documentElement).overflowY!=='hidden','calendar scrolling is restored after leaving desktop mode');
check(!(await native('testMenuInfo')).moving,'expanding cancels pending window move');
check(document.getElementById('pet-host').parentElement.classList.contains('companion'),'pet host reattached once');
for(let attempt=0;attempt<3;attempt++){
  await app.desktop(true);
  const started=performance.now();
  check((await native('testMenuCommand',{command:'calendar'})).ok,'calendar command completes on repeated desktop switch '+attempt);
  const elapsed=performance.now()-started,lifecycle=await native('testWindowLifecycle');
  check(!app.mini&&!lifecycle.desktop&&lifecycle.visible&&lifecycle.webAttached&&lifecycle.keepsRunning,'restored calendar is visible, owns WebView and survives the production quit policy '+attempt);
  check(elapsed<1500,'calendar switch responds within 1.5 seconds: '+Math.round(elapsed)+'ms');
}
document.getElementById('prev-month').click();const previous=document.getElementById('month-label').textContent;document.getElementById('next-month').click();check(previous!==document.getElementById('month-label').textContent,'month navigation');
const pixels=new Uint8ClampedArray(16*16*4);for(let i=0;i<pixels.length;i+=4){pixels[i]=235;pixels[i+1]=160;pixels[i+2]=120;pixels[i+3]=255;}
const off=document.createElement('canvas');off.width=16;off.height=16;off.getContext('2d').putImageData(new ImageData(pixels,16,16),0,0);
await app.pet.setSkin({id:'00000000-0000-4000-8000-000000000000',name:'synthetic',size:16,columns:1,durations:[.1]},off.toDataURL());
app.pet.press();await wait(500);check(!!app.pet.image,'custom alpha image loaded into deformable renderer');
check((await native('testSnapshot',{name:'skin.png'})).ok,'skin deformation screenshot');
app.pet.release();await app.pet.setSkin(null);await app.whenIdle();
const imported=await native('testImportSkin');check(imported.ok&&imported.skin.durations.length===2,'native GIF decoder returns two-frame atlas');
check(await app.applyImportedSkin(imported),'imported animated skin persists through same UI save path');
await showWindow();
const frames=new Set(),frameSamples=[],animationStart=performance.now(),animationClock=app.pet.clock;
while(performance.now()-animationStart<2000&&frames.size<2){await wait(45);frames.add(app.pet.spriteFrame);frameSamples.push({frame:app.pet.spriteFrame,clock:app.pet.clock,hidden:document.hidden});}
check(app.pet.reduced.matches?frames.size===1&&frames.has(0):frames.size===2,'animated skin advances both frames, or stays on frame zero under reduced motion: '+JSON.stringify({reduced:app.pet.reduced.matches,frames:[...frames],simulated:app.pet.clock-animationClock,samples:frameSamples,renderErrors}));
document.getElementById('reset-skin').click();await app.whenIdle();await wait(100);check(!app.snapshot().skin&&!app.pet.image,'reset skin clears saved manifest and renderer');
check(!app.pending,'no outstanding save');
await app.desktop(true);await showWindow();
const eyeKinds=new Set(),eventsBeforeFaces=app.snapshot().events.length;
for(const mood of MoodModel.moods){
  app.pet.delightUntil=0;app.pet.heartUntil=0;app.pet.setMood(mood.id);
  app.pet.look.set(0,0);app.pet.lookTarget.set(0,0);app.pet.attentionUntil=0;
  app.pet.clock=mood.id==='happy'?1.8:mood.id==='tired'?2.7:1;
  app.pet.draw();
  check(app.pet.rope.visible===(mood.id==='overwhelmed'),'suspension rope is limited to the overwhelmed native ball: '+mood.id);
  if(mood.id==='overwhelmed'){
    const mouthCorner=app.pet.overwhelmedMouth.localToWorld(app.pet.overwhelmedMouth.children[0].geometry.parameters.path.getPoint(1));
    const tongueRoot=app.pet.overwhelmedTongue.localToWorld(new THREE.Vector3(0,0,.006));
    check(tongueRoot.distanceTo(mouthCorner)<.001,'tongue root remains attached to the actual mouth endpoint');
    const tonguePoint=app.pet.overwhelmedTongue.localToWorld(new THREE.Vector3(0,-.04,.012)).project(app.pet.camera),tonguePixel=new Uint8Array(4);
    gl.readPixels(Math.round((tonguePoint.x*.5+.5)*initialCanvas.width),Math.round((tonguePoint.y*.5+.5)*initialCanvas.height),1,1,gl.RGBA,gl.UNSIGNED_BYTE,tonguePixel);
    check(app.pet.overwhelmedTongue.parent===app.pet.overwhelmedMouth&&tonguePixel[3]===255&&tonguePixel[0]>tonguePixel[1]+30&&tonguePixel[2]>tonguePixel[1],'overwhelmed tongue hangs from one mouth corner and renders pink');
    const head=app.pet.body.deform(0,1,0),end=app.pet.group.localToWorld(new THREE.Vector3(head.x,head.y,head.z));
    const ropeEnd=app.pet.rope.localToWorld(new THREE.Vector3(0,.5,0));
    const ropeWidth=new THREE.Box3().setFromObject(app.pet.rope).getSize(new THREE.Vector3()).x,ballWidth=new THREE.Box3().setFromObject(app.pet.mesh).getSize(new THREE.Vector3()).x;
    check(ropeWidth/ballWidth>.035&&app.pet.rope.material.map!==null,'hanging rope has visible thickness and a twisted-fiber texture');
    check(app.pet.expressionEyes[1].position.y-app.pet.expressionEyes[0].position.y>.1,'vacant eyes retain the reference height difference');
    for(const eye of app.pet.expressionEyes){
      const fill=eye.userData.parts.shell.userData.fill,positions=fill.geometry.attributes.position,bounds=new THREE.Box2(),point=new THREE.Vector3();
      for(let i=0;i<positions.count;i++){
        fill.localToWorld(point.fromBufferAttribute(positions,i)).project(app.pet.camera);
        bounds.expandByPoint(new THREE.Vector2(point.x*initialCanvas.width,point.y*initialCanvas.height));
      }
      const size=bounds.getSize(new THREE.Vector2()),ratio=size.x/size.y;
      check(ratio>.9&&ratio<1.2,'vacant eye remains round after the actual camera and body transforms: '+ratio.toFixed(3));
    }
    check(ropeEnd.distanceTo(end)<.001&&app.pet.group.position.y>.2&&app.pet.shadow.material.opacity<1,'rope stays attached to the raised ball and the ground shadow softens');
  }
  const forehead=app.pet.body.deform(0,.65,Math.sqrt(1-.65*.65));
  const sample=app.pet.mesh.localToWorld(new THREE.Vector3(forehead.x,forehead.y,forehead.z)).project(app.pet.camera),bodyPixel=new Uint8Array(4);
  gl.readPixels(Math.round((sample.x*.5+.5)*initialCanvas.width),Math.round((sample.y*.5+.5)*initialCanvas.height),1,1,gl.RGBA,gl.UNSIGNED_BYTE,bodyPixel);
  const brightest=Math.max(...bodyPixel.slice(0,3)),saturation=(brightest-Math.min(...bodyPixel.slice(0,3)))/Math.max(1,brightest);
  check(bodyPixel[3]>=220&&brightest>150&&saturation>.025&&saturation<.55,'rendered '+mood.id+' jelly stays visible and softly colored without oversaturation: '+saturation.toFixed(3));
  const newFace=app.pet.studyFaces[mood.id];
  check(Object.values(app.pet.studyFaces).filter(f=>f.group.visible!==false).length===(newFace?1:0),'exactly the selected face is visible without overlays: '+mood.id);
  if(newFace)check(newFace.group.visible&&app.pet.features.every(f=>f.visible===false),'new face replaces all legacy facial parts: '+mood.id);
  eyeKinds.add(newFace?JSON.stringify(newFace.profile):mood.id==='happy'?'closed reference laugh':mood.id==='angry'?'original anger':JSON.stringify(app.pet.expressionEyes[0].userData.profile));
  const bodyWidth=new THREE.Box3().setFromObject(app.pet.mesh).getSize(new THREE.Vector3()).x;
  if(mood.id==='calm'){
    const glassesBox=new THREE.Box3();newFace.parts.filter(p=>p.mesh.material===app.pet.studyGlass).forEach(p=>glassesBox.expandByObject(p.mesh));
    const ratio=glassesBox.getSize(new THREE.Vector3()).x/bodyWidth;
    check(ratio>=.6&&ratio<=.8,'actual 3D glasses cover 60 to 80 percent of the ball width: '+ratio.toFixed(3));
  }
  if(mood.id==='happy')check(new THREE.Box3().setFromObject(app.pet.grin).getSize(new THREE.Vector3()).x/bodyWidth>=.33,'actual toothy smile occupies at least one third of the ball width');
  if(mood.id==='happy')check(app.pet.reduced.matches||app.pet.grin.visible&&app.pet.joyBlush.visible&&app.pet.happyEyes.every(e=>e.visible)&&app.pet.expressionEyes.every(e=>!e.visible)&&app.pet.grin.userData.fill.geometry.type==='ExtrudeGeometry'&&app.pet.facialState.cheekRaise>.05,'joy uses the selected closed smile eyes, two cheek marks and scalloped toothy grin');
  if(mood.id==='sad')check(newFace.eyes.every(e=>e.tear.mesh.visible)&&!app.pet.grin.visible,'sad expression has visible tear pools and no happy laugh');
  const tintInfo=await native('testCodexAlert',{kind:'completed'});
  check(tintInfo.petTint.toLowerCase()==='#'+app.pet.color.getHexString(),'notification bubble follows the rendered pet color for '+mood.id);
  if(mood.id==='tired'){
    check(newFace.eyes.every(e=>e.open<.55)&&!newFace.yawn&&!app.pet.grin.visible,'fatigue uses heavy low eyelids and a slack closed mouth without a permanent yawn');
    check(app.pet.group.scale.y<.93&&app.pet.group.scale.x>1&&app.pet.group.position.y<0,'exhaustion has a grounded slouched silhouette instead of a sleepy upright pose');
  }
  if(mood.id==='sleepy')check(newFace.yawn.mesh.visible&&newFace.tongue.mesh.visible&&newFace.eyes.every(e=>e.shadow.mesh.visible&&e.shadow.mesh.material.transparent&&e.open<.3)&&app.pet.color.getHexString()==='7892ac','sleepy has soft black circles, relaxed lids, a small pink yawn and the existing dusty blue');
  if(mood.id==='calm')check(newFace.eyes.every(e=>e.white.mesh.visible&&e.iris.mesh.visible)&&newFace.parts.filter(p=>p.mesh.material===app.pet.studyGlass).length===5,'calm has clear gentle eyes and five large black glasses parts');
  if(mood.id==='anxious')check(newFace.eyes[0].w!==newFace.eyes[1].w&&newFace.eyes.every(e=>e.iris.mesh.material.onBeforeCompile),'anxiety has asymmetric eyes and pupils clipped to the eye aperture');
  if(mood.id==='resigned')check(newFace.eyes.every(e=>e.dy>0)&&newFace.eyes[0].v!==newFace.eyes[1].v,'resigned combines upward gaze and asymmetric eye placement');
  if(mood.id==='speechless')check(newFace.eyes.every(e=>e.dx>.1&&e.open<.5)&&app.pet.cheeks.every(c=>!c.visible)&&newFace.group.children.length>newFace.parts.length,'speechless has half-lidded side-eye, a question mark and no blush');
  if(newFace){
    const clock=app.pet.clock,reduced=app.pet.reduced;
    app.pet.reduced={matches:false};app.pet.clock=mood.id==='sleepy'?4.9:3.94;app.pet.draw();
    check(newFace.eyes.every(e=>e.upper===e.lower&&!e.white.mesh.visible&&!e.iris.mesh.visible&&!e.glint.mesh.visible&&e.lid.mesh.visible),'fully closed '+mood.id+' eyes show a single soft lid without sclera or highlights');
    app.pet.clock=1;app.pet.draw();check(newFace.eyes.every(e=>e.white.mesh.visible&&e.iris.mesh.visible),'eyes reopen after blinking: '+mood.id);
    app.pet.reduced={matches:true};app.pet.clock=2;app.pet.draw();const stillEyes=JSON.stringify(newFace.eyes.map(e=>[e.dx,e.dy,e.open]));app.pet.clock=9;app.pet.draw();
    check(JSON.stringify(newFace.eyes.map(e=>[e.dx,e.dy,e.open]))===stillEyes,'reduced motion freezes the new face: '+mood.id);
    app.pet.reduced=reduced;app.pet.clock=clock;app.pet.draw();
  }
  if(mood.id==='overwhelmed')check(app.pet.overwhelmedMouth.visible&&app.pet.expressionEyes.every(e=>e.userData.profile.pupilHeight<e.userData.profile.height*.4&&e.userData.parts.glints.every(g=>!g.visible)),'overwhelmed has wide vacant eyes, small matte pupils and the selected flat mouth');
  if(mood.id==='angry')check(app.pet.grittedMouth.visible&&app.pet.teeth.length===10&&app.pet.teeth.every(t=>t.visible)&&app.pet.angryEyes.every(e=>e.visible)&&app.pet.expressionEyes.every(e=>!e.visible),'exaggerated annoyance combines narrowed angled eyes, gritted mouth and ten block teeth');
  if(mood.id==='angry'){
    const savedYaw=app.pet.group.rotation.y;
    for(const yaw of [-.28,0,.28]){
      app.pet.group.rotation.y=yaw;app.pet.renderer.render(app.pet.scene,app.pet.camera);app.pet.scene.updateMatrixWorld(true);
      for(const tooth of app.pet.teeth){
        const point=tooth.localToWorld(new THREE.Vector3(0,0,.012)).project(app.pet.camera),color=new Uint8Array(4);
        gl.readPixels(Math.round((point.x*.5+.5)*canvas.width),Math.round((point.y*.5+.5)*canvas.height),1,1,gl.RGBA,gl.UNSIGNED_BYTE,color);
        check(color[0]>220&&color[1]>220&&color[2]>200&&color[3]===255,'rendered tooth stays cream at yaw '+yaw);
      }
    }
    app.pet.group.rotation.y=savedYaw;app.pet.draw();
  }
  check((await native('testSnapshot',{name:'mood-'+mood.id+'.png'})).ok,'expression reference screenshot '+mood.id);
}
check(eyeKinds.size===10,'all ten states have distinct eye acting');
app.pet.setMood('overwhelmed');app.pet.draw();
const ropePosition=app.pet.group.position.clone(),ropeClock=app.pet.clock,ropeReduced=app.pet.reduced;
app.pet.clock+=1;app.pet.draw();
check(app.pet.reduced.matches||app.pet.group.position.distanceTo(ropePosition)>.001,'hanging ball gently moves over rendered time');
app.pet.reduced={matches:true};app.pet.draw();const stillPosition=app.pet.group.position.clone();app.pet.clock+=1;app.pet.draw();
check(app.pet.rope.visible&&app.pet.group.position.distanceTo(stillPosition)<.001&&app.pet.group.rotation.z===0,'reduced motion keeps the hanging pose still');
app.pet.reduced=ropeReduced;app.pet.clock=ropeClock;app.pet.press();app.pet.draw();
check(!app.pet.rope.visible,'pressing the ball releases the suspension');
app.pet.release();app.pet.draw();check(app.pet.rope.visible,'releasing the ball restores the suspension');
check(app.snapshot().events.length===eventsBeforeFaces,'visual expression samples never write mood records');
app.pet.setMood('anxious');app.pet.attentionUntil=0;app.pet.lookTarget.set(0,0);app.pet.clock=4;
await showWindow();
const gazeSamples=[];
// Four held gaze destinations take five seconds; sample a whole cycle.
for(let i=0;i<20;i++){await wait(260);gazeSamples.push([app.pet.studyFaces.anxious.eyes[0].dx,app.pet.studyFaces.anxious.eyes[0].dy]);if(i<6){const frame=await native('testSnapshot',{name:'gaze-'+i+'.png'});check(frame.ok&&!frame.skipped,'actual animated gaze frame '+i);}}
check(app.pet.reduced.matches||Math.max(...gazeSamples.map(p=>p[0]))-Math.min(...gazeSamples.map(p=>p[0]))>.10,'anxious pupils scan horizontally over a full rendered cycle: '+JSON.stringify(gazeSamples));
check(app.pet.reduced.matches||Math.max(...gazeSamples.map(p=>p[1]))-Math.min(...gazeSamples.map(p=>p[1]))>.06,'anxious pupils scan vertically over a full rendered cycle: '+JSON.stringify(gazeSamples));
app.pet.lookAtDesktop(1,0);
const rightGazeDeadline=performance.now()+1200;
while(!app.pet.reduced.matches&&!app.pet.studyFaces.anxious.eyes.every(e=>e.dx>0)&&performance.now()<rightGazeDeadline)await wait(40);
check(app.pet.reduced.matches||app.pet.studyFaces.anxious.eyes.every(e=>e.dx>0),'anxious eyes attend to a pointer on the right: '+JSON.stringify({gaze:app.pet.eyeGaze.toArray(),target:app.pet.lookTarget.toArray(),clock:app.pet.clock,attentionUntil:app.pet.attentionUntil,held:!!app.pet.body.hold,hidden:document.hidden,pupils:app.pet.studyFaces.anxious.eyes.map(e=>e.dx)}));
app.pet.lookAtDesktop(-1,0);
const leftGazeDeadline=performance.now()+1200;
while(!app.pet.reduced.matches&&!app.pet.studyFaces.anxious.eyes.every(e=>e.dx<0)&&performance.now()<leftGazeDeadline)await wait(40);
check(app.pet.reduced.matches||app.pet.studyFaces.anxious.eyes.every(e=>e.dx<0),'anxious eyes follow a pointer back to the left');
app.pet.lookTarget.set(0,0);app.pet.attentionUntil=0;

for(const [mood,label] of [['resigned','无奈'],['speechless','无语'],['overwhelmed','要死了'],['sleepy','好困']]){
  const count=app.snapshot().events.length;
  check((await native('testMenuCommand',{command:'mood:'+mood})).ok,'native menu saves new mood '+mood);
  check(app.snapshot().events.length===count+1&&app.snapshot().events.at(-1).mood===mood,'new mood survives native persistence '+mood);
  check(document.getElementById('timeline').textContent.includes(label),'new mood renders in timeline details '+mood);
}
await app.desktop(false);
return checks;
