(() => {
  'use strict';
  const T = window.THREE;
  const surface = (u,v,lift=0) => new T.Vector3(u,v,Math.sqrt(Math.max(.015,1-u*u-v*v))+lift);
  const makeTexture = (width,height,paint) => {
    const canvas=document.createElement('canvas');canvas.width=width;canvas.height=height;
    paint(canvas.getContext('2d'),width,height);
    const texture=new T.CanvasTexture(canvas);texture.colorSpace=T.SRGBColorSpace;return texture;
  };

  class Pet {
    constructor(canvas,react) {
      this.canvas=canvas;this.react=react;this.body=new SlimePhysics.Slime(150,120,70);
      this.rolling=new SlimePhysics.Rolling();
      this.eyeGaze=new T.Vector2();this.eyeTarget=new T.Vector2();this.attentionUntil=0;
      this.frame=0;this.last=0;this.acc=0;this.clock=0;this.injury=0;
      this.heldPointer=null;this.hurtThisGesture=false;this.mood='calm';
      this.image=null;this.skin=null;this.skinTexture=null;this.mapped=[];this.features=[];
      this.reduced=matchMedia('(prefers-reduced-motion: reduce)');
      this.look=new T.Vector2();this.lookTarget=new T.Vector2();this.color=new T.Color('#A6CEB3');
      this.delightUntil=0;
      try {
        this.renderer=new T.WebGLRenderer({canvas,alpha:true,antialias:true,preserveDrawingBuffer:true,powerPreference:'low-power'});
      } catch (error) {
        this.failed=true;this.react('这台电脑暂时无法启动 3D 显示，心情日历仍可使用。');
        return;
      }
      this.renderer.setClearColor(0x000000,0);
      this.renderer.setPixelRatio(Math.min(devicePixelRatio||1,2));
      this.renderer.outputColorSpace=T.SRGBColorSpace;
      this.renderer.toneMapping=T.ACESFilmicToneMapping;
      this.renderer.toneMappingExposure=1.05;
      this.scene=new T.Scene();
      this.camera=new T.OrthographicCamera(-2,2,1.6,-1.6,.1,30);
      this.camera.position.set(0,1.4,7);this.camera.lookAt(0,.04,0);
      this.group=new T.Group();this.scene.add(this.group);
      this.raycaster=new T.Raycaster();
      this.setupLighting();this.setupBody();this.setupFace();this.setupBandages();this.setupShadow();
      this.ropeTop=new T.Vector3(0,2.2,0);
      const ropeTexture=makeTexture(64,128,(c,w,h)=>{
        c.fillStyle='#B59A65';c.fillRect(0,0,w,h);c.strokeStyle='#76603C';c.lineWidth=9;
        for(let y=-64;y<h;y+=32){c.beginPath();c.moveTo(0,y);c.lineTo(w,y+32);c.stroke();}
      });
      ropeTexture.wrapS=T.RepeatWrapping;ropeTexture.wrapT=T.RepeatWrapping;
      this.rope=new T.Mesh(new T.CylinderGeometry(.045,.045,1,12),new T.MeshBasicMaterial({map:ropeTexture,toneMapped:false,transparent:true}));
      this.rope.visible=false;this.scene.add(this.rope);
      this.bindInput();
      new ResizeObserver(()=>this.resize()).observe(canvas);
      this.resize();
    }
    setupLighting() {
      this.scene.add(new T.HemisphereLight(0xFFF5E9,0x7693A7,.7));
      const key=new T.DirectionalLight(0xFFF0DD,2.3);key.position.set(-3,5,5);this.scene.add(key);
      const rim=new T.DirectionalLight(0xDCEFFF,2.5);rim.position.set(4,2,-2);this.scene.add(rim);
      const fill=new T.DirectionalLight(0xFFE3D1,.25);fill.position.set(2,-1,4);this.scene.add(fill);
      const room=new T.Scene();room.background=new T.Color(.36,.34,.30);
      for(const [position,color,size] of [
        [[-3,4,4],[4.5,4.2,3.9],[4,3]],
        [[4,2,3],[4.5,4.3,3.9],[4,5]],
        [[0,5,-3],[3,3,3],[5,2]]
      ]) {
        const panel=new T.Mesh(new T.PlaneGeometry(...size),new T.MeshBasicMaterial({color:new T.Color(...color),side:T.DoubleSide}));
        panel.position.set(...position);panel.lookAt(0,0,0);room.add(panel);
      }
      const pmrem=new T.PMREMGenerator(this.renderer);
      this.environment=pmrem.fromScene(room,.07,.1,20);
      this.scene.environment=this.environment.texture;pmrem.dispose();
      room.traverse(object=>{object.geometry?.dispose();object.material?.dispose();});
    }
    deformable(geometry,material) {
      const mesh=new T.Mesh(geometry,material);
      mesh.frustumCulled=false;
      const rest=new Float32Array(geometry.attributes.position.array);
      this.mapped.push({mesh,rest});this.group.add(mesh);return mesh;
    }
    setupBody() {
      this.material=new T.MeshPhysicalMaterial({
        color:this.color,roughness:.11,metalness:0,clearcoat:1,clearcoatRoughness:.2,transmission:.24,thickness:.6,
        ior:1.38,specularIntensity:.8,envMapIntensity:.75,sheen:0,sheenColor:0xFFF0DB
      });
      this.mesh=this.deformable(new T.SphereGeometry(1,64,40),this.material);
      const spriteGeometry=new T.PlaneGeometry(2,2,20,20);
      this.skinMaterial=new T.MeshStandardMaterial({transparent:true,alphaTest:.025,roughness:.6,side:T.DoubleSide,depthWrite:true});
      this.skinMesh=this.deformable(spriteGeometry,this.skinMaterial);this.skinMesh.visible=false;
    }
    feature(mesh,u,v,lift=.03) {
      mesh.userData.anchor={u,v,lift};this.features.push(mesh);this.group.add(mesh);return mesh;
    }
    setupFace() {
      this.dark=new T.MeshPhysicalMaterial({color:0x27252D,roughness:.3,clearcoat:.35});
      this.white=new T.MeshBasicMaterial({color:0xFFFEF5});
      this.faceInk=new T.MeshBasicMaterial({color:0x55473F,toneMapped:false});
      this.joyInk=new T.MeshBasicMaterial({color:0x6C4529,toneMapped:false});
      this.eyeWhite=new T.MeshPhysicalMaterial({color:0xFFF9EF,roughness:.45,clearcoat:.25});
      this.vacantInk=new T.MeshBasicMaterial({color:0x3C302B,toneMapped:false,transparent:true});
      this.pupilInk=new T.MeshPhysicalMaterial({color:0x242027,roughness:.32,clearcoat:.12,specularIntensity:.25,envMapIntensity:.18});
      this.hurtEyes=[];this.happyEyes=[];this.brows=[];this.cheeks=[];
      for(const u of [-.27,.27]) {
        const hurt=new T.Group();
        for(const angle of [-.58,.58]) {
          const bar=new T.Mesh(new T.CapsuleGeometry(.016,.115,4,8),this.dark);bar.rotation.z=angle;hurt.add(bar);
        }
        hurt.visible=false;this.feature(hurt,u,.14,.04);this.hurtEyes.push(hurt);
        const smileCurve=new T.QuadraticBezierCurve3(new T.Vector3(-.105,0,0),new T.Vector3(0,.09,0),new T.Vector3(.105,0,0));
        const smile=new T.Group();
        smile.add(new T.Mesh(new T.TubeGeometry(smileCurve,24,.0105,10,false),this.joyInk));
        for(const t of [0,1]){const cap=new T.Mesh(new T.SphereGeometry(.0105,12,10),this.joyInk);cap.position.copy(smileCurve.getPoint(t));smile.add(cap);}
        this.feature(smile,u,.16,.045);
        this.happyEyes.push(smile);
        const browCurve=new T.QuadraticBezierCurve3(new T.Vector3(-.075,0,0),new T.Vector3(0,.028,0),new T.Vector3(.075,0,0));
        const brow=this.feature(new T.Mesh(new T.TubeGeometry(browCurve,10,.011,6,false),this.dark),u,.34,.027);
        this.brows.push(brow);
      }
      const blush=makeTexture(128,128,(c,w,h)=>{
        const g=c.createRadialGradient(w/2,h/2,3,w/2,h/2,w*.48);
        g.addColorStop(0,'rgba(235,120,120,.72)');g.addColorStop(.6,'rgba(239,148,139,.3)');g.addColorStop(1,'rgba(239,148,139,0)');
        c.fillStyle=g;c.fillRect(0,0,w,h);
      });
      const blushMaterial=new T.MeshBasicMaterial({map:blush,transparent:true,depthWrite:false});
      for(const u of [-.43,.43])this.cheeks.push(this.feature(new T.Mesh(new T.PlaneGeometry(.35,.22),blushMaterial),u,-.015,.025));
      this.mouth=this.feature(new T.Mesh(new T.BufferGeometry(),this.dark),0,-.14,.035);
      this.setExpression('calm');
      this.angryEyes=[];this.angryPupils=[];this.teeth=[];
      const whites=new T.MeshStandardMaterial({color:0xFFF6DD,roughness:.55});
      for(const side of [-1,1]){
        const shape=new T.Shape();shape.moveTo(.13*side,.105);shape.quadraticCurveTo(.2*side,-.095,.025*side,-.07);shape.lineTo(-.115*side,-.025);shape.closePath();
        const eye=this.feature(new T.Mesh(new T.ShapeGeometry(shape,14),whites),side*.245,.15,.05);
        this.angryEyes.push(eye);
        const pupil=this.feature(new T.Mesh(new T.SphereGeometry(1,18,12),this.dark),side*.21,.115,.085);
        pupil.userData.baseScale=[.062,.047,.025];this.angryPupils.push(pupil);
      }
      const gritted=new T.Shape();gritted.moveTo(-.255,.11);gritted.quadraticCurveTo(0,.15,.255,.11);gritted.lineTo(.255,-.1);gritted.quadraticCurveTo(0,-.13,-.255,-.1);gritted.closePath();
      this.grittedMouth=this.feature(new T.Mesh(new T.ExtrudeGeometry(gritted,{depth:.016,bevelEnabled:true,bevelThickness:.006,bevelSize:.01,bevelSegments:2}),this.dark),0,-.18,.05);
      // Small cartoon teeth need stable cream color and narrow gaps at desktop scale.
      const enamel=new T.MeshBasicMaterial({color:0xFFF9EC,toneMapped:false});
      for(let row=0;row<2;row++)for(let i=0;i<5;i++){
        const tooth=this.feature(new T.Mesh(new T.BoxGeometry(.079,.086,.022),enamel),(i-2)*.088,-.18+(row===0?.053:-.053),.11);
        tooth.userData.toothRow=row;this.teeth.push(tooth);
      }
      const ink=this.faceInk;
      const tearBlue=new T.MeshBasicMaterial({color:0xA9E5F2});
      const catPath=new T.QuadraticBezierCurve3(new T.Vector3(-.1,.012,0),new T.Vector3(0,-.08,0),new T.Vector3(.1,.012,0));
      this.catMouth=this.feature(new T.Mesh(new T.TubeGeometry(catPath,24,.008,8,false),ink),0,-.17,.055);
      const blankMouth=new T.LineCurve3(new T.Vector3(-.075,.015,0),new T.Vector3(.08,.015,0));
      const overwhelmedMouth=new T.Group();overwhelmedMouth.add(new T.Mesh(new T.TubeGeometry(blankMouth,24,.008,8,false),ink));
      for(const t of [0,1]){const cap=new T.Mesh(new T.SphereGeometry(.008,10,8),ink);cap.position.copy(blankMouth.getPoint(t));overwhelmedMouth.add(cap);}
      const tongue=new T.Shape();tongue.moveTo(-.023,0);tongue.lineTo(.025,0);
      tongue.bezierCurveTo(.04,-.035,.02,-.08,0,-.08);tongue.bezierCurveTo(-.024,-.08,-.021,-.03,-.023,0);
      this.overwhelmedTongue=this.faceShape(tongue,new T.MeshBasicMaterial({color:0xD9989C,toneMapped:false}),.003);
      this.overwhelmedTongue.position.copy(blankMouth.getPoint(1));
      this.overwhelmedTongue.position.z-=.006;overwhelmedMouth.add(this.overwhelmedTongue);
      this.overwhelmedMouth=this.feature(overwhelmedMouth,.01,-.085,.065);
      const wave=new T.Curve();wave.getPoint=t=>new T.Vector3((t-.5)*.3,Math.sin(t*Math.PI*5)*.028,0);
      this.worriedMouth=this.feature(new T.Mesh(new T.TubeGeometry(wave,40,.008,8,false),ink),0,-.2,.055);
      this.tearDrops=[];
      for(const side of [-1,1]){
        const drop=new T.Shape();drop.moveTo(0,.09);drop.bezierCurveTo(-.13,-.065,-.055,-.14,0,-.14);drop.bezierCurveTo(.055,-.14,.13,-.065,0,.09);
        this.tearDrops.push(this.feature(new T.Mesh(new T.ExtrudeGeometry(drop,{depth:.012,bevelEnabled:false}),tearBlue),side*.43,-.12,.06));
      }
      this.sighMouth=this.feature(new T.Mesh(new T.TubeGeometry(new T.QuadraticBezierCurve3(new T.Vector3(-.085,0,0),new T.Vector3(0,.055,0),new T.Vector3(.085,0,0)),20,.008,8,false),ink),.035,-.19,.055);
      this.sighMouth.userData.baseScale=[1,1,1];
      this.exhaustedMouth=this.feature(new T.Mesh(new T.SphereGeometry(1,18,12),ink),0,-.225,.055);
      this.exhaustedMouth.userData.baseScale=[.085,.018,.018];
      const tearMaterial=new T.MeshPhysicalMaterial({color:0xC4E8F2,roughness:.09,clearcoat:1,envMapIntensity:1});
      this.tear=this.feature(new T.Mesh(new T.SphereGeometry(1,16,12),tearMaterial),.36,-.03,.065);
      this.tear.userData.baseScale=[.035,.075,.025];this.tear.visible=false;
      const heart=new T.Shape();heart.moveTo(0,-.1);heart.bezierCurveTo(-.27,.04,-.1,.25,0,.12);heart.bezierCurveTo(.1,.25,.27,.04,0,-.1);
      this.heart=this.feature(new T.Mesh(new T.ExtrudeGeometry(heart,{depth:.025,bevelEnabled:true,bevelSize:.012,bevelThickness:.012,bevelSegments:2,steps:1}),new T.MeshStandardMaterial({color:0xE6A2A0,roughness:.4})),.65,.8,.1);
      this.heart.visible=false;
      this.setupApprovedFace();
      const sleepyLip=new T.Shape();sleepyLip.absellipse(0,0,.058,.043,0,Math.PI*2,false);
      this.sleepyMouth=this.feature(this.faceShape(sleepyLip,new T.MeshBasicMaterial({color:0xB9858E,toneMapped:false}),.0045),.01,-.15,.065);
      const sleepyTongue=new T.Mesh(new T.SphereGeometry(1,18,12),new T.MeshBasicMaterial({color:0xEDBCC0,toneMapped:false}));
      sleepyTongue.scale.set(.045,.017,.009);sleepyTongue.position.set(0,-.017,.024);this.sleepyMouth.add(sleepyTongue);
      this.sleepMarks=[];
      const z=new T.CurvePath();
      z.add(new T.LineCurve3(new T.Vector3(-.045,.055,0),new T.Vector3(.045,.055,0)));
      z.add(new T.LineCurve3(new T.Vector3(.045,.055,0),new T.Vector3(-.045,-.055,0)));
      z.add(new T.LineCurve3(new T.Vector3(-.045,-.055,0),new T.Vector3(.045,-.055,0)));
      const zMaterial=new T.MeshBasicMaterial({color:0x9A8488,toneMapped:false});
      for(let i=0;i<2;i++){
        const mark=this.feature(new T.Mesh(new T.TubeGeometry(z,24,.007,8,false),zMaterial),.65+i*.2,.67+i*.2,.045);
        mark.userData.baseScale=i?[1.4,1.4,1]:[.95,.95,1];this.sleepMarks.push(mark);
      }
      for(const feature of this.features){
        if(feature!==this.heart&&feature!==this.question&&!this.sleepMarks.includes(feature))feature.userData.facePart=true;
        // Keep foreground features out of the opaque refraction pass to avoid duplicate faces.
        feature.traverse(object=>{if(object.material)object.material.transparent=true;});
      }
    }
    faceShape(shape,material,stroke=.006) {
      const group=new T.Group();
      const fill=new T.Mesh(new T.ExtrudeGeometry(shape,{depth:.008,bevelEnabled:true,bevelSize:.002,bevelThickness:.002,bevelSegments:2,steps:1}),material);
      const path=new T.CatmullRomCurve3(shape.getPoints(32).map(p=>new T.Vector3(p.x,p.y,.012)));
      const outline=new T.Mesh(new T.TubeGeometry(path,64,stroke,6,false),this.faceInk);
      group.add(fill,outline);group.userData.fill=fill;return group;
    }
    setupApprovedFace() {
      this.expressionEyes=[-1,1].map(side=>{
        const group=new T.Group(),pupil=new T.Mesh(new T.SphereGeometry(1,20,16),this.pupilInk);
        const glints=[.021,.009].map(r=>new T.Mesh(new T.SphereGeometry(r,12,10),this.white));
        const bag=new T.Mesh(new T.SphereGeometry(1,20,12),new T.MeshBasicMaterial({color:0x82758F,transparent:true,opacity:.2,depthWrite:false}));
        bag.scale.set(.13,.02,.012);bag.position.set(0,-.14,0);
        const pool=new T.Mesh(new T.SphereGeometry(1,20,12),new T.MeshPhysicalMaterial({color:0xA9E5F2,roughness:.1,clearcoat:1}));
        pool.scale.set(.09,.025,.018);pool.position.set(0,-.12,.046);
        group.add(pupil,...glints,bag,pool);group.userData.parts={pupil,glints,bag,pool};group.userData.side=side;
        return this.feature(group,side*.28,.14,.065);
      });
      this.glasses=[];
      const glassesMaterial=new T.MeshPhysicalMaterial({color:0x30332E,roughness:.48,clearcoat:.15});
      for(const side of [-1,1]){
        const w=.202,h=.168,r=.062,shape=new T.Shape();
        shape.moveTo(-w+r,h);shape.lineTo(w-r,h);shape.quadraticCurveTo(w,h,w,h-r);shape.lineTo(w,-h+r);shape.quadraticCurveTo(w,-h,w-r,-h);shape.lineTo(-w+r,-h);shape.quadraticCurveTo(-w,-h,-w,-h+r);shape.lineTo(-w,h-r);shape.quadraticCurveTo(-w,h,-w+r,h);
        const path=new T.CatmullRomCurve3(shape.getPoints(20).map(p=>new T.Vector3(p.x,p.y,0)));
        this.glasses.push(this.feature(new T.Mesh(new T.TubeGeometry(path,64,.011,8,false),glassesMaterial),side*.314,.14,.12));
        this.glasses.push(this.feature(new T.Mesh(new T.TubeGeometry(new T.LineCurve3(new T.Vector3(0,0,0),new T.Vector3(side*.078,-.017,-.012)),4,.011,8,false),glassesMaterial),side*.515,.174,.105));
      }
      this.glasses.push(this.feature(new T.Mesh(new T.TubeGeometry(new T.QuadraticBezierCurve3(new T.Vector3(-.118,0,0),new T.Vector3(0,.05,0),new T.Vector3(.118,0,0)),16,.011,8,false),glassesMaterial),0,.14,.135));
      const smile=new T.Shape();smile.moveTo(-.36,.02);
      smile.bezierCurveTo(-.39,.16,-.28,.20,-.17,.12);
      smile.quadraticCurveTo(0,-.015,.17,.12);
      smile.bezierCurveTo(.28,.20,.39,.16,.36,.02);
      smile.bezierCurveTo(.35,-.20,.17,-.27,0,-.27);
      smile.bezierCurveTo(-.17,-.27,-.35,-.20,-.36,.02);
      const cream=new T.MeshBasicMaterial({color:0xFFF8E9,toneMapped:false});
      const grin=this.faceShape(smile,cream,.012);grin.children[1].material=this.joyInk;
      for(const [x,y,bottomX,bottomY] of [[-.17,.12,-.25,-.19],[-.055,.037,-.09,-.259],[.055,.037,.09,-.259],[.17,.12,.25,-.19]]){
        grin.add(new T.Mesh(new T.TubeGeometry(new T.LineCurve3(new T.Vector3(x,y,.018),new T.Vector3(bottomX,bottomY,.018)),4,.009,8,false),this.joyInk));
      }
      this.grin=this.feature(grin,0,-.02,.06);
      this.joyBlush=new T.Group();
      for(const x of [-.035,.035]){const mark=new T.Mesh(new T.CapsuleGeometry(.009,.045,4,10),this.joyInk);mark.position.x=x;mark.rotation.z=-.45;this.joyBlush.add(mark);}
      this.feature(this.joyBlush,-.48,-.015,.06);
      const smirk=new T.Shape();smirk.moveTo(-.105,-.015);smirk.quadraticCurveTo(.015,.005,.105,.065);smirk.quadraticCurveTo(.105,-.065,-.015,-.07);smirk.quadraticCurveTo(-.085,-.06,-.105,-.015);
      this.smirk=this.feature(this.faceShape(smirk,new T.MeshStandardMaterial({color:0xE8AA96,roughness:.65})),0,-.18,.06);
      const question=new T.Group(),curve=new T.CurvePath();
      curve.add(new T.CubicBezierCurve3(new T.Vector3(-.06,.11,0),new T.Vector3(-.06,.23,0),new T.Vector3(.12,.23,0),new T.Vector3(.07,.11,0)));
      curve.add(new T.QuadraticBezierCurve3(new T.Vector3(.07,.11,0),new T.Vector3(0,.075,0),new T.Vector3(0,.025,0)));
      question.add(new T.Mesh(new T.TubeGeometry(curve,30,.012,8,false),this.faceInk));
      const dot=new T.Mesh(new T.SphereGeometry(.016,12,10),this.faceInk);dot.position.y=-.025;question.add(dot);
      this.question=this.feature(question,.95,.48,.035);
      this.setApprovedEyeMood('calm');
    }
    setApprovedEyeMood(mood) {
      if(!this.expressionEyes||this.eyeMood===mood)return;
      this.eyeMood=mood;
      const profiles={calm:[.12,.135,.047,.073,0],happy:[.145,.165,.04,.052,.06],sad:[.14,.165,.075,.105,0],anxious:[.15,.18,.034,.047,0],tired:[.145,.10,.047,.034,-.018],resigned:[.13,.16,.041,.055,.025],speechless:[.15,.078,0,0,0],overwhelmed:[.215,.165,.059,.050,.040],sleepy:[.18,.068,.030,.022,-.02]};
      const [w,h,px,py,baseY]=profiles[mood]||profiles.calm;
      for(const eye of this.expressionEyes){
        const side=eye.userData.side,parts=eye.userData.parts,shape=new T.Shape();
        const width=mood==='anxious'&&side>0?w*.8:w,height=mood==='anxious'&&side>0?h*.8:mood==='resigned'&&side>0?h*.8:h;
        if(mood==='sleepy'){shape.moveTo(-width,.006);shape.quadraticCurveTo(0,-.012,width,.018);shape.quadraticCurveTo(0,-height*1.6,-width,.006);}
        else if(mood==='tired'){shape.moveTo(-width,.035);shape.lineTo(width,.035);shape.bezierCurveTo(width,-height*1.3,-width,-height*1.3,-width,.035);}
        else shape.absellipse(0,0,width,height,0,Math.PI*2,false);
        if(parts.shell){eye.remove(parts.shell);parts.shell.traverse(node=>node.geometry?.dispose());}
        parts.shell=this.faceShape(shape,this.eyeWhite);eye.add(parts.shell);
        parts.pupil.material=mood==='overwhelmed'?this.vacantInk:this.pupilInk;
        parts.pupil.scale.set(px,py,.024);parts.pupil.position.set(0,baseY,.033);
        eye.userData.profile={width,height,pupilWidth:px,pupilHeight:py,baseY};
        parts.bag.visible=mood==='tired';parts.pool.visible=mood==='sad';
        eye.userData.anchor.v=mood==='overwhelmed'?(side<0?.11:.21):mood==='anxious'&&side>0?.105:.15;
      }
    }
    setExpression(mood,hurt=false) {
      if(!this.mouth)return;
      this.setApprovedEyeMood(mood);
      const sad=hurt||mood==='sad',width=hurt?.068:mood==='happy'?.11:mood==='anxious'?.045:mood==='tired'?.06:mood==='resigned'?.095:mood==='speechless'?.12:.075;
      const corners=sad?-.018:mood==='angry'?.008:.018;
      const bend=sad?.075:mood==='angry'?.028:mood==='anxious'?-.018:mood==='tired'?-.005:mood==='resigned'?.035:mood==='speechless'?0:mood==='happy'?-.135:-.07;
      const curve=new T.QuadraticBezierCurve3(new T.Vector3(-width,corners,0),new T.Vector3(0,bend,.008),new T.Vector3(width,corners,0));
      this.mouth.geometry.dispose();this.mouth.geometry=new T.TubeGeometry(curve,14,hurt?.018:.008,8,false);
      this.mouth.material=hurt?this.dark:this.faceInk;
      this.mouth.userData.expression=hurt?'flinch':mood;
    }
    setupBandages() {
      const texture=makeTexture(384,144,(c,w,h)=>{
        c.clearRect(0,0,w,h);c.fillStyle='#EFD2AB';c.strokeStyle='#BC936D';c.lineWidth=3;
        c.beginPath();c.roundRect(3,3,w-6,h-6,34);c.fill();c.stroke();
        c.fillStyle='#E5B88D';c.beginPath();c.roundRect(w*.35,14,w*.3,h-28,16);c.fill();
        c.strokeStyle='#D9AF89';c.lineWidth=.8;
        for(let y=8;y<h;y+=5){c.beginPath();c.moveTo(14,y);c.lineTo(w-14,y);c.stroke();}
        c.fillStyle='#AF865E';
        for(const x of [45,69,94,w-45,w-69,w-94])for(const y of [43,70,97]){c.beginPath();c.arc(x,y,3.5,0,7);c.fill();}
      });
      this.patchMaterial=new T.MeshStandardMaterial({map:texture,color:0xC6A17B,transparent:true,alphaTest:.02,roughness:.88,envMapIntensity:.25,side:T.DoubleSide,depthWrite:false});
      this.patches=[];
      for(const [u,v,angle] of [[-.27,.55,-.33],[.43,-.32,.7],[.43,-.32,-.7]]) {
        const geometry=new T.PlaneGeometry(.57,.205,18,6),positions=geometry.attributes.position;
        for(let i=0;i<positions.count;i++){
          const x=positions.getX(i),y=positions.getY(i),pu=u+x*Math.cos(angle)-y*Math.sin(angle),pv=v+x*Math.sin(angle)+y*Math.cos(angle);
          const p=surface(pu,pv,.035);positions.setXYZ(i,p.x,p.y,p.z);
        }
        this.patches.push(this.deformable(geometry,this.patchMaterial));
      }
      this.scratchMaterial=new T.LineBasicMaterial({color:0xB67970,transparent:true});
      this.scratches=[];
      for(const v of [-.1,-.16]) {
        const p=[surface(-.58,v,.03),surface(-.48,v-.04,.03)];
        const geometry=new T.BufferGeometry().setFromPoints(p),line=new T.Line(geometry,this.scratchMaterial);
        this.mapped.push({mesh:line,rest:new Float32Array(geometry.attributes.position.array)});this.group.add(line);this.scratches.push(line);
      }
    }
    setupShadow() {
      const texture=makeTexture(128,128,(c,w,h)=>{
        const g=c.createRadialGradient(w/2,h/2,0,w/2,h/2,w/2);g.addColorStop(0,'rgba(83,62,67,.28)');g.addColorStop(.4,'rgba(83,62,67,.14)');g.addColorStop(1,'rgba(83,62,67,0)');c.fillStyle=g;c.fillRect(0,0,w,h);
      });
      this.shadow=new T.Mesh(new T.PlaneGeometry(3.5,2.1),new T.MeshBasicMaterial({map:texture,transparent:true,depthWrite:false}));
      this.shadow.rotation.x=-Math.PI/2;this.shadow.position.set(0,-.81,0);this.scene.add(this.shadow);
    }
    bindInput() {
      const c=this.canvas;
      c.addEventListener('pointerdown',e=>{if(e.button===0)c.dataset.input='pointer';},true);
      document.addEventListener('keydown',e=>{if(e.key==='Tab')c.dataset.input='keyboard';},true);
      c.addEventListener('pointerdown',e=>{
        if(e.button!==0||this.heldPointer!==null)return;
        const r=c.getBoundingClientRect(),pointer=new T.Vector2((e.clientX-r.left)/r.width*2-1,-(e.clientY-r.top)/r.height*2+1);
        this.raycaster.setFromCamera(pointer,this.camera);
        const hits=this.raycaster.intersectObject(this.activeBody);
        if(!hits.length)return;
        e.preventDefault();c.focus({preventScroll:true});this.release();this.rolling.reset();this.heldPointer=e.pointerId;c.setPointerCapture(e.pointerId);
        const p=this.point(e);this.body.grab(p.x,p.y);this.hurtThisGesture=false;
        c.style.cursor='grabbing';this.react('噗叽，抓到一小团柔软。');this.request();
      });
      c.addEventListener('pointermove',e=>{
        const p=this.point(e);
        this.lookTarget.set((p.x/this.width-.5)*.23,-(p.y/this.height-.5)*.12);this.attentionUntil=this.clock+1.1;
        if(e.pointerId===this.heldPointer)this.body.move(p.x,p.y);
        this.request();
      });
      c.addEventListener('pointerleave',()=>{this.lookTarget.set(0,0);});
      for(const name of ['pointerup','pointercancel','lostpointercapture'])c.addEventListener(name,e=>{if(e.pointerId===this.heldPointer)this.release();});
      c.addEventListener('keydown',e=>{c.dataset.input='keyboard';if(e.code==='Space'&&!e.repeat){e.preventDefault();this.press();}if(e.key==='Escape')this.release();});
      c.addEventListener('keyup',e=>{if(e.code==='Space'){e.preventDefault();this.release();}});
      c.addEventListener('blur',()=>this.release());window.addEventListener('blur',()=>this.release());
      c.addEventListener('webglcontextlost',e=>{e.preventDefault();this.contextLost=true;this.release();this.react('3D 显示暂时中断，正在等待恢复。');});
      c.addEventListener('webglcontextrestored',()=>{this.contextLost=false;this.request();this.react('回来了，继续陪你。');});
      document.addEventListener('visibilitychange',()=>{this.release();if(document.hidden){cancelAnimationFrame(this.frame);this.frame=0;}else{this.last=0;this.request();}});
      this.reduced.addEventListener('change',()=>this.request());
    }
    point(e){const r=this.canvas.getBoundingClientRect();return{x:e.clientX-r.left,y:e.clientY-r.top};}
    lookAtDesktop(x,y){
      if(!Number.isFinite(x)||!Number.isFinite(y)||this.body.hold||this.reduced.matches)return;
      this.lookTarget.set(Math.max(-1,Math.min(1,x))*.3,Math.max(-1,Math.min(1,y))*.15);this.attentionUntil=this.clock+1.1;this.request();
    }
    rollBy(dx,dy){
      if(this.reduced.matches||this.body.hold||!document.body.classList.contains('mini'))return;
      this.rolling.move(dx,dy,Math.max(1,this.height/3.2));this.request();
    }
    resize() {
      if(!this.renderer)return;
      const rect=this.canvas.getBoundingClientRect();if(rect.width<1||rect.height<1)return;
      this.width=rect.width;this.height=rect.height;
      this.renderer.setSize(rect.width,rect.height,false);
      const halfHeight=1.6,aspect=rect.width/rect.height;
      this.camera.left=-halfHeight*aspect;this.camera.right=halfHeight*aspect;this.camera.top=halfHeight;this.camera.bottom=-halfHeight;
      this.camera.updateProjectionMatrix();this.body.resize(rect.width/2,rect.height/2,rect.height/3.2);
      this.rolling.reset();
      this.draw();this.request();
    }
    setMood(mood,character=mood==='sad'?'orange':'slime') {
      if(this.mood!==mood)this.moodChangedAt=this.clock;
      this.mood=mood;
      this.character=character;
      const colors={calm:'#79B994',happy:'#FFDA70',sad:'#79A9D2',anxious:'#A68ACB',angry:'#D97E69',tired:'#9B8DB2',resigned:'#BEA16F',speechless:'#79AFB8',overwhelmed:'#9D96AA',sleepy:'#7892AC',verytired:'#9B8DB2',headache:'#C48F9A',sick:'#DDB898',coding:'#6F9FAA',jailed:'#8E96BC',slacking:'#A6BD64',confident:'#C85751',suffering:'#ECAF35'};
      const color=character==='orange'?'#FFC12D':colors[mood]||colors.calm;
      this.color.set(color);
      window.webkit?.messageHandlers?.mood?.postMessage({id:0,action:'petTint',color});
      if(this.material){this.material.color.copy(this.color);const transmission=mood==='suffering'?0:.24;if(this.material.transmission!==transmission){this.material.transmission=transmission;this.material.needsUpdate=true;}}
      this.setExpression(mood,!!this.body.hold&&(this.body.press>.55||this.body.deformation>this.body.r*.6));this.draw();this.request();
    }
    setupOrangeCompanion() {
      const figure=Pet.createOrangeCompanion();
      const bounds=new T.Box3().setFromObject(figure,true);
      const center=bounds.getCenter(new T.Vector3());
      const scale=2.16/(bounds.max.y-bounds.min.y);
      figure.scale.setScalar(scale);
      figure.position.set(-center.x*scale,-.72-bounds.min.y*scale,-center.z*scale);
      this.orangeCompanion=new T.Group();
      this.orangeCompanion.add(figure);
      this.group.add(this.orangeCompanion);
      this.orangeBounds=new T.Box3().setFromObject(this.orangeCompanion,true);
    }
    async setSkin(skin,source) {
      const ticket=Symbol();this.imageTicket=ticket;
      if(!skin){this.image=null;this.skin=null;this.skinTexture?.dispose();this.skinTexture=null;if(this.skinMaterial){this.skinMaterial.map=null;this.skinMaterial.needsUpdate=true;}this.draw();return;}
      const image=new Image();image.src=source;await image.decode();
      if(image.naturalWidth!==skin.columns*skin.size||image.naturalHeight!==Math.ceil(skin.durations.length/skin.columns)*skin.size)throw Error('皮肤图集尺寸不匹配。');
      if(this.imageTicket!==ticket)return;
      this.skinTexture?.dispose();this.image=image;this.skin=skin;
      this.skinTexture=new T.Texture(image);this.skinTexture.colorSpace=T.SRGBColorSpace;this.skinTexture.needsUpdate=true;
      this.skinMaterial.map=this.skinTexture;this.skinMaterial.needsUpdate=true;
      this.draw();this.request();
    }
    press(){this.release();this.rolling.reset();this.body.grab(this.body.x,this.body.y);this.hurtThisGesture=false;this.request();}
    squish(){this.press();this.recoverTimer=setTimeout(()=>this.release(),900);}
    release() {
      clearTimeout(this.recoverTimer);this.recoverTimer=null;
      const held=!!this.body.hold;this.body.release();
      if(this.heldPointer!==null){const id=this.heldPointer;this.heldPointer=null;if(this.canvas.hasPointerCapture(id))this.canvas.releasePointerCapture(id);}
      this.canvas.style.cursor='grab';if(held)this.react(this.injury>.2?'贴好绷带啦，摸摸就会好一些。':'啵，弹回来了。');this.request();
    }
    stroke(){this.release();this.injury=Math.max(0,this.injury-.65);this.heartUntil=this.clock+1.4;this.delightUntil=this.clock+1.7;this.react('嗯，被好好照顾了。');this.request();}
    request(){if(this.renderer&&!this.frame&&!document.hidden&&!this.contextLost)this.frame=requestAnimationFrame(t=>this.tick(t));}
    tick(time) {
      this.frame=0;
      if(this.last&&this.body.settled&&time-this.last<1000/30){this.request();return;}
      const dt=this.last?Math.min(.05,(time-this.last)/1000):1/60;this.last=time;this.clock+=dt;this.acc+=dt;
      if(this.reduced.matches)this.rolling.reset();
      let steps=0;while(this.acc>=1/120&&steps++<7){this.body.step(1/120);this.rolling.step(1/120);this.acc-=1/120;}
      if(this.body.hold&&!this.hurtThisGesture&&(this.body.press>.52||this.body.deformation>this.body.r*.6)){
        this.hurtThisGesture=true;this.injury=Math.min(1,this.injury+.6);this.react('哎呀，给这里贴一块小绷带。');
      }
      if(!this.body.hold)this.injury=Math.max(0,this.injury-dt*.035);
      const gaze=SlimePhysics.faceMotion(this.mood,this.clock,this.lookTarget.x/.3,this.lookTarget.y/.15,this.clock<this.attentionUntil,this.reduced.matches||!!this.body.hold);
      this.eyeTarget.set(gaze.x,gaze.y);this.eyeGaze.lerp(this.eyeTarget,1-Math.exp(-dt*9));
      this.look.lerp(this.lookTarget,1-Math.exp(-dt*6));this.draw();
      if(!this.reduced.matches||!this.body.settled||this.rolling.moving||this.injury>0||this.clock<this.delightUntil||this.clock<(this.heartUntil||0))this.request();else{this.last=0;this.acc=0;}
    }
    attachFeatures() {
      const hurt=!!this.body.hold&&(this.body.press>.55||this.body.deformation>this.body.r*.6);
      const phase=this.clock%7.8,comfort=this.clock<this.delightUntil&&['calm','happy'].includes(this.mood);
      const laugh=!hurt&&(this.mood==='happy'||comfort);
      const happy=this.mood==='happy'&&!hurt;
      const exhausted=!hurt&&this.mood==='tired';
      const angry=this.mood==='angry'&&!hurt;
      const motion=SlimePhysics.faceMotion(this.mood,this.clock,this.lookTarget.x/.3,this.lookTarget.y/.15,this.clock<this.attentionUntil,this.reduced.matches||!!this.body.hold);
      const cheekRaise=laugh?.09+(motion.mouth-1)*.12:happy?.035:angry?.025:0;
      for(const cheek of this.cheeks){cheek.userData.anchor.v=-.015+cheekRaise;cheek.visible=!this.image&&!['happy','speechless','overwhelmed'].includes(this.mood);}
      for(const cheek of this.cheeks)cheek.material.opacity=this.mood==='sleepy'?.38:1;
      const xAxis=new T.Vector3(),yAxis=new T.Vector3(),normal=new T.Vector3(),basis=new T.Matrix4();
      for(const feature of this.features) {
        const anchor=feature.userData.anchor,faceScale=feature.userData.facePart&&this.mood!=='angry'?1.42:1;
        const u=anchor.u*faceScale,v=.04+(anchor.v-.04)*faceScale,lift=anchor.lift,p=surface(u,v,lift);
        this.body.deform(p.x,p.y,p.z,feature.position);
        const pu=surface(u+.005,v,lift),pv=surface(u,v+.005,lift);
        this.body.deform(pu.x,pu.y,pu.z,xAxis);xAxis.sub(feature.position).normalize();
        this.body.deform(pv.x,pv.y,pv.z,yAxis);yAxis.sub(feature.position).normalize();
        normal.crossVectors(xAxis,yAxis).normalize();yAxis.crossVectors(normal,xAxis).normalize();
        basis.makeBasis(xAxis,yAxis,normal);feature.quaternion.setFromRotationMatrix(basis);
        const scale=feature.userData.baseScale||[1,1,1];feature.scale.set(scale[0]*faceScale,scale[1]*Math.max(.58,this.body.sy)*faceScale,scale[2]);
      }
      // Bandages describe the body; only an active heavy gesture overrides the selected mood.
      if(hurt!==this.wasHurt){this.wasHurt=hurt;this.setExpression(this.mood,hurt);}
      if(this.reduced.matches)this.eyeGaze.set(0,0);
      for(const eye of this.expressionEyes){
        const p=eye.userData.profile,parts=eye.userData.parts;
        const vacant=this.mood==='overwhelmed';
        eye.visible=!this.image&&!hurt&&!laugh&&!angry;eye.scale.y*=vacant?1:motion.lid;
        const marginX=Math.max(0,p.width*.65-p.pupilWidth),marginY=Math.max(0,p.height*.75-p.pupilHeight);
        const x=vacant?-.012:this.eyeGaze.x*marginX,y=vacant?p.baseY:Math.max(-marginY,Math.min(marginY,p.baseY+this.eyeGaze.y*marginY));
        parts.pupil.position.set(this.mood==='sleepy'?Math.max(-.07,Math.min(.07,x)):x,y,.033);parts.pupil.visible=this.mood!=='speechless';
        parts.glints.forEach((g,i)=>{g.visible=!vacant&&!['speechless','sleepy'].includes(this.mood);g.position.set(x+(i?1:-1)*p.pupilWidth*.35,y+(i?-1:1)*p.pupilHeight*.4,.06);});
      }
      this.glasses.forEach(g=>g.visible=!this.image&&!hurt&&this.mood==='calm');
      this.grin.visible=!this.image&&laugh;this.grin.scale.y*=motion.mouth*.75;
      this.joyBlush.visible=!this.image&&laugh;
      this.smirk.visible=!this.image&&!hurt&&this.mood==='speechless';
      this.question.visible=!this.image&&!hurt&&this.mood==='speechless';
      if(this.question.visible&&!this.reduced.matches){this.question.position.y+=Math.sin(this.clock*1.3)*.018;this.question.rotateZ(Math.sin(this.clock*.9)*.04);}
      this.happyEyes.forEach(eye=>{eye.visible=laugh;eye.scale.x*=1.35;eye.scale.y*=1.15+(motion.mouth-1);});
      this.hurtEyes.forEach(eye=>eye.visible=hurt);this.tear.visible=hurt&&this.injury>.5;
      this.brows.forEach((brow,i)=>{brow.visible=!hurt&&['calm','happy','sad','angry','anxious','tired','resigned','speechless','overwhelmed','sleepy'].includes(this.mood);const side=i===0?1:-1;
        brow.material=happy?this.joyInk:angry?this.dark:this.faceInk;
        const tilt=this.mood==='angry'?-.62:this.mood==='sleepy'?(i?.08:-.12):this.mood==='tired'?.23:this.mood==='anxious'?.2:this.mood==='resigned'?.45:this.mood==='speechless'?(i?.22:0):this.mood==='overwhelmed'?(i?.18:0):['calm','happy'].includes(this.mood)?0:.34;
        if(!angry)brow.position.y+=motion.brow*.035*(i?1:-1);
        brow.quaternion.multiply(new T.Quaternion().setFromAxisAngle(new T.Vector3(0,0,1),tilt*side));
        if(this.mood==='overwhelmed'){brow.scale.x*=1.25;brow.position.y+=i?.1:-.02;}
        if(this.mood==='sleepy'){brow.position.y+=i?.035:-.035;brow.scale.y*=.75;}
        if(happy){brow.scale.x*=1.2;brow.scale.y*=1.3;}
        if(angry){brow.scale.x*=1.18;brow.scale.y*=1.8;}
      });
      this.tearDrops.forEach(e=>e.visible=!hurt&&this.mood==='sad');
      this.sighMouth.visible=!hurt&&this.mood==='resigned';this.sighMouth.scale.y*=motion.mouth;
      this.catMouth.visible=!hurt&&!laugh&&this.mood==='calm';this.overwhelmedMouth.visible=!hurt&&this.mood==='overwhelmed';this.worriedMouth.visible=!hurt&&this.mood==='anxious';
      this.mouth.visible=hurt||this.mood==='sad';
      this.exhaustedMouth.visible=exhausted;
      const drowsy=!this.image&&!hurt&&this.mood==='sleepy';
      this.sleepyMouth.visible=drowsy;this.sleepyMouth.scale.y*=motion.mouth;
      this.sleepMarks.forEach((mark,i)=>{mark.visible=drowsy;if(drowsy&&!this.reduced.matches){mark.position.y+=Math.sin(this.clock*.7+i)*.022;mark.rotateZ(.1);}});

      this.grittedMouth.visible=angry;this.teeth.forEach(t=>t.visible=angry);this.angryEyes.forEach(e=>e.visible=angry);this.angryPupils.forEach(e=>e.visible=angry);
      this.facialState={mood:this.mood,hurt,laugh,exhausted,cheekRaise,angry,motion};
      this.heart.visible=(this.heartUntil||0)>this.clock;
      if(this.heart.visible){this.heart.position.y+=(1.4-(this.heartUntil-this.clock))*.22;this.heart.scale.setScalar(1+Math.sin(this.clock*9)*.12);}
    }
    updateView() {
      const mood=this.image?'calm':this.mood,key=mood+':'+this.width+':'+this.height;
      if(this.cameraPose===key)return;this.cameraPose=key;
      const aspect=this.width/this.height;
      if(mood==='suffering'){
        const r=7.14,targetY=-.59,pitch=.90;
        this.camera.position.set(0,targetY+r*Math.sin(pitch),r*Math.cos(pitch));this.camera.lookAt(0,targetY,0);
        this.camera.zoom=Math.min(1.10,aspect*.90);
      }else{
        this.camera.position.set(0,1.4,7);this.camera.lookAt(0,.04,0);
        this.camera.zoom=mood==='confident'?Math.min(1,aspect*.82):1;
      }
      this.camera.updateProjectionMatrix();
    }
    draw() {
      if(!this.renderer||this.contextLost)return;
      this.updateView();
      const out={};
      this.body.setRestPose(this.image?'calm':this.mood);
      const pose=[this.body.restHeight,this.body.restWidth,...this.body.values].map(v=>v.toFixed(5)).join(',');
      if(pose!==this.geometryPose)for(const {mesh,rest} of this.mapped) {
        const positions=mesh.geometry.attributes.position;
        for(let i=0;i<positions.count;i++){const j=i*3;this.body.deform(rest[j],rest[j+1],rest[j+2],out);positions.setXYZ(i,out.x,out.y,out.z);}
        positions.needsUpdate=true;
        if(mesh.isMesh)mesh.geometry.computeVertexNormals();
        mesh.geometry.computeBoundingSphere();
      }
      this.geometryPose=pose;
      const orange=this.character==='orange'&&!this.image;
      if(orange&&!this.orangeCompanion)this.setupOrangeCompanion();
      this.mesh.visible=!this.image&&!orange;
      this.skinMesh.visible=!!this.image;
      if(this.orangeCompanion)this.orangeCompanion.visible=orange;
      this.activeBody=orange?this.orangeCompanion:this.image?this.skinMesh:this.mesh;
      if(orange){
        const {sx,sy,ax,ay,pull}=this.body;
        this.orangeCompanion.scale.set(sx*(1+Math.abs(ax)*pull*.26),sy*(1+Math.abs(ay)*pull*.22),sx);
        this.orangeCompanion.position.set(ax*pull*.20,(1-sy)*-.72+ay*pull*.20,0);
      }
      this.features.forEach(feature=>feature.visible=true);
      this.attachFeatures();
      if(this.image||orange){
        this.features.forEach(feature=>{if(this.image||feature!==this.heart)feature.visible=false;});
      }
      this.patchMaterial.opacity=Math.min(1,this.injury*4);
      this.patches.forEach((patch,i)=>patch.visible=!orange&&this.injury>.015&&(i===0||this.injury>.4));
      this.scratchMaterial.opacity=Math.min(1,this.injury*3);this.scratches.forEach(s=>s.visible=!orange&&this.injury>.1);
      if(this.skin&&this.skinTexture){
        const durations=this.skin.durations,total=durations.reduce((a,b)=>a+b,0);let f=0,t=this.reduced.matches?0:this.clock%total;
        while(f<durations.length-1&&t>=durations[f])t-=durations[f++];this.spriteFrame=f;
        const rows=Math.ceil(durations.length/this.skin.columns);
        this.skinTexture.repeat.set(1/this.skin.columns,1/rows);this.skinTexture.offset.set(f%this.skin.columns/this.skin.columns,1-(Math.floor(f/this.skin.columns)+1)/rows);
      }
      const expressive=!this.reduced.matches&&!this.body.hold;
      const joy=expressive&&this.facialState?.laugh?Math.sin(this.clock*8)*.014:0;
      const breath=!expressive?0:Math.sin(this.clock*(['tired','sleepy'].includes(this.mood)?1.25:2.05))*.016+joy;
      const suspended=!this.image&&this.mood==='overwhelmed'&&!this.body.hold&&!this.rolling.moving;
      const sleepyPose=this.mood==='sleepy'&&!this.body.hold,bodyY=orange?1:sleepyPose?1.02:1.12;
      this.group.scale.set((1-breath*.5)*(sleepyPose?1.05:1),(1+breath)*bodyY,1-breath*.5);
      this.group.position.y=-.78*(1-bodyY);
      this.group.position.x=0;
      this.group.rotation.y=this.reduced.matches?0:this.look.x+Math.sin(this.clock*.64)*.055;
      this.group.rotation.x=this.reduced.matches?0:-this.look.y+(sleepyPose?Math.sin(this.clock*.7)*.035:0);
      if(this.mood==='confident'&&!this.image&&!this.body.hold){this.group.rotation.x-=.16;this.group.position.y+=.025;}
      const tilt=this.mood==='sleepy'?-.09:this.mood==='sad'?-.045:this.mood==='tired'?.06:this.mood==='anxious'?.035:this.mood==='resigned'?-.065:0;
      this.group.rotation.z=(!expressive?0:tilt+Math.sin(this.clock*.82)*.022+joy*.8+(this.facialState?.angry?Math.sin(this.clock*11)*.006:0))+(this.reduced.matches?0:this.rolling.angle);
      if(this.mood==='suffering'&&!this.image){this.group.rotation.x=0;this.group.rotation.z=0;}
      if(suspended){this.group.position.y+=.16;this.group.position.x=-Math.sin(this.group.rotation.z)*.55;}
      if(this.rolling.moving){
        let bottom=Infinity;const point=new T.Vector3();
        if(orange){
          const {min,max}=this.orangeBounds;
          for(const x of [min.x,max.x])for(const y of [min.y,max.y])for(const z of [min.z,max.z]){
            point.set(x,y,z).multiply(this.orangeCompanion.scale).add(this.orangeCompanion.position).multiply(this.group.scale).applyEuler(this.group.rotation);
            bottom=Math.min(bottom,point.y);
          }
        }else{
          const positions=this.activeBody.geometry.attributes.position;
          for(let i=0;i<positions.count;i++){point.fromBufferAttribute(positions,i).multiply(this.group.scale).applyEuler(this.group.rotation);bottom=Math.min(bottom,point.y);}
        }
        this.group.position.y=-.78-bottom;
      }
      this.rope.visible=suspended;
      if(suspended){
        const head=this.body.deform(0,1,0),end=this.group.localToWorld(new T.Vector3(head.x,head.y,head.z));
        const direction=new T.Vector3().subVectors(end,this.ropeTop);
        this.rope.position.copy(end).add(this.ropeTop).multiplyScalar(.5);
        this.rope.scale.y=direction.length();this.rope.material.map.repeat.y=this.rope.scale.y*2;
        this.rope.quaternion.setFromUnitVectors(new T.Vector3(0,1,0),direction.normalize());
      }
      this.shadow.material.opacity=suspended?.55:1;
      this.shadow.scale.x=this.body.sx*this.body.restWidth*(suspended?.85:1);
      this.renderer.render(this.scene,this.camera);
    }
  }
  window.MoodPet=Pet;
  Pet.createOrangeCompanion = function () {
    const figure = new T.Group();
    const mix = T.MathUtils.lerp;
    const smooth = T.MathUtils.smoothstep;
    const gold = new T.Color(0xffc12d);
    const citrus = new T.Color(0xfc7214);
    const shorts = new T.Color(0xf45010);
    const clay = color => new T.MeshPhysicalMaterial({
      color, roughness:.68, clearcoat:.12, clearcoatRoughness:.68
    });
    const colorClay = new T.MeshPhysicalMaterial({
      vertexColors:true, roughness:.68, clearcoat:.12, clearcoatRoughness:.68
    });
    const bulb = new T.SphereGeometry(1,56,40);
    function mesh(geometry, material, x=0, y=0, z=0) {
      const part = new T.Mesh(geometry,material);
      part.position.set(x,y,z);
      part.castShadow = true;
      part.receiveShadow = true;
      figure.add(part);
      return part;
    }
    function ellipse(material, x,y,z, sx,sy,sz) {
      const part = mesh(bulb,material,x,y,z);
      part.scale.set(sx,sy,sz);
      return part;
    }
    function surface(position, tint=null, rows=110, columns=160) {
      const vertices=[], colors=[], indices=[];
      for(let row=0;row<=rows;row++){
        for(let col=0;col<=columns;col++){
          const u=col/columns, v=row/rows;
          const point=position(u,v);
          vertices.push(...point);
          if(tint){
            const color=tint(point,u,v);
            colors.push(color.r,color.g,color.b);
          }
          if(row<rows && col<columns){
            const a=row*(columns+1)+col, b=a+columns+1;
            indices.push(a,a+1,b,b,a+1,b+1);
          }
        }
      }
      const geometry=new T.BufferGeometry();
      geometry.setAttribute('position',new T.Float32BufferAttribute(vertices,3));
      if(tint) geometry.setAttribute('color',new T.Float32BufferAttribute(colors,3));
      geometry.setIndex(indices);
      geometry.computeVertexNormals();
      return geometry;
    }
    // Each profile row holds height, half-width, and half-depth.
    function profile(rows) {
      const curve=new T.CatmullRomCurve3(rows.map(row=>new T.Vector3(...row)));
      const samples=curve.getPoints(550);
      return y=>{
        let low=0, high=samples.length-1;
        while(high-low>1){
          const mid=(low+high)>>1;
          if(samples[mid].x<y) low=mid;
          else high=mid;
        }
        const a=samples[low], b=samples[high];
        const t=T.MathUtils.clamp((y-a.x)/(b.x-a.x),0,1);
        return [Math.max(.001,mix(a.y,b.y,t)),Math.max(.001,mix(a.z,b.z,t))];
      };
    }
    const body = profile([
      [.044,0,0],[.064,.60,.49],[.114,.91,.69],[.22,1.055,.80],
      [.40,1.125,.846],[.65,1.14,.845],[.95,1.08,.77],[1.25,.93,.67],
      [1.58,.73,.53],[1.77,.48,.38],[1.85,0,0]
    ]);
    function outfitColor(x,y,z) {
      const waist=.47+.45*smooth(z,-.67,.76)-.025*Math.abs(x);
      return shorts.clone().lerp(gold,smooth(y,waist-.025,waist+.025));
    }

    const head = profile([
      [1.48,0,0],[1.52,.50,.46],[1.60,.91,.67],[1.75,1.12,.83],
      [1.98,1.24,.96],[2.26,1.25,1.01],[2.52,1.18,.97],
      [2.78,1.05,.86],[3.00,.89,.71],[3.18,.64,.51],[3.31,.40,.33],[3.37,0,0]
    ]);
    const muzzleEdge = x => 2.64-.43*Math.pow(Math.min(1,Math.abs(x)/1.20),2.1);
    const facePatch = (x,y,front) => (1-smooth(y,muzzleEdge(x)-.09,muzzleEdge(x)+.045))
      * smooth(front,-.05,.36);
    function faceDepth(x,y,front) {
      const [,d]=head(y);
      const swell=.23*Math.exp(-Math.pow(x/.88,4)-Math.pow((y-2.16)/.57,4));
      return d*front+.045+swell*smooth(front,.23,.90);
    }
    function frontAt(x,y) {
      const [w]=head(y);
      return faceDepth(x,y,Math.sqrt(Math.max(.001,1-(x/w)**2)));
    }
    mesh(surface((u,v)=>{
      const theta=u*Math.PI*2, y=mix(1.48,3.37,v), [w]=head(y);
      const x=w*Math.sin(theta);
      return [x,y,faceDepth(x,y,Math.cos(theta))];
    },([x,y],u)=>{
      const front=Math.cos(u*Math.PI*2);
      const color=gold.clone().lerp(citrus,facePatch(x,y,front));
      return color.multiplyScalar(mix(.90,1,smooth(y,1.50,1.82)));
    },140,192),colorClay);

    const earInner=new T.Color(0xe77310);
    for(const side of [-1,1]){
      const earGeometry=bulb.clone();
      const points=earGeometry.getAttribute('position'), colors=[];
      for(let i=0;i<points.count;i++){
        const z=points.getZ(i), well=smooth(z,.47,.96);
        points.setZ(i,z-.56*well);
        const color=gold.clone().lerp(earInner,well*.86);
        colors.push(color.r,color.g,color.b);
      }
      earGeometry.setAttribute('color',new T.Float32BufferAttribute(colors,3));
      earGeometry.computeVertexNormals();
      const ear=mesh(earGeometry,colorClay,side*.88,3.16,-.02);
      ear.scale.set(.185,.26,.175);
      ear.rotation.set(-.14,side*.34,-side*.67);
    }

    const rind=makeTexture(256,256,(c,w,h)=>{
      c.fillStyle='#bdbdbd';
      c.fillRect(0,0,w,h);
      let seed=32;
      function random(){
        seed=(Math.imul(seed,1664525)+1013904223)>>>0;
        return seed/4294967296;
      }
      for(let i=0;i<4100;i++){
        const value=random()>.46?153:214;
        c.fillStyle='rgb('+value+','+value+','+value+')';
        c.beginPath();
        c.arc(random()*w,random()*h,.22+random()*.78,0,Math.PI*2);
        c.fill();
      }
    });
    rind.colorSpace=T.NoColorSpace;
    const fruitMaterial=clay(0xff8910);
    fruitMaterial.bumpMap=rind;
    fruitMaterial.bumpScale=.013;
    const mandarin=bulb.clone();
    const mandarinPoints=mandarin.getAttribute('position');
    for(let i=0;i<mandarinPoints.count;i++){
      const x=mandarinPoints.getX(i), y=mandarinPoints.getY(i), z=mandarinPoints.getZ(i);
      mandarinPoints.setY(i,Math.max(-.84,y)-.08*smooth(y,.82,1));
      mandarinPoints.setX(i,x*(1+.065*smooth(-y,.08,.69)));
      mandarinPoints.setZ(i,z*(1+.065*smooth(-y,.08,.69)));
    }
    mandarin.computeVertexNormals();
    mesh(mandarin,fruitMaterial,.01,3.52,.012).scale.set(.36,.274,.335);

    const leafGreen=clay(0x4f761c);
    const stem=ellipse(clay(0x5e7025),.012,3.798,.015,.047,.098,.045);
    stem.rotation.z=-.16;
    const leaf=surface((u,v)=>{
      const t=u*Math.PI*2, width=.094*Math.pow(Math.sin(Math.PI*v),.86);
      return [.046+.37*v,3.781+.16*v+width*Math.sin(t)*.76,
        .014-.060*v+width*Math.sin(t)*.65+.040*Math.sin(Math.PI*v)*Math.cos(t)];
    },null,40,52);
    mesh(leaf,leafGreen);
    function line(points,radius,material) {
      const path=new T.CatmullRomCurve3(points.map(p=>new T.Vector3(...p)));
      return mesh(new T.TubeGeometry(path,42,radius,12),material);
    }
    line([[.052,3.784,.020],[.19,3.85,.032],[.31,3.90,.014],[.403,3.936,-.032]],.004,clay(0x618927));

    const eyeInk=clay(0x21140c), lipInk=clay(0x572016);
    const sparkle=new T.MeshBasicMaterial({color:0xfff8e6});
    const gel=new T.MeshPhysicalMaterial({
      color:0xffe7bb,roughness:.13,metalness:0,clearcoat:1,clearcoatRoughness:.12,
      opacity:.63,transparent:true,depthWrite:false,side:T.DoubleSide
    });
    for(const side of [-1,1]){
      const eyePoint=(u,v)=>{
        const x=side*mix(.36,.724,u);
        const top=2.746-.085*u-.016*Math.sin(Math.PI*u);
        const y=top-Math.sin(Math.PI*u)**.82*.069*v;
        return [x,y,frontAt(x,y)+.013];
      };
      const eye=mesh(surface(eyePoint,null,14,54),eyeInk);
      eye.material.side=T.DoubleSide;
      eye.castShadow=false;
      for(const [u,v,r] of [[.72,.49,.019],[.23,.46,.023]]){
        const [x,y,z]=eyePoint(u,v);
        ellipse(sparkle,x,y,z+.014,r,r*.73,.009).castShadow=false;
      }
      const length=side<0?.81:.64;
      function tearPoint(u,v){
        const theta=u*Math.PI*2;
        const center=.59+.22*smooth(v,0,.38)+.025*Math.sin(v*9.2);
        const taper=Math.sqrt(Math.max(.0001,1-(v*2-1)**8));
        const width=(.049+.067*Math.exp(-v*10))*taper;
        const x=side*(center+width*Math.sin(theta));
        const y=2.652-length*v;
        return [x,y,frontAt(x,y)+.019+.046*taper*Math.cos(theta)];
      }
      const tear=mesh(surface(tearPoint,null,86,40),gel);
      tear.castShadow=false;
      tear.receiveShadow=false;
      tear.renderOrder=2;
      for(const [start,end,r] of [[.12,.33,.006],[.42,.53,.004],[.78,.90,.0035]]){
        const path=[];
        for(let i=0;i<=5;i++){
          const point=tearPoint(side===1?.88:.12,mix(start,end,i/5));
          point[2]+=.008;
          path.push(point);
        }
        const sheen=line(path,r,new T.MeshBasicMaterial({color:0xfff6df,transparent:true,opacity:.55}));
        sheen.castShadow=false;
        sheen.renderOrder=3;
      }
    }
    const mouth=[];
    for(let i=0;i<=8;i++){
      const x=mix(-.211,.211,i/8), y=1.815+.032*(1-(x/.211)**2);
      mouth.push([x,y,frontAt(x,y)+.012]);
    }
    line(mouth,.012,lipInk).castShadow=false;
    for(const [x,y,z] of [mouth[0],mouth.at(-1)]) ellipse(lipInk,x,y,z,.012,.012,.012).castShadow=false;

    const footOutline=[
      [.32,0],[.43,.203],[.55,.304],[.69,.354],[.81,.365],[.92,.389],
      [1.05,.414],[1.14,.411],[1.217,.352],[1.252,.260],[1.274,.129],[1.281,0]
    ];
    const footProfile=profile(footOutline.map(([depth,radius])=>[depth,radius,radius]));
    const soleCurve=new T.CatmullRomCurve3(footOutline.map(([depth,radius])=>new T.Vector3(depth,radius,0)));
    const soleSamples=soleCurve.getPoints(52);
    const soleSegments=soleSamples.slice(1).map((end,index)=>{
      const start=soleSamples[index];
      const dz=end.x-start.x, dr=end.y-start.y;
      return {z:start.x,radius:start.y,dz,dr,inverseLength:1/(dz*dz+dr*dr)};
    });

    function ellipsoidField(center, radii, angle=0) {
      const cosine=Math.cos(angle), sine=Math.sin(angle);
      const [cx,cy,cz]=center, [rx,ry,rz]=radii;
      return (x,y,z)=>{
        const dx=x-cx, dz=z-cz;
        x=dx*cosine-dz*sine;
        z=dx*sine+dz*cosine;
        y-=cy;
        const nx=x/rx, ny=y/ry, nz=z/rz;
        const magnitude=Math.hypot(nx,ny,nz);
        const gradient=Math.hypot(nx/rx,ny/ry,nz/rz);
        return gradient>1e-8?magnitude*(magnitude-1)/gradient:-Math.min(rx,ry,rz);
      };
    }
    function roundedUnion(a,b,radius) {
      const blend=Math.max(0,radius-Math.abs(a-b))/radius;
      return Math.min(a,b)-blend*blend*radius*.25;
    }

    // Extract the zero surface from a signed distance field with smooth normals.
    function sculptSurface(field, origin, size, spacing, tint=null) {
      const [startX,startY,startZ]=origin;
      const [nx,ny,nz]=size;
      const grid=new Float32Array(nx*ny*nz);
      const xAt=i=>startX+i*spacing, yAt=i=>startY+i*spacing, zAt=i=>startZ+i*spacing;
      const offset=(x,y,z)=>(z*ny+y)*nx+x;
      for(let z=0;z<nz;z++){
        for(let y=0;y<ny;y++){
          for(let x=0;x<nx;x++) grid[offset(x,y,z)]=field(xAt(x),yAt(y),zAt(z));
        }
      }
      const corners=[[0,0,0],[1,0,0],[1,1,0],[0,1,0],[0,0,1],[1,0,1],[1,1,1],[0,1,1]];
      const tetrahedra=[[0,5,1,6],[0,1,2,6],[0,2,3,6],[0,3,7,6],[0,7,4,6],[0,4,5,6]];
      const vertices=[], normals=[], colors=[];
      function boundary(a,b) {
        return a.point.clone().lerp(b.point,a.value/(a.value-b.value));
      }
      function normalAt({x,y,z}) {
        const h=spacing*.36;
        return new T.Vector3(
          field(x+h,y,z)-field(x-h,y,z),
          field(x,y+h,z)-field(x,y-h,z),
          field(x,y,z+h)-field(x,y,z-h)
        ).normalize();
      }
      function triangle(a,b,c) {
        const na=normalAt(a), nb=normalAt(b), nc=normalAt(c);
        const reversed=b.clone().sub(a).cross(c.clone().sub(a)).dot(na)<0;
        vertices.push(...a,...(reversed?c:b),...(reversed?b:c));
        normals.push(...na,...(reversed?nc:nb),...(reversed?nb:nc));
        if(tint){
          for(const {x,y,z} of [a,reversed?c:b,reversed?b:c]){
            const tone=tint(x,y,z);
            colors.push(tone.r,tone.g,tone.b);
          }
        }
      }
      for(let z=0;z<nz-1;z++){
        for(let y=0;y<ny-1;y++){
          for(let x=0;x<nx-1;x++){
            const values=corners.map(([dx,dy,dz])=>grid[offset(x+dx,y+dy,z+dz)]);
            if(values.every(value=>value>=0)||values.every(value=>value<0)) continue;
            const cube=corners.map(([dx,dy,dz],i)=>({
              point:new T.Vector3(xAt(x+dx),yAt(y+dy),zAt(z+dz)), value:values[i]
            }));
            for(const tetrahedron of tetrahedra){
              const inside=[],outside=[];
              for(const i of tetrahedron) (cube[i].value<0?inside:outside).push(cube[i]);
              if(inside.length===1) triangle(...outside.map(vertex=>boundary(inside[0],vertex)));
              if(outside.length===1) triangle(...inside.map(vertex=>boundary(outside[0],vertex)));
              if(inside.length===2){
                const [a,b]=outside.map(vertex=>boundary(inside[0],vertex));
                const [c,d]=outside.map(vertex=>boundary(inside[1],vertex));
                triangle(a,b,c);
                triangle(b,d,c);
              }
            }
          }
        }
      }
      const geometry=new T.BufferGeometry();
      geometry.setAttribute('position',new T.Float32BufferAttribute(vertices,3));
      geometry.setAttribute('normal',new T.Float32BufferAttribute(normals,3));
      if(tint) geometry.setAttribute('color',new T.Float32BufferAttribute(colors,3));
      return geometry;
    }

    function pantsField(x,y,z) {
      const arch=.083*Math.exp(-(x*x)/.17)*smooth(z,.03,.58);
      const seatedBase=.024*(1-smooth(y,.08,.32));
      const height=y+seatedBase-arch*(1-smooth(y,.12,.36));
      const [width,depth]=body(height);
      const thigh=.255*Math.exp(-(((Math.abs(x)-.66)/.35)**2+((height-.42)/.39)**2));
      const nx=x/width;
      const front=Math.sqrt(Math.max(0,1-nx*nx));
      const volume=z+.09;
      const nz=volume/(depth+thigh*smooth(front,.22,.72)*smooth(volume,0,.37));
      const radial=(Math.hypot(nx,nz)-1)*Math.min(width,depth);
      return Math.max(radial,.044-height,height-1.85);
    }
    function footField(x,y,z) {
      const localX=Math.abs(x);
      const centerY=.40+.040*smooth(z,.68,1.09);
      const py=y-centerY;
      const px=localX-(.641+.095*smooth(z,.45,1.22))-.09*py;
      const along=z+(.14*py+.145*px)*smooth(z,.60,1.11);
      const radius=Math.hypot(px/.865,py);
      const far=Math.max(.32-along,along-1.281,radius-.414);
      if(far>.21) return far;
      let distanceSquared=Infinity;
      for(const segment of soleSegments){
        const dz=along-segment.z, dr=radius-segment.radius;
        const t=T.MathUtils.clamp((dz*segment.dz+dr*segment.dr)*segment.inverseLength,0,1);
        const deltaZ=dz-t*segment.dz, deltaRadius=dr-t*segment.dr;
        distanceSquared=Math.min(distanceSquared,deltaZ*deltaZ+deltaRadius*deltaRadius);
      }
      const inside=along>.32&&along<1.281&&radius<footProfile(along)[0];
      return Math.sqrt(distanceSquared)*(inside?-1:1);
    }
    const upperArm=ellipsoidField([.629,1.359,.379],[.209,.239,.366],.22);
    const elbow=ellipsoidField([.685,1.225,.667],[.186,.206,.237],-.35);
    const forearm=ellipsoidField([.563,1.182,.863],[.174,.195,.254],-.70);
    const wrist=ellipsoidField([.451,1.173,.998],[.143,.174,.166],-.77);
    const canDepth=1.008;
    const canRadius=.269;
    const palm=ellipsoidField([.373,1.172,1.116],[.153,.178,.146],-.62);
    const thumb=ellipsoidField([.307,1.375,1.170],[.112,.056,.077],.31);
    const fingers=[
      ellipsoidField([.268,1.293,1.235],[.107,.065,.081],.23),
      ellipsoidField([.264,1.174,1.246],[.113,.066,.083],.24),
      ellipsoidField([.280,1.055,1.230],[.110,.068,.080],.22)
    ];
    function armField(x,y,z) {
      x=Math.abs(x);
      if(y<.85||y>1.68||z<-.10||x>1.1) return .24;
      let arm=roundedUnion(upperArm(x,y,z),elbow(x,y,z),.173);
      arm=roundedUnion(arm,forearm(x,y,z),.152);
      arm=roundedUnion(arm,wrist(x,y,z),.128);
      arm=roundedUnion(arm,palm(x,y,z),.129);
      arm=roundedUnion(arm,thumb(x,y,z),.089);
      let grip=Infinity;
      for(const finger of fingers) grip=Math.min(grip,finger(x,y,z));
      const hand=roundedUnion(arm,grip,mix(.016,.068,smooth(x,.235,.355)));
      // Keep the grip outside the can, including at the blended finger roots.
      const canClearance=canRadius+.008-Math.hypot(x,z-canDepth);
      return -roundedUnion(-hand,-canClearance,.014);
    }
    function lowerBodyField(x,y,z) {
      return roundedUnion(pantsField(x,y,z),footField(x,y,z),.245);
    }
    // Blend the shoulder into the torso, while preserving the gap at the front of the grip.
    const bodyGeometry=sculptSurface((x,y,z)=>{
      const body=lowerBodyField(x,y,z);
      const arm=armField(x,y,z);
      const shoulderBlend=mix(.174,.052,smooth(z,.51,.94));
      return roundedUnion(body,arm,shoulderBlend);
    },[-1.28,-.047,-1.04],[136,103,129],.019,(x,y,z)=>{
      const pants=pantsField(x,y,z), foot=footField(x,y,z);
      const legColor=smooth(pants-foot,-.021,.021);
      const handColor=smooth(roundedUnion(pants,foot,.245)-armField(x,y,z),-.042,.042);
      return outfitColor(x,y,z).lerp(gold,Math.max(legColor,handColor));
    });
    mesh(bodyGeometry,colorClay).name='torso-and-feet';

    const label=makeTexture(1024,384,(c,w,h)=>{
      const red=c.createLinearGradient(0,0,0,h);
      red.addColorStop(0,'#ef382b');
      red.addColorStop(.51,'#cb1b1b');
      red.addColorStop(1,'#a91215');
      c.fillStyle=red;
      c.fillRect(0,0,w,h);
      const oval=(x,y,rx,ry,color)=>{
        c.beginPath();
        c.ellipse(x,y,rx,ry,0,0,Math.PI*2);
        c.fillStyle=color;
        c.fill();
      };
      c.save();
      c.translate(w/2,0);
      const outline='#2b211d', skin='#ffd39a';
      c.fillStyle=outline;
      c.beginPath();
      c.moveTo(-114,119);
      c.quadraticCurveTo(-105,75,-54,61);
      c.lineTo(-89,48);
      c.quadraticCurveTo(-46,36,-5,50);
      c.quadraticCurveTo(28,30,78,42);
      c.lineTo(48,55);
      c.quadraticCurveTo(107,74,116,120);
      c.lineTo(78,110);
      c.lineTo(-83,108);
      c.closePath();
      c.fill();
      oval(0,193,94,104,outline);
      for(const x of [-87,87]){
        oval(x,211,21,24,outline);
        oval(x,211,15,18,skin);
      }
      oval(0,196,83,92,skin);
      for(const x of [-36,35]){
        oval(x,160,27,41,outline);
        oval(x,160,21,34,'#fff8e6');
        oval(x+6,161,13,26,outline);
        oval(x<0?-61:62,216,13,10,'#ed6954');
      }
      oval(0,206,12,11,outline);
      oval(0,206,8,7,skin);
      c.fillStyle=outline;
      c.beginPath();
      c.moveTo(-47,214);
      c.quadraticCurveTo(0,242,48,211);
      c.quadraticCurveTo(31,272,0,276);
      c.quadraticCurveTo(-32,273,-47,214);
      c.fill();
      oval(0,255,23,15,'#ec3323');
      c.strokeStyle=outline;
      c.lineWidth=7;
      c.fillStyle='#f9e5a1';
      c.beginPath();
      c.moveTo(-41,283);
      c.quadraticCurveTo(-70,295,-83,365);
      c.lineTo(83,365);
      c.quadraticCurveTo(70,295,41,283);
      c.closePath();
      c.fill();
      c.stroke();
      c.fillStyle='#23455f';
      c.fillRect(-46,330,92,35);
      c.fillStyle='#ffd34b';
      c.fillRect(-50,327,100,9);
      c.restore();
      c.fillStyle='#f3efd8';
      for(const y of [180,196,216,233]) c.fillRect(730,y,134,4);
    });
    label.anisotropy=8;
    const canProfile=[
      [0,-.402],[.226,-.402],[.248,-.391],[.256,-.368],
      [.266,-.337],[canRadius,.297],[.259,.338],[.245,.373],[.233,.391]
    ].map(([x,y])=>new T.Vector2(x,y));
    const canGeometry=new T.LatheGeometry(canProfile,96);
    const canUV=canGeometry.getAttribute('uv');
    const canPositions=canGeometry.getAttribute('position');
    for(let i=0;i<canUV.count;i++){
      canUV.setY(i,(canPositions.getY(i)+.402)/.793);
    }
    const firstCanPart=figure.children.length;
    const can=mesh(canGeometry,new T.MeshPhysicalMaterial({
      map:label,roughness:.36,metalness:.07,clearcoat:.48,clearcoatRoughness:.30
    }),0,1.27,canDepth);
    can.name='drink-can';
    can.rotation.y=Math.PI;
    const aluminum = new T.MeshStandardMaterial({color:0xc5bcb3,metalness:.49,roughness:.29});
    const innerAluminum=clay(0x8b776a);
    for(const y of [.866,1.667]){
      const ring=mesh(new T.TorusGeometry(.232,.017,16,72),aluminum,0,y,canDepth);
      ring.rotation.x=Math.PI/2;
    }
    mesh(new T.CylinderGeometry(.231,.231,.012,64),aluminum,0,1.659,canDepth);
    mesh(new T.CylinderGeometry(.197,.197,.007,64),innerAluminum,0,1.666,canDepth);
    const tab=mesh(new T.TorusGeometry(.054,.009,12,40),aluminum,.022,1.673,canDepth+.006);
    tab.rotation.x=Math.PI/2;
    tab.scale.set(1,.62,1);
    for(const part of figure.children.slice(firstCanPart)) part.castShadow=false;
    return figure;
  };
})();
