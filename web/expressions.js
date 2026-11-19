(() => {
  'use strict';
  const T=window.THREE,clamp=(v,a,b)=>Math.max(a,Math.min(b,v));
  const profiles={
    confident:{w:.105,h:.14,iris:[.06,.08],open:1,gaze:[.045,.025]},
    slacking:{w:.235,h:.245,iris:[.092,.11],open:1,gaze:[-.055,-.025]},
    jailed:{w:.18,h:.21,iris:[.09,.125],open:.64,gaze:[0,-.025]},
    coding:{w:.175,h:.18,iris:[.105,.13],open:.88,gaze:[.01,-.035]},
    headache:{w:.235,h:.23,iris:[.11,.14],open:.58,gaze:[-.015,-.035]},
    verytired:{w:.29,h:.23,iris:[.145,.16],open:.34,gaze:[.075,-.065]},
    sick:{w:.25,h:.19,iris:[.118,.13],open:.53,gaze:[.02,-.035]},
    calm:{w:.18,h:.19,iris:[.116,.14],open:.91,gaze:[.035,.005]},
    sad:{w:.205,h:.245,iris:[.12,.145],open:.97,gaze:[0,-.075]},
    anxious:{w:.205,h:.245,iris:[.064,.08],open:1,gaze:[-.055,.005]},
    tired:{w:.22,h:.18,iris:[.115,.125],open:.49,gaze:[.025,-.035]},
    resigned:{w:.195,h:.22,iris:[.09,.115],open:.94,gaze:[.04,.06]},
    speechless:{w:.225,h:.175,iris:[.065,.083],open:.48,gaze:[.125,-.025]},
    sleepy:{w:.225,h:.185,iris:[.12,.135],open:.25,gaze:[0,-.085]}
  };
  const smooth=t=>{t=clamp(t,0,1);return t*t*(3-2*t);};
  function acting(mood,time,attending,px,py,reduced){
    const p=profiles[mood];if(!p)return null;
    const pose={x:p.gaze[0],y:p.gaze[1],open:p.open,yawn:0};
    if(mood==='confident')pose.open=0;
    if(reduced)return pose;
    if(attending){pose.x=clamp(px,-1,1)*.10;pose.y+=clamp(py,-1,1)*.07;}
    else if(mood==='anxious'){
      // Pauses at each destination make a worried glance readable.
      const points=[[-.07,.025],[.065,.04],[.055,-.045],[-.035,-.035]];
      const phase=time/1.25,index=Math.floor(phase)%points.length,t=smooth((phase%1-.62)/.38);
      const a=points[index],b=points[(index+1)%points.length];
      pose.x=a[0]+(b[0]-a[0])*t;pose.y=a[1]+(b[1]-a[1])*t;
    }else if(mood==='calm'){pose.x+=Math.sin(time*.4)*.012;}
    const sleepy=['sleepy','sick','headache','verytired'].includes(mood),phase=time%(sleepy?7.2:6.1);
    const start=sleepy?4.4:3.8,close=sleepy?.42:.12,hold=sleepy?.14:.03,open=sleepy?.65:.22;
    let blink=0;
    if(phase>=start&&phase<start+close)blink=smooth((phase-start)/close);
    else if(phase>=start+close&&phase<start+close+hold)blink=1;
    else if(phase>=start+close+hold&&phase<start+close+hold+open)blink=1-smooth((phase-start-close-hold)/open);
    pose.open*=1-blink;
    if(sleepy){pose.yawn=Math.pow(Math.max(0,Math.sin(time*.65)),6);pose.open*=1-pose.yawn*.3;}
    return pose;
  }
  class ExpressionPet extends MoodPet {
    constructor(canvas,react){
      super(canvas,react);if(this.failed)return;
      this.studyFaces={};
      this.studyInk=new T.MeshBasicMaterial({color:0x66564A,toneMapped:false,transparent:true});
      this.studyWhite=new T.MeshPhysicalMaterial({color:0xFFF7E8,roughness:.64,clearcoat:.06,specularIntensity:.12,envMapIntensity:.16,transparent:true});
      this.studyGlass=new T.MeshPhysicalMaterial({color:0x191C19,roughness:.48,clearcoat:.18,envMapIntensity:.28,transparent:true});
      this.studyTear=new T.MeshPhysicalMaterial({color:0xB8DCE5,roughness:.16,clearcoat:.5,transparent:true,opacity:.8});
      this.buildFaces();this.draw();
    }
    add(face,geometry,material,u,v,lift=.04){
      const mesh=new T.Mesh(geometry,material);mesh.frustumCulled=false;
      face.group.add(mesh);
      const part={mesh,rest:Float32Array.from(geometry.attributes.position.array),u,v,lift};
      face.parts.push(part);return part;
    }
    curve(face,point,u,v,r=.006,lift=.045,segments=40){
      const curve=new T.Curve();curve.getPoint=t=>new T.Vector3(...point(t));
      const part=this.add(face,new T.TubeGeometry(curve,segments,r,6,false),this.studyInk,u,v,lift);
      part.point=point;part.radius=r;part.segments=segments;
      return part;
    }
    updateCurve(part){
      const a=part.rest,segments=part.segments,r=part.radius;
      for(let i=0;i<=segments;i++){
        const t=i/segments,p=part.point(t),p0=part.point(Math.max(0,t-.001)),p1=part.point(Math.min(1,t+.001));
        const dx=p1[0]-p0[0],dy=p1[1]-p0[1],length=Math.hypot(dx,dy)||1;
        for(let j=0;j<=6;j++){
          const angle=j/6*Math.PI*2,k=(i*7+j)*3;
          a[k]=p[0]-dy/length*Math.cos(angle)*r;
          a[k+1]=p[1]+dx/length*Math.cos(angle)*r;a[k+2]=Math.sin(angle)*r;
        }
      }
    }
    eyeMaterial(eye,color){
      const material=new T.MeshBasicMaterial({color,toneMapped:false,transparent:true});
      material.onBeforeCompile=shader=>{
        shader.uniforms.eyeOpening=eye.uniform;
        shader.vertexShader='attribute vec2 faceCoordinate; varying vec2 vFaceCoordinate;\n'+shader.vertexShader.replace('#include <begin_vertex>','#include <begin_vertex>\nvFaceCoordinate=faceCoordinate;');
        shader.fragmentShader='uniform vec3 eyeOpening; varying vec2 vFaceCoordinate;\n'+shader.fragmentShader.replace('#include <clipping_planes_fragment>',`#include <clipping_planes_fragment>
          float edge=sqrt(max(0.0,1.0-pow(vFaceCoordinate.x/eyeOpening.x,2.0)));
          if(abs(vFaceCoordinate.x)>eyeOpening.x || vFaceCoordinate.y>eyeOpening.y*eyeOpening.z*edge || vFaceCoordinate.y < eyeOpening.y*eyeFloor*edge) discard;`);
        shader.uniforms.eyeFloor=eye.floorUniform;
        shader.uniforms.eyeSlope=eye.slopeUniform;
        shader.uniforms.eyeArc=eye.arcUniform;
        shader.fragmentShader='uniform float eyeFloor; uniform float eyeSlope; uniform float eyeArc;\n'+shader.fragmentShader;
        shader.fragmentShader=shader.fragmentShader.replace('float edge=sqrt','float eyeY=vFaceCoordinate.y-vFaceCoordinate.x*eyeSlope;\nfloat edge=sqrt').replaceAll('vFaceCoordinate.y>','eyeY>').replaceAll('vFaceCoordinate.y <','eyeY <');
        shader.fragmentShader=shader.fragmentShader.replace('eyeOpening.z*edge','eyeOpening.z*mix(edge,edge*edge,eyeArc)');
      };
      material.customProgramCacheKey=()=> 'study-eye-opening-v1';return material;
    }
    buildEye(face,side){
      const p=face.profile,scale=face.mood==='sick'&&side>0?.92:face.mood==='anxious'&&side>0?.85:face.mood==='resigned'&&side<0?.94:1;
      const eye={w:p.w*scale,h:p.h*scale,u:side*.365,v:.16,open:p.open,upper:2*p.open-1,lower:-1,dx:0,dy:0};
      if(face.mood==='sick')eye.v+=side>0?-.026:.015;
      if(face.mood==='verytired')eye.v+=side<0?-.065:.035;
      if(face.mood==='headache')eye.v+=side>0?-.025:.01;
      if(face.mood==='confident'){eye.u=side*.29;eye.v+=side>0?.015:0;}
      if(face.mood==='slacking'){eye.u=side*.285;eye.v=side>0?.31:.34;}
      if(face.mood==='jailed'){eye.u=side*.27;eye.v=side>0?.13:.16;}
      if(face.mood==='resigned')eye.v+=side*.018;
      if(face.mood==='anxious')eye.v+=side<0?.02:-.02;
      eye.uniform={value:new T.Vector3(eye.w,eye.h,2*eye.open-1)};
      eye.floorUniform={value:-1};
      eye.slope=face.mood==='verytired'?(side<0?.20:-.10):0;eye.slopeUniform={value:eye.slope};
      eye.parabolic=face.mood==='verytired';eye.arcUniform={value:eye.parabolic?1:0};
      // Interior rings follow the curved body; a single triangle fan cuts into large eyes.
      eye.white=this.add(face,new T.RingGeometry(0,1,64,6),this.studyWhite,eye.u,eye.v,.049);
      eye.disk=Float32Array.from(eye.white.rest);
      eye.outline=this.curve(face,t=>{
        const angle=t*Math.PI*2,x=eye.w*Math.cos(angle),sin=Math.sin(angle);
        const arc=sin>=0&&eye.parabolic?sin*sin:Math.abs(sin);
        return [x,eye.h*arc*(sin>=0?eye.upper:eye.lower)+eye.slope*x,0];
      },eye.u,eye.v,.004,.067,64);
      eye.lid=this.curve(face,t=>{const x=-eye.w*Math.cos(t*Math.PI),arc=Math.sin(t*Math.PI);return[x,eye.h*eye.upper*(eye.parabolic?arc*arc:arc)+eye.slope*x,0];},eye.u,eye.v,.006,.069);
      eye.iris=this.add(face,new T.SphereGeometry(1,32,20),this.eyeMaterial(eye,0x5A4030),eye.u,eye.v,.072);
      eye.iris.scale=[p.iris[0]*scale,p.iris[1]*scale,.016];
      eye.glint=this.add(face,new T.SphereGeometry(.019,12,8),this.eyeMaterial(eye,0xFFF5DC),eye.u,eye.v,.094);
      for(const part of [eye.iris,eye.glint]){
        part.mesh.geometry.setAttribute('faceCoordinate',new T.BufferAttribute(new Float32Array(part.mesh.geometry.attributes.position.count*2),2));part.eye=eye;
      }
      if(face.mood==='sad'){
        eye.tear=this.add(face,new T.SphereGeometry(1,24,12),this.studyTear,eye.u,eye.v-eye.h+.022,.09);eye.tear.scale=[.115,.028,.021];
      }
      if(['sleepy','verytired'].includes(face.mood)){
        const shadow=new T.ShaderMaterial({
          uniforms:{tint:{value:new T.Color(0x514A68)}},transparent:true,depthWrite:false,toneMapped:false,
          vertexShader:'varying vec2 eyeShadowUv; void main(){eyeShadowUv=uv;gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.0);}',
          fragmentShader:`uniform vec3 tint; varying vec2 eyeShadowUv;
            void main(){
              float x=(eyeShadowUv.x-.5)*2.0;
              float arc=.34+.34*x*x;
              float alpha=exp(-pow((eyeShadowUv.y-arc)/.23,2.0))*pow(max(0.0,1.0-x*x),.8)*.54;
              gl_FragColor=vec4(tint,alpha);
              #include <colorspace_fragment>
            }`
        });
        eye.shadow=this.add(face,new T.PlaneGeometry(eye.w*2.3,.16,24,8),shadow,eye.u,eye.v-eye.h-.055,.035);
        if(face.mood==='verytired'){
          shadow.uniforms.tint.value.set(0x8B738F);
          shadow.fragmentShader=shadow.fragmentShader.replace('*.54','*.27');
          eye.shadow.mesh.geometry.dispose();eye.shadow.mesh.geometry=new T.PlaneGeometry(eye.w*2.2,.24,24,8);
          eye.shadow.rest=Float32Array.from(eye.shadow.mesh.geometry.attributes.position.array);eye.shadow.v=eye.v-eye.h-.025;
        }
      }
      if(face.mood==='sick'){
        eye.glint.scale=[.55,.55,.55];
        eye.rim=this.curve(face,t=>[-eye.w*Math.cos(t*Math.PI),-eye.h*Math.sin(t*Math.PI),0],eye.u,eye.v,.008,.066);
        eye.rim.mesh.material=new T.MeshBasicMaterial({color:0xBE8278,toneMapped:false,transparent:true,opacity:.68});
      }
      face.eyes.push(eye);
      if(face.mood==='confident'){eye.lid.point=t=>[(t-.5)*.19,Math.sin(t*Math.PI)*.024,0];eye.lid.radius=.010;return;}
      const lift=face.mood==='calm'?.46:face.mood==='sleepy'?.37:face.mood==='verytired'?.49:.46;
      this.curve(face,t=>{
        const x=(t-.5)*.22,arch=Math.sin(t*Math.PI)*.02;
        let y=arch;
        if(face.mood==='sick')y=-side*x*.32+Math.sin(t*Math.PI*2)*.009;
        if(face.mood==='headache')y=-side*x*.42+Math.sin(t*Math.PI)*.017;
        if(face.mood==='confident')y=side>0?Math.sin(t*Math.PI)*.07+.04:-x*.12;
        if(face.mood==='jailed')y=-side*x*.33+(side<0?.015:0);
        if(face.mood==='sad')y+=-side*x*.55;
        if(face.mood==='anxious')y+=-side*x*.38+(side>0?.015:0);
        if(['tired','verytired'].includes(face.mood))y+=-side*x*.26-.025;
        if(face.mood==='verytired')y=-side*x*.33+Math.sin(t*Math.PI)*.014;
        if(face.mood==='resigned')y+=-side*x*.40+side*.02;
        if(face.mood==='speechless')y=side>0?arch+.025:0;
        return [x,y,0];
      },eye.u,lift+(face.mood==='verytired'?(side<0?-.035:.025):0),.006,.035);
    }
    buildFaces(){
      for(const [mood,profile] of Object.entries(profiles)){
        const face={mood,profile,group:new T.Group(),parts:[],eyes:[]};this.studyFaces[mood]=face;this.group.add(face.group);
        this.buildEye(face,-1);this.buildEye(face,1);
        if(mood==='calm'||mood==='coding'){
          for(const side of [-1,1]){
            const w=.32,h=.265,r=.10,shape=new T.Shape();
            shape.moveTo(-w+r,h);shape.lineTo(w-r,h);shape.quadraticCurveTo(w,h,w,h-r);shape.lineTo(w,-h+r);shape.quadraticCurveTo(w,-h,w-r,-h);shape.lineTo(-w+r,-h);shape.quadraticCurveTo(-w,-h,-w,-h+r);shape.lineTo(-w,h-r);shape.quadraticCurveTo(-w,h,-w+r,h);
            const path=new T.Curve();path.getPoint=t=>{const p=shape.getPoint(t);return new T.Vector3(p.x,p.y,0);};
            this.add(face,new T.TubeGeometry(path,96,.017,8,true),this.studyGlass,side*.37,.115,.13);
            const temple=this.curve(face,t=>[side*t*.095,-t*.018,0],side*.705,.13,.016,.12,12);temple.mesh.material=this.studyGlass;
          }
          const bridge=this.curve(face,t=>[(t-.5)*.13,Math.sin(Math.PI*t)*.022,0],0,.14,.017,.13,20);bridge.mesh.material=this.studyGlass;
        }
        if(mood==='coding')this.buildCodingProps(face);
        if(mood==='headache'){this.buildHeadWrap(face);}
        if(mood==='confident'){this.buildConfidentProps(face);}
        else if(mood==='slacking'){this.buildSlackingProps(face);}
        else if(mood==='jailed'){this.buildJailedProps(face);}
        else if(mood==='verytired'){
          const shape=new T.Shape();shape.moveTo(-.10,-.006);shape.bezierCurveTo(-.095,.037,.065,.045,.10,.007);shape.bezierCurveTo(.105,-.023,-.065,-.018,-.10,-.006);
          face.slackMouth=this.add(face,new T.ShapeGeometry(shape,32),new T.MeshBasicMaterial({color:0x9E7D87,toneMapped:false,transparent:true}),.012,-.28,.05);
          this.curve(face,t=>{const p=shape.getPoint(t);return[p.x,p.y,0];},.012,-.28,.004,.056,48);
          const sigh=this.curve(face,t=>{const a=-Math.PI*.6+t*Math.PI*1.5;return[.047*Math.cos(a),.033*Math.sin(a),0];},.235,-.30,.0035,.035,32);
          sigh.mesh.material=new T.MeshBasicMaterial({color:0xA99A9F,toneMapped:false,transparent:true,opacity:.55});
          const breath=this.curve(face,t=>[-.05+t*.065,-.01*Math.sin(t*Math.PI),0],.16,-.305,.003,.036,18);breath.mesh.material=sigh.mesh.material;
        }else if(mood==='sick'){this.buildSickProps(face);}
        else if(mood==='sleepy'){
          const shape=new T.Shape();shape.absellipse(0,0,.058,.082,0,Math.PI*2,false);
          const material=new T.MeshBasicMaterial({color:0xA36C70,toneMapped:false,transparent:true});
          face.yawn=this.add(face,new T.ShapeGeometry(shape,32),material,0,-.255,.052);
          face.tongue=this.add(face,new T.SphereGeometry(1,24,12),new T.MeshBasicMaterial({color:0xE4ADB0,toneMapped:false,transparent:true}),0,-.295,.067);face.tongue.scale=[.038,.022,.012];
          this.curve(face,t=>[.058*Math.cos(t*Math.PI*2),.082*Math.sin(t*Math.PI*2),0],0,-.255,.004,.054,48);
        }else{
          this.curve(face,t=>{
            const x=(t-.5)*(mood==='calm'?.155:mood==='anxious'?.21:.18);
            let y=0;
            if(mood==='calm')y=-Math.sin(t*Math.PI)*.025+x*.06;
            if(mood==='sad')y=Math.sin(t*Math.PI)*.034;
            if(mood==='anxious')y=Math.sin(t*Math.PI*3+.2)*.014;
            if(mood==='tired')y=Math.sin(t*Math.PI)*.004-x*.035;
            if(mood==='resigned')y=Math.sin(t*Math.PI*2)*.009-x*.06;
            if(mood==='speechless')y=Math.sin(t*Math.PI)*.007;
            if(mood==='headache')y=Math.sin(t*Math.PI)*.025-x*.06;
            return [x,y,0];
          },mood==='resigned'?.025:0,mood==='calm'?-.25:-.29,.005,.045);
        }
        if(mood==='speechless'){
          const q=new T.CurvePath();q.add(new T.CubicBezierCurve3(new T.Vector3(-.05,.09,0),new T.Vector3(-.05,.20,0),new T.Vector3(.11,.20,0),new T.Vector3(.065,.09,0)));q.add(new T.QuadraticBezierCurve3(new T.Vector3(.065,.09,0),new T.Vector3(0,.05,0),new T.Vector3(0,.005,0)));
          // This punctuation floats beside the body, so it is not projected onto the sphere.
          const mark=new T.Mesh(new T.TubeGeometry(q,40,.009,8,false),this.studyInk);mark.position.set(1.02,.54,.3);face.group.add(mark);
          const dot=new T.Mesh(new T.SphereGeometry(.012,12,8),this.studyInk);dot.position.set(1.02,.50,.3);face.group.add(dot);
        }
        if(mood==='anxious'){
          const drop=new T.Shape();drop.moveTo(0,.075);drop.bezierCurveTo(-.055,-.025,-.035,-.06,0,-.06);drop.bezierCurveTo(.035,-.06,.055,-.025,0,.075);
          this.add(face,new T.ExtrudeGeometry(drop,{depth:.008,bevelEnabled:true,bevelSize:.005,bevelThickness:.005,bevelSegments:2}),this.studyTear,.65,.45,.045);
        }
        face.group.visible=false;
      }
    }
    mappedFaceMesh(face,geometry,material){
      const mesh=this.deformable(geometry,material);face.group.add(mesh);return mesh;
    }
    buildConfidentProps(face){
      const mouth=new T.CurvePath();
      mouth.add(new T.CubicBezierCurve3(new T.Vector3(-.19,.015,0),new T.Vector3(-.17,-.065,0),new T.Vector3(-.045,-.065,0),new T.Vector3(0,-.015,0)));
      mouth.add(new T.CubicBezierCurve3(new T.Vector3(0,-.015,0),new T.Vector3(.055,-.055,0),new T.Vector3(.15,-.055,0),new T.Vector3(.19,.025,0)));
      face.smile=this.curve(face,t=>{const p=mouth.getPoint(t);return[p.x,p.y,0];},0,-.055,.012,.060,64);
      const blushMaterial=new T.MeshBasicMaterial({color:0xFFC4CD,toneMapped:false,transparent:true,opacity:.85});face.blush=[];
      for(const side of [-1,1]){const blush=this.add(face,new T.SphereGeometry(1,24,16),blushMaterial,side*.43,-.07,.04);blush.scale=[.09,.065,.012];face.blush.push(blush);}
      const red=new T.MeshPhysicalMaterial({color:0xD9232E,roughness:.24,clearcoat:.65,transparent:true});
      const roasted=new T.MeshStandardMaterial({color:0xC87831,roughness:.55,transparent:true});
      const bone=new T.MeshStandardMaterial({color:0xFFF0D4,roughness:.7,transparent:true});
      face.liftingArms=[];face.drumsticks=[];
      for(const side of [-1,1]){
        const arm=new T.Group();arm.position.set(side*.72,.14,.20);face.group.add(arm);face.liftingArms.push(arm);
        const shoulder=new T.Vector3(0,0,0),elbow=new T.Vector3(side*.48,.04,.12),wrist=new T.Vector3(side*.48,.45,.22);
        for(const [a,b,r] of [[shoulder,elbow,.09],[elbow,wrist,.075]]){
          const direction=new T.Vector3().subVectors(b,a);
          const limb=new T.Mesh(new T.CapsuleGeometry(r,Math.max(.01,direction.length()-r*2),6,16),red);
          limb.position.copy(a).add(b).multiplyScalar(.5);limb.quaternion.setFromUnitVectors(new T.Vector3(0,1,0),direction.normalize());arm.add(limb);
        }
        const drumstick=new T.Group();drumstick.position.copy(wrist);drumstick.rotation.z=-side*.24;arm.add(drumstick);face.drumsticks.push(drumstick);
        const shaft=new T.Mesh(new T.CapsuleGeometry(.037,.22,5,16),bone);shaft.position.y=.02;drumstick.add(shaft);
        for(const x of [-.027,.027]){const nub=new T.Mesh(new T.SphereGeometry(.045,16,12),bone);nub.position.set(x,-.12,0);drumstick.add(nub);}
        const meat=new T.Mesh(new T.SphereGeometry(1,32,24),roasted);meat.scale.set(.16,.225,.135);meat.position.set(0,.25,0);drumstick.add(meat);
        const taper=new T.Mesh(new T.SphereGeometry(1,24,16),roasted);taper.scale.set(.085,.12,.08);taper.position.set(0,.09,0);drumstick.add(taper);
        const fist=new T.Mesh(new T.SphereGeometry(1,24,16),red);fist.scale.set(.12,.10,.095);fist.position.copy(wrist);fist.position.z+=.045;arm.add(fist);
        const thumb=new T.Mesh(new T.SphereGeometry(1,18,12),red);thumb.scale.set(.055,.065,.05);thumb.position.copy(fist.position);thumb.position.x-=side*.07;thumb.position.z+=.04;arm.add(thumb);
      }
      face.flowers=[];
      const pink=new T.MeshStandardMaterial({color:0xFFB8CF,roughness:.65,transparent:true});
      const pollen=new T.MeshBasicMaterial({color:0xFFE8A0,toneMapped:false,transparent:true});
      for(const [x,y,size] of [[-.55,1.18,.85],[.56,1.28,1]]){
        const flower=new T.Group();flower.position.set(x,y,.20);flower.userData.baseY=y;flower.userData.size=size;face.group.add(flower);face.flowers.push(flower);
        for(let i=0;i<5;i++){const angle=i*Math.PI*2/5;const petal=new T.Mesh(new T.SphereGeometry(1,18,12),pink);petal.scale.set(.047,.062,.022);petal.position.set(Math.sin(angle)*.06,Math.cos(angle)*.06,0);petal.rotation.z=-angle;flower.add(petal);}
        const center=new T.Mesh(new T.SphereGeometry(.033,18,12),pollen);center.scale.z=.55;center.position.z=.025;flower.add(center);
      }
    }

    buildSlackingProps(face){
      const smile=new T.CurvePath();
      smile.add(new T.CubicBezierCurve3(new T.Vector3(-.39,.035,0),new T.Vector3(-.22,-.10,0),new T.Vector3(.18,-.12,0),new T.Vector3(.34,.005,0)));
      smile.add(new T.QuadraticBezierCurve3(new T.Vector3(.34,.005,0),new T.Vector3(.40,.055,0),new T.Vector3(.34,.10,0)));
      face.mouth=this.curve(face,t=>{const p=smile.getPoint(t);return[p.x,p.y,p.z];},0,-.13,.011,.055,64);
      face.mouth.mesh.material=new T.MeshBasicMaterial({color:0x627A3D,toneMapped:false,transparent:true});
      const blue=new T.MeshStandardMaterial({color:0x82C5DE,roughness:.5,transparent:true});
      const pale=new T.MeshStandardMaterial({color:0xD6EEF2,roughness:.65,transparent:true});
      const fin=new T.MeshStandardMaterial({color:0x519CB8,roughness:.55,transparent:true});
      const ink=new T.MeshBasicMaterial({color:0x356B7D,toneMapped:false,transparent:true});
      const handMaterial=new T.MeshStandardMaterial({color:0xB2C878,roughness:.48,transparent:true});
      face.fish=new T.Group();face.fish.position.set(0,-.65,1.48);face.group.add(face.fish);
      const body=new T.Mesh(new T.SphereGeometry(1,40,24),blue);body.scale.set(.56,.19,.16);face.fish.add(body);
      const belly=new T.Mesh(new T.SphereGeometry(1,32,20),pale);belly.scale.set(.47,.095,.12);belly.position.set(.025,-.07,.065);face.fish.add(belly);
      face.fishTail=new T.Group();face.fishTail.position.set(-.47,0,0);face.fish.add(face.fishTail);
      const tailShape=new T.Shape();tailShape.moveTo(.03,0);tailShape.quadraticCurveTo(-.09,.09,-.27,.16);tailShape.quadraticCurveTo(-.24,0,-.27,-.16);tailShape.quadraticCurveTo(-.09,-.09,.03,0);
      const tail=new T.Mesh(new T.ExtrudeGeometry(tailShape,{depth:.045,bevelEnabled:true,bevelSize:.018,bevelThickness:.018,bevelSegments:3,curveSegments:20}),fin);tail.position.z=-.022;face.fishTail.add(tail);
      const dorsalShape=new T.Shape();dorsalShape.moveTo(-.20,.13);dorsalShape.quadraticCurveTo(-.12,.29,.08,.23);dorsalShape.lineTo(.21,.13);dorsalShape.closePath();
      const dorsal=new T.Mesh(new T.ExtrudeGeometry(dorsalShape,{depth:.025,bevelEnabled:true,bevelSize:.01,bevelThickness:.01,bevelSegments:2}),fin);dorsal.position.z=-.012;face.fish.add(dorsal);
      const eyeWhite=new T.Mesh(new T.SphereGeometry(.058,20,14),this.studyWhite);eyeWhite.position.set(.36,.055,.137);eyeWhite.scale.z=.35;face.fish.add(eyeWhite);
      const eye=new T.Mesh(new T.SphereGeometry(.029,18,12),ink);eye.position.set(.374,.055,.159);eye.scale.z=.4;face.fish.add(eye);
      const gillPath=new T.QuadraticBezierCurve3(new T.Vector3(.20,.07,.151),new T.Vector3(.13,-.005,.169),new T.Vector3(.20,-.075,.151));
      face.fish.add(new T.Mesh(new T.TubeGeometry(gillPath,20,.006,6,false),ink));
      const mouthPath=new T.QuadraticBezierCurve3(new T.Vector3(.512,-.008,.06),new T.Vector3(.55,-.022,.07),new T.Vector3(.526,-.04,.06));
      face.fish.add(new T.Mesh(new T.TubeGeometry(mouthPath,16,.007,6,false),ink));
      face.hands=[];
      for(const side of [-1,1]){
        const hand=new T.Group();hand.position.set(side*.28,-.47,1.57);face.group.add(hand);face.hands.push(hand);
        const palm=new T.Mesh(new T.SphereGeometry(1,24,16),handMaterial);palm.scale.set(.14,.095,.085);hand.add(palm);
        const thumb=new T.Mesh(new T.SphereGeometry(1,18,12),handMaterial);thumb.scale.set(.055,.06,.05);thumb.position.set(-side*.08,-.04,.045);hand.add(thumb);
      }
    }
    buildJailedProps(face){
      const steel=new T.MeshStandardMaterial({color:0x3D3D45,roughness:.46,metalness:.25,transparent:true});
      face.bars=[];
      for(const x of [-1.04,-.54,0,.54,1.04]){
        const bar=new T.Mesh(new T.CapsuleGeometry(.022,2.04,6,12),steel);bar.position.set(x,.16,1.24);face.group.add(bar);face.bars.push(bar);
      }
      face.rail=new T.Mesh(new T.BoxGeometry(2.20,.055,.075),steel);face.rail.position.set(0,-.89,1.24);face.group.add(face.rail);
      face.hands=[];
      const handMat=new T.MeshStandardMaterial({color:0xA6AED0,roughness:.5,transparent:true});
      const seamMat=new T.MeshBasicMaterial({color:0x7C84A7,toneMapped:false,transparent:true,opacity:.5});
      for(const side of [-1,1]){
        const hand=new T.Group();hand.position.set(side*.54,-.40,1.27);face.group.add(hand);face.hands.push(hand);
        const mitten=new T.Mesh(new T.SphereGeometry(1,24,16),handMat);mitten.scale.set(.105,.125,.065);mitten.position.z=.025;hand.add(mitten);
        const thumb=new T.Mesh(new T.SphereGeometry(1,18,12),handMat);thumb.scale.set(.055,.065,.045);thumb.position.set(side*.055,.045,.05);hand.add(thumb);
        for(const y of [-.025,.025]){
          const crease=new T.QuadraticBezierCurve3(new T.Vector3(-.035,y,.087),new T.Vector3(.015,y+.008,.09),new T.Vector3(.058,y-.002,.08));
          hand.add(new T.Mesh(new T.TubeGeometry(crease,12,.0025,5,false),seamMat));
        }
      }
      face.grin=this.curve(face,t=>[(t-.5)*.34,Math.sin(t*Math.PI)*.012-Math.sin(t*Math.PI*2)*.005,0],0,-.24,.005,.060,40);
      const cheek=new T.ShaderMaterial({transparent:true,depthWrite:false,toneMapped:false,
        vertexShader:'varying vec2 blushUv; void main(){blushUv=uv;gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.0);}',
        fragmentShader:'varying vec2 blushUv; void main(){float r=length((blushUv-.5)*2.0);gl_FragColor=vec4(.77,.46,.48,exp(-r*r*4.0)*smoothstep(1.0,.5,r)*.17);}'
      });
      for(const side of [-1,1])this.add(face,new T.PlaneGeometry(.26,.15,12,8),cheek,side*.40,-.12,.034);
    }
    buildCodingProps(face){
      const shell=new T.MeshStandardMaterial({color:0x303844,roughness:.5,transparent:true});
      const cushion=new T.MeshStandardMaterial({color:0xEEE2CD,roughness:.9,transparent:true});
      const band=new T.Curve();band.getPoint=t=>new T.Vector3(Math.cos(t*Math.PI)*1.035,.14+Math.sin(t*Math.PI)*.93,.035);
      face.headband=this.mappedFaceMesh(face,new T.TubeGeometry(band,64,.045,10,false),shell);
      for(const side of [-1,1]){
        const cup=new T.SphereGeometry(1,24,16);cup.scale(.13,.245,.18);cup.translate(side*1.03,.16,.045);
        this.mappedFaceMesh(face,cup,shell);
        const pad=new T.SphereGeometry(1,20,14);pad.scale(.043,.18,.125);pad.translate(side*.94,.16,.06);this.mappedFaceMesh(face,pad,cushion);
      }
      face.keyboard=new T.Group();face.keyboard.position.set(0,-.75,1.62);face.keyboard.rotation.x=.45;face.group.add(face.keyboard);
      const board=new T.Mesh(new T.BoxGeometry(1.30,.075,.42),shell);face.keyboard.add(board);
      const keyMat=new T.MeshStandardMaterial({color:0xE1D9CB,roughness:.75,transparent:true});face.keys=[];
      for(let row=0;row<3;row++)for(let col=0;col<9;col++){
        const key=new T.Mesh(new T.BoxGeometry(.11,.025,.085),keyMat);key.position.set((col-4)*.135,.05,(row-1)*.115);face.keyboard.add(key);face.keys.push(key);
      }
      face.hands=[];
      for(const side of [-1,1]){
        const hand=new T.Mesh(new T.SphereGeometry(1,20,12),new T.MeshStandardMaterial({color:0x9ABEC4,roughness:.45,transparent:true}));hand.scale.set(.105,.065,.085);hand.position.set(side*.30,-.665,1.70);face.group.add(hand);face.hands.push(hand);
      }
    }
    buildHeadWrap(face){
      const cloth=new T.MeshStandardMaterial({color:0xF4EEE2,roughness:.95,transparent:true});
      face.wraps=[];
      for(const [theta,length,angle] of [[.60,.40,-.20],[.32,.26,.22]]){
        const geometry=new T.SphereGeometry(1.025,64,10,0,Math.PI*2,theta,length);
        geometry.rotateZ(angle);face.wraps.push(this.mappedFaceMesh(face,geometry,cloth));
      }
      const edge=new T.MeshBasicMaterial({color:0xDED7CA,toneMapped:false,transparent:true});
      for(const theta of [.60,1.0]){
        const path=new T.Curve();path.getPoint=t=>new T.Vector3(Math.cos(t*Math.PI*2)*Math.sin(theta)*1.028,Math.cos(theta)*1.028,Math.sin(t*Math.PI*2)*Math.sin(theta)*1.028).applyAxisAngle(new T.Vector3(0,0,1),-.20);
        this.mappedFaceMesh(face,new T.TubeGeometry(path,96,.004,6,true),edge);
      }
    }
    buildSickProps(face){
      const T=window.THREE;
      const blush=new T.ShaderMaterial({transparent:true,depthWrite:false,toneMapped:false,
        uniforms:{tint:{value:new T.Color(0xDA746D)}},
        vertexShader:'varying vec2 blushUv; void main(){blushUv=uv;gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.0);}',
        fragmentShader:`varying vec2 blushUv; uniform vec3 tint; void main(){float r=length((blushUv-.5)*2.0);float a=exp(-r*r*3.5)*smoothstep(1.0,.65,r)*.48;gl_FragColor=vec4(tint,a);
#include <colorspace_fragment>
}`});
      for(const side of [-1,1])this.add(face,new T.PlaneGeometry(.47,.27,20,12),blush,side*.43,-.095,.035);
      const mouth=new T.Shape();mouth.moveTo(-.13,-.006);
      mouth.bezierCurveTo(-.11,.065,.015,.07,.10,-.014);
      mouth.bezierCurveTo(.035,-.005,-.035,-.06,-.13,-.006);
      const mouthMat=new T.MeshBasicMaterial({color:0xA86860,toneMapped:false,transparent:true});
      face.sickMouth=this.add(face,new T.ShapeGeometry(mouth,32),mouthMat,0,-.265,.055);
      this.curve(face,t=>{const p=mouth.getPoint(t);return[p.x,p.y,0];},0,-.265,.005,.06,64);
      const anchor={u:.075,v:-.278},angle=-.56;
      function orient(geometry,x,y=0){geometry.rotateZ(angle);geometry.translate(Math.cos(angle)*x-Math.sin(angle)*y,Math.sin(angle)*x+Math.cos(angle)*y,0);return geometry;}
      const white=new T.MeshPhysicalMaterial({color:0xF4ECE0,roughness:.4,clearcoat:.25,transparent:true});
      const coral=new T.MeshBasicMaterial({color:0xCF817C,toneMapped:false,transparent:true});
      const screen=new T.MeshBasicMaterial({color:0x91A6AF,toneMapped:false,transparent:true});
      const handle=new T.CapsuleGeometry(.046,.19,6,12);handle.rotateZ(-Math.PI/2);
      face.thermometer=this.add(face,orient(handle,.25),white,anchor.u,anchor.v,.10);
      const stem=new T.CapsuleGeometry(.015,.105,4,10);stem.rotateZ(-Math.PI/2);
      this.add(face,orient(stem,.055),white,anchor.u,anchor.v,.085);
      face.thermometerTip=this.add(face,orient(new T.SphereGeometry(1,18,12).scale(.039,.045,.025),.373),coral,anchor.u,anchor.v,.12);
      this.add(face,orient(new T.BoxGeometry(.105,.039,.008),.25),screen,anchor.u,anchor.v,.15);
      face.thermometerRoot=anchor;
      const drop=new T.Shape();drop.moveTo(0,.075);drop.bezierCurveTo(-.055,-.02,-.04,-.065,0,-.065);drop.bezierCurveTo(.04,-.065,.055,-.02,0,.075);
      this.add(face,new T.ExtrudeGeometry(drop,{depth:.008,bevelEnabled:true,bevelSize:.005,bevelThickness:.005,bevelSegments:2}),this.studyTear,.66,.48,.05);
      face.heat=[];
      const heatMat=new T.MeshBasicMaterial({color:0xCD9180,toneMapped:false,transparent:true,opacity:.26});
      for(const x of [-.12,.14]){
        const curve=new T.CubicBezierCurve3(new T.Vector3(0,0,0),new T.Vector3(-.06,.06,0),new T.Vector3(.06,.1,0),new T.Vector3(0,.18,0));
        const heat=new T.Mesh(new T.TubeGeometry(curve,24,.009,6,false),heatMat);heat.position.set(x,1.1,.12);face.group.add(heat);face.heat.push(heat);
      }
    }
    attachFeatures(){
      super.attachFeatures();if(!this.studyFaces)return;
      const face=this.studyFaces[this.mood],active=!!(face&&!this.image&&!this.facialState.hurt);
      Object.values(this.studyFaces).forEach(f=>f.group.visible=active&&f===face);
      this.studyState={active:!!active,mood:this.mood};if(!active)return;
      this.features.forEach(f=>f.visible=false);
      const pose=acting(this.mood,this.clock,this.clock<this.attentionUntil,this.lookTarget.x/.3,this.lookTarget.y/.15,this.reduced.matches||!!this.body.hold);
      this.studyState.pose=pose;
      if(face.keys){
        const moving=!this.reduced.matches&&!this.body.hold;
        face.hands.forEach((hand,i)=>hand.position.y=-.665+(moving?Math.sin(this.clock*9+i*Math.PI)*.018:0));
        face.keys.forEach((key,i)=>key.position.y=.05-(moving&&i===Math.floor(this.clock*6)%face.keys.length?.012:0));
      }
      if(face.flowers){
        const moving=!this.reduced.matches&&!this.body.hold;
        face.flowers.forEach((flower,i)=>{flower.scale.setScalar(flower.userData.size*(moving?1+Math.sin(this.clock*2+i*Math.PI)*.08:1));flower.position.y=flower.userData.baseY+(moving?Math.sin(this.clock*1.3+i)*.025:0);flower.rotation.z=moving?Math.sin(this.clock*1.1+i)*.12:0;});
        face.liftingArms.forEach((arm,i)=>arm.rotation.z=moving?(i===0?-1:1)*Math.sin(this.clock*1.6)*.025:0);
      }
      if(face.fish){
        const moving=!this.reduced.matches&&!this.body.hold;
        const stroke=moving?Math.sin(this.clock*2.4):0;
        face.hands[1].position.x=.28+stroke*.065;
        face.hands[1].position.y=-.47+(moving?(1-Math.cos(this.clock*2.4))*.012:0);
        face.hands[1].rotation.z=stroke*.10;
        face.fishTail.rotation.y=moving?Math.sin(this.clock*3.2)*.18:0;
      }
      for(const eye of face.eyes){
        const restingRatio=this.mood==='sick'&&eye.u>0?.82:this.mood==='headache'&&eye.u<0?.80:1;
        eye.open=pose.open*restingRatio;
        const closure=1-clamp(pose.open/face.profile.open,0,1);
        // Both lids meet near the eye center instead of rolling the upper lid to the bottom.
        eye.upper=(2*face.profile.open*restingRatio-1)*(1-closure)-.08*closure;
        eye.lower=-(1-closure)-.08*closure;
        eye.uniform.value.set(eye.w,eye.h,eye.upper);eye.floorUniform.value=eye.lower;
        const visible=eye.open/face.profile.open>.035;
        for(const part of [eye.white,eye.outline,eye.iris,eye.glint])part.mesh.visible=visible;
        if(eye.rim)eye.rim.mesh.visible=visible;
        if(this.mood==='verytired')eye.glint.mesh.visible=false;
        eye.dx=clamp(pose.x,-eye.w*.68,eye.w*.68);eye.dy=clamp(pose.y,-eye.h*.65,eye.h*.55);
        const a=eye.white.rest;
        for(let i=0;i<a.length/3;i++){
          const x=eye.disk[i*3],y=eye.disk[i*3+1],r=Math.hypot(x,y);
          const arc=y>=0&&eye.parabolic?(r?y*y/r:0):Math.abs(y);
          a[i*3]=eye.w*x;
          a[i*3+1]=eye.h*(arc*(y>=0?eye.upper:eye.lower)+(1-r)*(eye.upper+eye.lower)/2)+eye.slope*a[i*3];a[i*3+2]=0;
        }
      }
      const out={};
      for(const part of face.parts){
        if(part.point)this.updateCurve(part);
        const pos=part.mesh.geometry.attributes.position,normal=part.mesh.geometry.attributes.normal,coords=part.mesh.geometry.attributes.faceCoordinate;
        const scale=part.scale||[1,1,1];
        const eye=part.eye,offsetX=eye?eye.dx+(part===eye.glint?-.035:0):0,offsetY=eye?eye.dy+(part===eye.glint?.047:0):0;
        const yawn=part===face.yawn?.8+pose.yawn*.25:1;
        for(let i=0;i<pos.count;i++){
          const k=i*3,x=part.rest[k]*scale[0]+offsetX,y=part.rest[k+1]*scale[1]*yawn+offsetY,z=part.rest[k+2]*scale[2];
          if(coords)coords.setXY(i,x,y);
          const u=part.u+x,v=part.v+y;
          this.body.deform(u,v,Math.sqrt(Math.max(.015,1-u*u-v*v))+part.lift+z,out);pos.setXYZ(i,out.x,out.y,out.z);
        }
        pos.needsUpdate=true;if(coords)coords.needsUpdate=true;
        if(normal)part.mesh.geometry.computeVertexNormals();
      }
    }
  }
  window.MoodExpressions={profiles,acting};
  window.MoodPet=ExpressionPet;
})();
