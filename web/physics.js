(function (root) {
  'use strict';
  const FLOOR = -.78;
  const clamp = (x, low, high) => Math.max(low, Math.min(high, x));

  class Slime {
    constructor(x = 0, y = 0, r = 100) {
      this.x = x; this.y = y; this.r = r;
      this.hold = null;
      this.values = [0, 0, 0];
      this.velocity = [0, 0, 0];
      this.targetPress = 0;
      this.prepare();
    }
    grab(x, y) {
      this.hold = {sx:x, sy:y, x, y, moved:false};
      this.targetPress = 0;
    }
    move(x, y) {
      if (!this.hold || !Number.isFinite(x) || !Number.isFinite(y)) return;
      this.hold.x = x; this.hold.y = y;
      if (Math.hypot(x-this.hold.sx, y-this.hold.sy) > 5) this.hold.moved = true;
    }
    release() { const p = this.press; this.hold = null; this.targetPress = 0; return p; }
    step(dt) {
      if (!Number.isFinite(dt) || dt <= 0) return;
      dt = Math.min(dt, 1/120);
      const target = [0, 0, 0];
      if (this.hold) {
        if (this.hold.moved) {
          let dx = (this.hold.x-this.hold.sx)/this.r;
          let dy = -(this.hold.y-this.hold.sy)/this.r;
          const factor = Math.min(1, 1.15/(Math.hypot(dx,dy)||1));
          target[1] = dx*factor; target[2] = dy*factor;
        } else {
          this.targetPress = Math.min(1, this.targetPress+dt*1.6);
          target[0] = this.targetPress;
        }
      }
      for (let i=0; i<3; i++) {
        this.velocity[i] += ((target[i]-this.values[i])*100-this.velocity[i]*11)*dt;
        this.values[i] += this.velocity[i]*dt;
      }
      this.prepare();
    }
    prepare() {
      this.squash = clamp(this.values[0], -.12, 1.02);
      this.sy = 1-this.squash*.63;
      this.sx = 1/Math.sqrt(this.sy);
      const length = Math.hypot(this.values[1],this.values[2]);
      this.pull = Math.min(length,1.35);
      this.ax = length ? this.values[1]/length : 1;
      this.ay = length ? this.values[2]/length : 0;
      this.expansion = 1+this.pull*.62;
      this.contraction = 1/Math.sqrt(this.expansion);
    }
    // Every stretch is monotonic along its axis, with positive transverse scales.
    // The mesh stays closed: there is no independently dragged boundary to fold over.
    deform(x, y, z, out = {}) {
      const fullness = 1+.055*(1-y);
      x *= fullness;
      z *= fullness;
      y = (y < -.72 ? -.72+(y+.72)*.32 : y)*.95;
      x *= this.sx; z *= this.sx;
      y = FLOOR+(y-FLOOR)*this.sy;
      const centerY = FLOOR+(.03-FLOOR)*this.sy;
      const projection = x*this.ax+(y-centerY)*this.ay;
      const extension = projection*(this.expansion-this.contraction)
        +Math.tanh(projection*1.4)*this.pull*.13+this.pull*.06;
      out.x = x*this.contraction+this.ax*extension;
      out.y = centerY+(y-centerY)*this.contraction+this.ay*extension;
      out.z = z*this.contraction;
      return out;
    }
    resize(x, y, r) { this.release(); this.x=x; this.y=y; this.r=Math.max(1,r); }
    get press() { return Math.max(0,this.squash); }
    get deformation() { return this.r*Math.max(Math.abs(this.squash)*.63,this.pull*.7); }
    get speed() { return Math.max(...this.velocity.map(Math.abs))*this.r; }
    get settled() { return this.deformation<.08&&this.speed<.15&&!this.hold; }
  }
  class Rolling {
    constructor(){this.angle=0;this.target=0;this.velocity=0;this.idle=1;}
    move(dx,dy,radius){
      if(![dx,dy,radius].every(Number.isFinite)||radius<=0)return;
      const distance=Math.hypot(dx,dy);if(distance<.1||distance>radius*4)return;
      this.target-=clamp((dx+dy*.7)/radius,-1.2,1.2);this.idle=0;
      const turns=Math.round(this.target/(Math.PI*2));this.target-=turns*Math.PI*2;this.angle-=turns*Math.PI*2;
    }
    step(dt){
      if(!Number.isFinite(dt)||dt<=0)return;dt=Math.min(dt,1/120);this.idle+=dt;
      if(this.idle>.16){if(this.target!==0)this.angle=Math.atan2(Math.sin(this.angle),Math.cos(this.angle));this.target=0;}
      this.velocity+=((this.target-this.angle)*100-this.velocity*10)*dt;this.angle+=this.velocity*dt;
      if(!this.moving){this.angle=0;this.target=0;this.velocity=0;}
    }
    reset(){this.angle=0;this.target=0;this.velocity=0;this.idle=1;}
    get moving(){return Math.abs(this.angle)>.002||Math.abs(this.target)>.002||Math.abs(this.velocity)>.02;}
  }
  function faceMotion(mood,time,pointerX=0,pointerY=0,attending=false,reduced=false) {
    const t=Number.isFinite(time)?Math.max(0,time):0;
    const px=Number.isFinite(pointerX)?clamp(pointerX,-1,1):0,py=Number.isFinite(pointerY)?clamp(pointerY,-1,1):0;
    if(reduced)return {x:0,y:0,lid:1,brow:0,mouth:1};
    let x=attending?px*.72:Math.sin(t*.55)*.12,y=attending?py*.6:Math.sin(t*.37)*.08,brow=0,mouth=1,lid=1;
    if(mood==='anxious'){
      x=attending?px*.72+Math.sin(t*3.2)*.15:Math.sin(t*2.1)*.78;
      y=attending?py*.65+Math.cos(t*2.7)*.1:Math.cos(t*1.7)*.65;
      brow=Math.sin(t*4.1)*.3;mouth=1+Math.sin(t*3.3)*.1;
    } else if(mood==='happy'){brow=Math.sin(t*5)*.24;mouth=1+Math.sin(t*5)*.06;}
    else if(mood==='sad'){y-=.3;brow=Math.sin(t*.8)*.14;mouth=1+Math.sin(t*1.2)*.04;}
    else if(mood==='tired'){y-=.22;lid=.9+Math.sin(t*.9)*.09;brow=-.12;}
    else if(mood==='resigned'){if(!attending){x=Math.sin(t*.65)*.52;y=.35+Math.sin(t*.7)*.1;}mouth=1+Math.sin(t*1.4)*.18;brow=Math.sin(t*.7)*.16;}
    else if(mood==='overwhelmed'){x*=.25;y*=.25;brow=Math.sin(t*3)*.18;mouth=1+Math.sin(t)*.08;}
    const phase=t%(mood==='tired'?7.4:5.7),center=mood==='tired'?.42:.18,width=mood==='tired'?.18:.065;
    lid*=1-.92*Math.exp(-Math.pow((phase-center)/width,2));
    return {x:clamp(x,-1,1),y:clamp(y,-1,1),lid:clamp(lid,.06,1.1),brow,mouth};
  }
  const api = {Slime, Rolling, FLOOR, faceMotion};
  if (typeof module!=='undefined'&&module.exports) module.exports=api;
  else root.SlimePhysics=api;
})(typeof window==='undefined'?globalThis:window);
