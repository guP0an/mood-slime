(() => {
  'use strict';
  const T=window.THREE,clamp=(v,a,b)=>Math.max(a,Math.min(b,v));
  const profiles={
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
    if(reduced)return pose;
    if(attending){pose.x=clamp(px,-1,1)*.10;pose.y+=clamp(py,-1,1)*.07;}
    else if(mood==='anxious'){
      // Pauses at each destination make a worried glance readable.
      const points=[[-.07,.025],[.065,.04],[.055,-.045],[-.035,-.035]];
      const phase=time/1.25,index=Math.floor(phase)%points.length,t=smooth((phase%1-.62)/.38);
      const a=points[index],b=points[(index+1)%points.length];
      pose.x=a[0]+(b[0]-a[0])*t;pose.y=a[1]+(b[1]-a[1])*t;
    }else if(mood==='calm'){pose.x+=Math.sin(time*.4)*.012;}
    const sleepy=mood==='sleepy',phase=time%(sleepy?7.2:6.1);
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
        shader.fragmentShader='uniform float eyeFloor;\n'+shader.fragmentShader;
      };
      material.customProgramCacheKey=()=> 'study-eye-opening-v1';return material;
    }
    buildEye(face,side){
      const p=face.profile,scale=face.mood==='anxious'&&side>0?.85:face.mood==='resigned'&&side<0?.94:1;
      const eye={w:p.w*scale,h:p.h*scale,u:side*.365,v:.16,open:p.open,upper:2*p.open-1,lower:-1,dx:0,dy:0};
      if(face.mood==='resigned')eye.v+=side*.018;
      if(face.mood==='anxious')eye.v+=side<0?.02:-.02;
      eye.uniform={value:new T.Vector3(eye.w,eye.h,2*eye.open-1)};
      eye.floorUniform={value:-1};
      eye.white=this.add(face,new T.CircleGeometry(1,64),this.studyWhite,eye.u,eye.v,.049);
      eye.outline=this.curve(face,t=>{
        const angle=t*Math.PI*2,x=eye.w*Math.cos(angle),sin=Math.sin(angle);
        return [x,eye.h*Math.abs(sin)*(sin>=0?eye.upper:eye.lower),0];
      },eye.u,eye.v,.004,.067,64);
      eye.lid=this.curve(face,t=>[-eye.w*Math.cos(t*Math.PI),eye.h*eye.upper*Math.sin(t*Math.PI),0],eye.u,eye.v,.006,.069);
      eye.iris=this.add(face,new T.SphereGeometry(1,32,20),this.eyeMaterial(eye,0x5A4030),eye.u,eye.v,.072);
      eye.iris.scale=[p.iris[0]*scale,p.iris[1]*scale,.016];
      eye.glint=this.add(face,new T.SphereGeometry(.019,12,8),this.eyeMaterial(eye,0xFFF5DC),eye.u,eye.v,.094);
      for(const part of [eye.iris,eye.glint]){
        part.mesh.geometry.setAttribute('faceCoordinate',new T.BufferAttribute(new Float32Array(part.mesh.geometry.attributes.position.count*2),2));part.eye=eye;
      }
      if(face.mood==='sad'){
        eye.tear=this.add(face,new T.SphereGeometry(1,24,12),this.studyTear,eye.u,eye.v-eye.h+.022,.09);eye.tear.scale=[.115,.028,.021];
      }
      if(face.mood==='sleepy'){
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
      }
      face.eyes.push(eye);
      const lift=face.mood==='calm'?.46:face.mood==='sleepy'?.37:.46;
      this.curve(face,t=>{
        const x=(t-.5)*.22,arch=Math.sin(t*Math.PI)*.02;
        let y=arch;
        if(face.mood==='sad')y+=-side*x*.55;
        if(face.mood==='anxious')y+=-side*x*.38+(side>0?.015:0);
        if(face.mood==='tired')y+=-side*x*.26-.025;
        if(face.mood==='resigned')y+=-side*x*.40+side*.02;
        if(face.mood==='speechless')y=side>0?arch+.025:0;
        return [x,y,0];
      },eye.u,lift,.006,.035);
    }
    buildFaces(){
      for(const [mood,profile] of Object.entries(profiles)){
        const face={mood,profile,group:new T.Group(),parts:[],eyes:[]};this.studyFaces[mood]=face;this.group.add(face.group);
        this.buildEye(face,-1);this.buildEye(face,1);
        if(mood==='calm'){
          for(const side of [-1,1]){
            const w=.32,h=.265,r=.10,shape=new T.Shape();
            shape.moveTo(-w+r,h);shape.lineTo(w-r,h);shape.quadraticCurveTo(w,h,w,h-r);shape.lineTo(w,-h+r);shape.quadraticCurveTo(w,-h,w-r,-h);shape.lineTo(-w+r,-h);shape.quadraticCurveTo(-w,-h,-w,-h+r);shape.lineTo(-w,h-r);shape.quadraticCurveTo(-w,h,-w+r,h);
            const path=new T.Curve();path.getPoint=t=>{const p=shape.getPoint(t);return new T.Vector3(p.x,p.y,0);};
            this.add(face,new T.TubeGeometry(path,96,.017,8,true),this.studyGlass,side*.37,.115,.13);
            const temple=this.curve(face,t=>[side*t*.095,-t*.018,0],side*.705,.13,.016,.12,12);temple.mesh.material=this.studyGlass;
          }
          const bridge=this.curve(face,t=>[(t-.5)*.13,Math.sin(Math.PI*t)*.022,0],0,.14,.017,.13,20);bridge.mesh.material=this.studyGlass;
        }
        if(mood==='sleepy'){
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
    attachFeatures(){
      super.attachFeatures();if(!this.studyFaces)return;
      const face=this.studyFaces[this.mood],active=!!(face&&!this.image&&!this.facialState.hurt);
      Object.values(this.studyFaces).forEach(f=>f.group.visible=active&&f===face);
      this.studyState={active:!!active,mood:this.mood};if(!active)return;
      this.features.forEach(f=>f.visible=false);
      const pose=acting(this.mood,this.clock,this.clock<this.attentionUntil,this.lookTarget.x/.3,this.lookTarget.y/.15,this.reduced.matches||!!this.body.hold);
      this.studyState.pose=pose;
      for(const eye of face.eyes){
        eye.open=pose.open;
        const closure=1-clamp(eye.open/face.profile.open,0,1);
        // Both lids meet near the eye center instead of rolling the upper lid to the bottom.
        eye.upper=(2*face.profile.open-1)*(1-closure)-.08*closure;
        eye.lower=-(1-closure)-.08*closure;
        eye.uniform.value.set(eye.w,eye.h,eye.upper);eye.floorUniform.value=eye.lower;
        const visible=eye.open/face.profile.open>.035;
        for(const part of [eye.white,eye.outline,eye.iris,eye.glint])part.mesh.visible=visible;
        eye.dx=clamp(pose.x,-eye.w*.68,eye.w*.68);eye.dy=clamp(pose.y,-eye.h*.65,eye.h*.55);
        const a=eye.white.rest;
        a[0]=0;a[1]=eye.h*(eye.upper+eye.lower)/2;a[2]=0;
        for(let i=1;i<a.length/3;i++){
          const angle=(i-1)/64*Math.PI*2,sin=Math.sin(angle);
          a[i*3]=eye.w*Math.cos(angle);a[i*3+1]=eye.h*Math.abs(sin)*(sin>=0?eye.upper:eye.lower);a[i*3+2]=0;
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
