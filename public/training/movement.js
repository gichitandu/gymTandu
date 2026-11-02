import * as T from './vendor/three.module.js';

const V=(x=0,y=0,z=0)=>new T.Vector3(x,y,z);
const Y=V(0,1,0);
const mix=(a,b,t)=>a+(b-a)*t;
const muscleFor={bench:['chest','triceps'],squat:['quads','glutes'],curl:['biceps'],lat:['back','biceps'],shoulder:['shoulders','triceps'],fly:['chest'],lateral:['shoulders']};
const names={bench:'Panca piana',squat:'Squat',curl:'Curl con manubri',lat:'Lat machine',shoulder:'Spinte con manubri',fly:'Croci ai cavi',lateral:'Alzate laterali'};

function elbow(a,b,pole,len1=.335,len2=.315){
 const d=a.distanceTo(b),dir=b.clone().sub(a).normalize();
 const along=Math.min(len1,Math.max(0,(len1*len1-len2*len2+d*d)/(2*Math.max(d,.01))));
 const bend=pole.clone().addScaledVector(dir,-pole.dot(dir)).normalize();
 return a.clone().addScaledVector(dir,along).addScaledVector(bend,Math.sqrt(Math.max(.001,len1*len1-along*along)));
}

// Joint positions are computed for each exercise. The load follows the hands.
function pose(type,s){
 let hip=V(0,1.04,0),spine=V(0,1,0),leftKnee=V(-.17,.55,.025),rightKnee=V(.17,.55,.025),leftFoot=V(-.18,.075,.06),rightFoot=V(.18,.075,.06);
 if(type==='squat'){hip=V(0,1.04-.43*s,-.20*s);spine=V(0,Math.cos(.24*s),Math.sin(.24*s));leftKnee=V(-.22,.55-.11*s,.23*s);rightKnee=V(.22,.55-.11*s,.23*s);leftFoot.x=-.23;rightFoot.x=.23;}
 if(type==='shoulder'||type==='lat'){hip=V(0,.65,0);leftKnee=V(-.18,.46,.35);rightKnee=V(.18,.46,.35);leftFoot=V(-.20,.075,.40);rightFoot=V(.20,.075,.40);}
 if(type==='fly'){leftFoot.z=.22;rightFoot.z=-.10;leftKnee.z=.15;rightKnee.z=-.03;}
 if(type==='bench'){hip=V(0,.585,.34);spine=V(0,.045,-1).normalize();leftKnee=V(-.20,.43,.72);rightKnee=V(.20,.43,.72);leftFoot=V(-.23,.075,.84);rightFoot=V(.23,.075,.84);}
 const shoulderCenter=hip.clone().addScaledVector(spine,.61), shoulders=[shoulderCenter.clone().add(V(-.29,0,0)),shoulderCenter.clone().add(V(.29,0,0))];
 const hands=[],elbows=[];
 for(let i=0;i<2;i++){
  const sign=i===0?-1:1,a=shoulders[i];let h,e;
  if(type==='curl'){
   e=a.clone().add(V(sign*.025,-.33,.015));const angle=mix(.08,2.08,s);
   h=e.clone().add(V(0,-Math.cos(angle)*.31,Math.sin(angle)*.31));
  }else if(type==='lateral'){
   const angle=mix(.05,1.40,s);e=a.clone().add(V(sign*Math.sin(angle)*.33,-Math.cos(angle)*.33,.025));h=e.clone().add(V(sign*Math.sin(angle)*.30,-Math.cos(angle)*.30,.065));
  }else if(type==='shoulder'){
   e=V(sign*mix(.49,.315,s),mix(.99,1.58,s),.035);h=e.clone().add(V(0,.31,.045));
  }else if(type==='bench'){
   h=V(sign*.40,mix(1.235,.86,s),-.25);e=elbow(a,h,V(sign,-.5,.1));
  }else if(type==='squat'){
   h=shoulderCenter.clone().add(V(sign*.40,.035,-.095));e=elbow(a,h,V(sign,-1,-.3));
  }else if(type==='lat'){
   h=V(sign*mix(.49,.40,s),mix(1.86,1.23,s),mix(.10,.22,s));e=elbow(a,h,V(sign,-.2,0));
  }else{
   h=V(sign*mix(.82,.07,s),1.43,mix(.11,.60,s));e=elbow(a,h,V(sign,-.15,-.3));
  }
  hands.push(h);elbows.push(e);
 }
 return {hip,spine,shoulders,hands,elbows,knees:[leftKnee,rightKnee],feet:[leftFoot,rightFoot]};
}

function buildScene(host,type){
 const scene=new T.Scene();scene.background=new T.Color(0x060b18);
 const renderer=new T.WebGLRenderer({antialias:true,alpha:false,powerPreference:'low-power'});
 renderer.setPixelRatio(Math.min(devicePixelRatio||1,1.8));renderer.outputColorSpace=T.SRGBColorSpace;
 renderer.toneMapping=T.ACESFilmicToneMapping;renderer.toneMappingExposure=1.12;
 renderer.shadowMap.enabled=true;renderer.shadowMap.type=T.PCFSoftShadowMap;
 renderer.domElement.setAttribute('aria-label','Dimostrazione animata: '+names[type]);
 renderer.domElement.setAttribute('role','img');host.append(renderer.domElement);
 const camera=new T.PerspectiveCamera(31,1,.1,30);
 let yaw=type==='bench'?.9:.46;
 const target=type==='bench'?V(0,.68,.1):V(0,type==='shoulder'||type==='lat'?.95:1.04,0);
 const distance=type==='bench'?3.5:4.0;
 function updateCamera(){camera.position.set(Math.sin(yaw)*distance,target.y+(type==='bench'?1.20:.33),Math.cos(yaw)*distance);camera.lookAt(target);}
 updateCamera();
 scene.add(new T.HemisphereLight(0xdbe9ff,0x17122e,1.65));
 const key=new T.DirectionalLight(0xf5efff,3.1);key.position.set(2,4,4);key.castShadow=true;key.shadow.mapSize.set(512,512);scene.add(key);
 const cyan=new T.PointLight(0x20cfff,13,7);cyan.position.set(-2,2,1);scene.add(cyan);
 const violet=new T.PointLight(0xae48ff,17,7);violet.position.set(2,2.7,-2);scene.add(violet);
 const base=new T.MeshStandardMaterial({color:0x9daabc,roughness:.37,metalness:.48});
 const dark=new T.MeshStandardMaterial({color:0x1a2639,roughness:.55,metalness:.25});
 const chrome=new T.MeshStandardMaterial({color:0xa4b1c4,roughness:.21,metalness:.88});
 const purple=new T.MeshStandardMaterial({color:0x9f4be9,emissive:0x510c8e,emissiveIntensity:.43,roughness:.33,metalness:.35});
 const active=new Set(muscleFor[type]);
 const gm=new T.SphereGeometry(1,24,18);
 const cyl=new T.CylinderGeometry(1,1,1,24);
 const box=new T.BoxGeometry(1,1,1);
 const actor=new T.Group();scene.add(actor);
 const torso=new T.Group();actor.add(torso);
 const meshes=[];
 function mesh(parent,geometry,material,scale,pos){const m=new T.Mesh(geometry,material);m.scale.set(...scale);m.position.set(...pos);m.castShadow=true;m.receiveShadow=true;parent.add(m);meshes.push(m);return m;}
 function ell(parent,scale,pos,material=base){return mesh(parent,gm,material,scale,pos);}
 function mat(group){return active.has(group)?purple:base;}
 const profile=[[.12,0],[.175,.075],[.145,.18],[.16,.30],[.215,.43],[.225,.53],[.20,.60],[.13,.66]].map(([r,y])=>new T.Vector2(r,y));
 const torsoGeo=new T.LatheGeometry(profile,40);const core=mesh(torso,torsoGeo,base,[1.3,1,.72],[0,0,0]);
 ell(torso,[.18,.125,.125],[0,.025,0],dark);
 for(const sign of [-1,1]){
  const pec=ell(torso,[.145,.102,.065],[sign*.143,.505,.142],mat('chest'));pec.rotation.z=sign*.08;
  const lat=ell(torso,[.105,.19,.05],[sign*.17,.43,-.12],mat('back'));lat.rotation.z=sign*-.22;
  ell(torso,[.09,.105,.04],[sign*.09,.605,-.10],mat('back'));
  for(let n=0;n<3;n++)ell(torso,[.059,.038,.028],[sign*.063,.22+n*.075,.118],base);
  const ob=ell(torso,[.046,.135,.035],[sign*.148,.29,.075],base);ob.rotation.z=sign*-.19;
 }
 ell(torso,[.07,.07,.065],[0,.70,0]);
 ell(torso,[.104,.137,.104],[0,.86,.005]);
 ell(torso,[.079,.065,.058],[0,.815,.048]);
 ell(torso,[.016,.027,.024],[0,.849,.108]);
 for(const sign of [-1,1]){ell(torso,[.019,.034,.016],[sign*.104,.856,.003]);ell(torso,[.030,.008,.007],[sign*.039,.883,.101],dark);}
 const arms=[],legs=[];
 function segment(material,r){return ell(actor,[r,.2,r*.86],[0,0,0],material);}
 for(let i=0;i<2;i++){
  const shoulder=ell(actor,[.109,.115,.107],[0,0,0],mat('shoulders'));
  const upper=segment(mat(type==='bench'||type==='shoulder'?'triceps':'biceps'),.087);
  const elbowJoint=ell(actor,[.064,.068,.061],[0,0,0]);
  const fore=segment(base,.066);const hand=ell(actor,[.057,.080,.040],[0,0,0]);
  arms.push({shoulder,upper,elbowJoint,fore,hand});
  legs.push({thigh:segment(mat('quads'),.114),knee:ell(actor,[.075,.073,.071],[0,0,0]),calf:segment(base,.078),shoe:ell(actor,[.085,.06,.15],[0,0,0],dark)});
 }
 function positionSegment(m,a,b,r){m.position.copy(a).add(b).multiplyScalar(.5);m.quaternion.setFromUnitVectors(Y,b.clone().sub(a).normalize());m.scale.set(r,a.distanceTo(b)*.59,r*.86);}
 const equipment=new T.Group();scene.add(equipment);
 function cube(scale,pos,material=dark){return mesh(equipment,box,material,scale,pos);}
 function rod(a,b,r=.025,material=chrome){const m=mesh(equipment,cyl,material,[r,1,r],[0,0,0]);m.position.copy(a).add(b).multiplyScalar(.5);m.quaternion.setFromUnitVectors(Y,b.clone().sub(a).normalize());m.scale.y=a.distanceTo(b);return m;}
 if(type==='bench'){
  cube([.43,.105,1.27],[0,.49,.10]);cube([.07,.44,.06],[0,.22,-.36],chrome);cube([.07,.44,.06],[0,.22,.52],chrome);cube([.65,.045,.10],[0,.025,-.36]);cube([.65,.045,.10],[0,.025,.52]);
 }else if(type==='shoulder'||type==='lat'){
  cube([.40,.095,.45],[0,.545,.05]);cube([.35,.37,.07],[0,.795,-.17]);cube([.08,.50,.08],[0,.27,.02],chrome);cube([.65,.04,.42],[0,.025,.02]);
 }
 if(type==='lat'){
  rod(V(-.65,0,-.32),V(-.65,2.12,-.32),.035,dark);rod(V(.65,0,-.32),V(.65,2.12,-.32),.035,dark);rod(V(-.65,2.12,-.32),V(.65,2.12,-.32),.035,chrome);
 }
 if(type==='fly')for(const sign of [-1,1]){rod(V(sign*1.0,0,-.20),V(sign*1.0,1.9,-.20),.035,dark);cube([.30,.04,.30],[sign*1,0,-.20]);}
 function weightSet(){const g=new T.Group();equipment.add(g);mesh(g,cyl,chrome,[.018,.25,.018],[0,0,0]).rotation.z=Math.PI/2;for(const sign of [-1,1]){const d=mesh(g,cyl,dark,[.073,.05,.073],[sign*.105,0,0]);d.rotation.z=Math.PI/2;const cap=mesh(g,cyl,chrome,[.027,.055,.027],[sign*.108,0,0]);cap.rotation.z=Math.PI/2;}return g;}
 const dumbbells=['curl','lateral','shoulder'].includes(type)?[weightSet(),weightSet()]:[];
 let bar=null;
 if(['bench','squat','lat'].includes(type)){
  bar=new T.Group();equipment.add(bar);const shaft=mesh(bar,cyl,chrome,[.018,type==='lat'?1.10:1.75,.018],[0,0,0]);shaft.rotation.z=Math.PI/2;
  if(type!=='lat')for(const sign of [-1,1])for(let n=0;n<2;n++){const plate=mesh(bar,cyl,dark,[.185,.045,.185],[sign*(.64+n*.055),0,0]);plate.rotation.z=Math.PI/2;const rim=mesh(bar,new T.TorusGeometry(.179,.006,8,36),chrome,[1,1,1],[sign*(.64+n*.055),0,0]);rim.rotation.y=Math.PI/2;}
 }
 const cableMat=new T.LineBasicMaterial({color:0x8999bc});
 const cables=[];
 if(type==='fly')for(let i=0;i<2;i++){const geometry=new T.BufferGeometry().setFromPoints([V(),V()]);const line=new T.Line(geometry,cableMat);equipment.add(line);cables.push(line);}
 let latCable=null;
 if(type==='lat'){latCable=new T.Line(new T.BufferGeometry().setFromPoints([V(),V()]),cableMat);equipment.add(latCable);}
 const floor=new T.Mesh(new T.CircleGeometry(1.5,64),new T.MeshStandardMaterial({color:0x080e1d,roughness:.9,metalness:.1}));floor.rotation.x=-Math.PI/2;floor.receiveShadow=true;scene.add(floor);
 const circle=new T.Mesh(new T.RingGeometry(1.05,1.059,80),new T.MeshBasicMaterial({color:0x8e3fdf,transparent:true,opacity:.55,side:T.DoubleSide}));circle.rotation.x=-Math.PI/2;circle.position.y=.003;scene.add(circle);
 function draw(s){
  const p=pose(type,s);torso.position.copy(p.hip);torso.quaternion.setFromUnitVectors(Y,p.spine);
  for(let i=0;i<2;i++){
   const a=arms[i],l=legs[i],sign=i===0?-1:1;
   a.shoulder.position.copy(p.shoulders[i]);a.elbowJoint.position.copy(p.elbows[i]);
   positionSegment(a.upper,p.shoulders[i],p.elbows[i],.086);positionSegment(a.fore,p.elbows[i],p.hands[i],.065);
   a.hand.position.copy(p.hands[i]);a.hand.quaternion.copy(a.fore.quaternion);
   const hipJoint=p.hip.clone().add(V(sign*.13,0,0));positionSegment(l.thigh,hipJoint,p.knees[i],.112);l.knee.position.copy(p.knees[i]);positionSegment(l.calf,p.knees[i],p.feet[i],.075);l.shoe.position.copy(p.feet[i]).add(V(0,-.018,.065));
   if(dumbbells[i])dumbbells[i].position.copy(p.hands[i]);
   if(cables[i]){const arr=cables[i].geometry.attributes.position;arr.setXYZ(0,sign*1.0,1.67,-.20);arr.setXYZ(1,...p.hands[i].toArray());arr.needsUpdate=true;}
  }
  if(bar)bar.position.copy(p.hands[0]).add(p.hands[1]).multiplyScalar(.5);
  if(latCable){const attr=latCable.geometry.attributes.position;attr.setXYZ(0,0,2.12,-.32);attr.setXYZ(1,bar.position.x,bar.position.y,bar.position.z);attr.needsUpdate=true;}
  renderer.render(scene,camera);
 }
 function resize(){const w=host.clientWidth,h=host.clientHeight;renderer.setSize(w,h,false);camera.aspect=w/Math.max(h,1);camera.updateProjectionMatrix();}
 const observer=new ResizeObserver(resize);observer.observe(host);resize();
 let pointer=null;
 const down=e=>{pointer={x:e.clientX,yaw};};const move=e=>{if(!pointer)return;const dx=e.clientX-pointer.x;if(Math.abs(dx)>3){yaw=pointer.yaw+dx*.009;updateCamera();}};const up=()=>{pointer=null;};
 renderer.domElement.addEventListener('pointerdown',down);window.addEventListener('pointermove',move);window.addEventListener('pointerup',up);window.addEventListener('pointercancel',up);
 return {draw,reset(){yaw=type==='bench'?.9:.46;updateCamera();},dispose(){observer.disconnect();window.removeEventListener('pointermove',move);window.removeEventListener('pointerup',up);window.removeEventListener('pointercancel',up);const geometries=new Set(),materials=new Set();scene.traverse(o=>{if(o.geometry)geometries.add(o.geometry);if(o.material)materials.add(o.material);});geometries.forEach(g=>g.dispose());materials.forEach(m=>m.dispose());renderer.dispose();renderer.forceContextLoss();renderer.domElement.remove();}};
}

function buildFallback(host,type){
 const canvas=document.createElement('canvas');canvas.width=640;canvas.height=420;canvas.setAttribute('aria-label','Sequenza animata: '+names[type]);host.append(canvas);const c=canvas.getContext('2d');
 const project=p=>({x:320+(p.x-p.z*.32)*180,y:395-p.y*176-p.z*18});
 const stroke=(a,b,w,color)=>{const p=project(a),q=project(b),g=c.createLinearGradient(p.x-w,p.y,p.x+w,p.y);g.addColorStop(0,'#344c66');g.addColorStop(.5,color);g.addColorStop(1,'#24384f');c.beginPath();c.moveTo(p.x,p.y);c.lineTo(q.x,q.y);c.lineWidth=w;c.lineCap='round';c.strokeStyle=g;c.stroke();};
 return {draw(s){c.fillStyle='#060b18';c.fillRect(0,0,640,420);const p=pose(type,s);const sc=p.shoulders[0].clone().add(p.shoulders[1]).multiplyScalar(.5);stroke(p.hip,sc,67,'#9b91c8');for(let i=0;i<2;i++){stroke(p.hip.clone().add(V(i?.13:-.13,0,0)),p.knees[i],31,'#8294ae');stroke(p.knees[i],p.feet[i],22,'#a0adbb');stroke(p.shoulders[i],p.elbows[i],23,'#bc7cf2');stroke(p.elbows[i],p.hands[i],18,'#aabacb');}const h=project(p.hip.clone().addScaledVector(p.spine,.86));c.beginPath();c.ellipse(h.x,h.y,19,25,0,0,Math.PI*2);c.fillStyle='#b3c2d1';c.fill();if(['bench','squat','lat'].includes(type))stroke(p.hands[0].clone().add(V(-.25,0,0)),p.hands[1].clone().add(V(.25,0,0)),9,'#b0bad1');},reset(){},dispose(){canvas.remove();}};
}

export function mountMovement(stage,exercise='bench'){
 const host=stage.querySelector('.movement-canvas');if(!host)return()=>{};
 const type=names[exercise]?exercise:'bench';let engine;
 try{engine=buildScene(host,type);stage.dataset.renderer='webgl';}catch(error){host.replaceChildren();engine=buildFallback(host,type);stage.dataset.renderer='canvas';}
 stage.classList.add('motion-ready');
 let cycle=0,speed=.75,playing=stage.dataset.autoplay==='true'&&!matchMedia('(prefers-reduced-motion: reduce)').matches,last=performance.now(),raf=0,disposed=false;
 stage.dataset.view=stage.dataset.autoplay==='true'?'motion':'illustration';
 const play=stage.querySelector('[data-motion-play]'),scrub=stage.querySelector('[data-motion-scrub]'),label=stage.querySelector('[data-motion-label]');
 const updateButton=()=>{if(play){play.textContent=playing?'Ⅱ Pausa':'▶ Riproduci';play.setAttribute('aria-pressed',String(playing));}};updateButton();
 const phaseLabels={bench:['Discesa controllata','Spinta controllata'],squat:['Discesa controllata','Risalita controllata'],curl:['Salita controllata','Ritorno controllato'],lat:['Trazione controllata','Ritorno controllato'],shoulder:['Spinta controllata','Discesa controllata'],fly:['Chiusura controllata','Apertura controllata'],lateral:['Salita controllata','Discesa controllata']};
 function frame(now){if(disposed)return;const dt=Math.min((now-last)/1000,.06);last=now;if(playing&&document.visibilityState==='visible')cycle=(cycle+dt*speed/4.8)%1;const value=(1-Math.cos(cycle*Math.PI*2))/2;engine.draw(value);if(scrub&&document.activeElement!==scrub)scrub.value=String(Math.round(cycle*100));if(label)label.textContent=stage.dataset.view==='illustration'?'Illustrazione anatomica':phaseLabels[type][cycle<.5?0:1];raf=requestAnimationFrame(frame);}
 const setView=view=>{stage.dataset.view=view;stage.querySelectorAll('[data-motion-view]').forEach(x=>x.classList.toggle('selected',x.dataset.motionView===view));};
 const click=e=>{const view=e.target.closest('[data-motion-view]');if(view){setView(view.dataset.motionView);playing=view.dataset.motionView==='motion';updateButton();}const p=e.target.closest('[data-motion-play]');if(p){if(stage.dataset.view!=='motion'){setView('motion');playing=true;}else playing=!playing;updateButton();}const sp=e.target.closest('[data-motion-speed]');if(sp){speed=speed===.75?.4:speed===.4?1:.75;sp.textContent=speed===.4?'0,5×':speed===1?'1,25×':'1×';}const ph=e.target.closest('[data-motion-phase]');if(ph){setView('motion');cycle=Number(ph.dataset.motionPhase);if(scrub)scrub.value=String(Math.round(cycle*100));playing=false;updateButton();}if(e.target.closest('[data-motion-reset]'))engine.reset();};
 const input=e=>{if(e.target===scrub){setView('motion');cycle=Number(scrub.value)/100;playing=false;updateButton();}};
 stage.addEventListener('click',click);stage.addEventListener('input',input);raf=requestAnimationFrame(frame);
 return()=>{disposed=true;cancelAnimationFrame(raf);stage.removeEventListener('click',click);stage.removeEventListener('input',input);engine.dispose();};
}
