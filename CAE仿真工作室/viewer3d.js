import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { STLLoader } from 'three/addons/loaders/STLLoader.js';
import { OBJLoader } from 'three/addons/loaders/OBJLoader.js';

/** Display only an actual supplied model: GLB, (self-contained) GLTF, STL or OBJ. */
export async function mount(host, url, filename='model.glb') {
  host.replaceChildren();
  const scene=new THREE.Scene();
  scene.background=new THREE.Color('#0d181d');
  const width=Math.max(300,host.clientWidth||800);
  const height=Math.max(280,host.clientHeight||500);
  const camera=new THREE.PerspectiveCamera(42,width/height,0.01,1000000);
  const renderer=new THREE.WebGLRenderer({antialias:true,alpha:false,powerPreference:'high-performance'});
  renderer.setSize(width,height);renderer.setPixelRatio(Math.min(window.devicePixelRatio||1,2));
  renderer.outputColorSpace=THREE.SRGBColorSpace;renderer.toneMapping=THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure=1.5;renderer.domElement.style.width='100%';renderer.domElement.style.height='100%';
  renderer.domElement.style.display='block';host.append(renderer.domElement);
  const controls=new OrbitControls(camera,renderer.domElement);
  controls.enableDamping=true;controls.dampingFactor=.08;controls.screenSpacePanning=true;
  scene.add(new THREE.HemisphereLight(0xf5f9ff,0x607277,2.5));
  const topLight=new THREE.DirectionalLight(0xffffff,2.5);topLight.position.set(7,12,14);scene.add(topLight);
  const rearLight=new THREE.DirectionalLight(0xabc9d7,1.3);rearLight.position.set(-11,2,-5);scene.add(rearLight);
  const ext=(filename.split('.').pop()||'').toLowerCase();
  let object;
  const loadPromise=(loader)=>new Promise((resolve,reject)=>loader.load(url,resolve,undefined,reject));
  try {
    if(ext==='glb'||ext==='gltf'){
      const gltf=await loadPromise(new GLTFLoader());object=gltf.scene;
    }else if(ext==='stl'){
      const geometry=await loadPromise(new STLLoader());
      if(!geometry.attributes.normal)geometry.computeVertexNormals();
      object=new THREE.Mesh(geometry,new THREE.MeshStandardMaterial({color:0xa6b9b8,metalness:.13,roughness:.65,side:THREE.DoubleSide}));
    }else if(ext==='obj'){
      object=await loadPromise(new OBJLoader());
      object.traverse(node=>{if(node.isMesh){node.material=new THREE.MeshStandardMaterial({color:0xaebdbb,roughness:.68,metalness:.1,side:THREE.DoubleSide});if(node.geometry&&!node.geometry.attributes.normal)node.geometry.computeVertexNormals()}});
    }else throw new Error('格式不支持：请导出 STL、OBJ 或 GLB');
  } catch(error){controls.dispose();renderer.dispose();renderer.domElement.remove();throw Error(error.message||'无法解析三维模型');}
  if(!object)throw Error('模型为空');
  scene.add(object);
  const bounds=new THREE.Box3().setFromObject(object);
  if(bounds.isEmpty())throw Error('模型没有可显示的几何体');
  const center=bounds.getCenter(new THREE.Vector3()),size=bounds.getSize(new THREE.Vector3()),radius=Math.max(size.x,size.y,size.z,0.01);
  camera.position.copy(center.clone().add(new THREE.Vector3(radius*1.2,radius*.85,radius*1.5)));
  camera.near=Math.max(radius/10000,.0001);camera.far=Math.max(radius*1000,100);camera.updateProjectionMatrix();
  controls.target.copy(center);controls.update();
  const label=document.createElement('span');label.className='viewer-overlay';label.textContent='3D MODEL · LEFT DRAG ROTATE · WHEEL ZOOM';label.style.top='auto';label.style.bottom='14px';label.style.left='14px';host.append(label);
  let running=true,handle=0;
  function paint(){if(!running)return;handle=requestAnimationFrame(paint);controls.update();renderer.render(scene,camera)}
  function resize(){if(!running)return;const w=Math.max(300,host.clientWidth||800),h=Math.max(280,host.clientHeight||500);camera.aspect=w/h;camera.updateProjectionMatrix();renderer.setSize(w,h);}
  const observer=typeof ResizeObserver!=='undefined'?new ResizeObserver(resize):null;
  if(observer)observer.observe(host);else window.addEventListener('resize',resize);
  paint();
  return ()=>{running=false;cancelAnimationFrame(handle);observer?.disconnect();window.removeEventListener('resize',resize);controls.dispose();object?.traverse(node=>{if(node.geometry)node.geometry.dispose();if(node.material){const mats=Array.isArray(node.material)?node.material:[node.material];mats.forEach(m=>m.dispose())}});renderer.dispose();renderer.domElement.remove();label.remove();};
}

// Unified post-processor: Abaqus / Ansys exported nodal surface fields.
// The renderer never synthesizes stress or displacement values.
export async function mountField(host, result) {
  if(result?.format!=='cae-field-v1')throw Error('文件格式不正确：需要 cae-field-v1');
  const nodes=result.nodes,faces=result.triangles,frames=result.frames;
  if(!Array.isArray(nodes)||nodes.length<3||!Array.isArray(faces)||!faces.length||!Array.isArray(frames)||!frames.length)throw Error('缺少节点、表面三角形或结果帧');
  if(nodes.length>350000||faces.length>750000||frames.length>150)throw Error('网页预览数据过大。请导出表面子模型或减少时间帧');
  if(!nodes.every(p=>Array.isArray(p)&&p.length>=3&&p.slice(0,3).every(Number.isFinite)))throw Error('节点坐标存在无效值');
  const indices=new Uint32Array(faces.length*3);
  faces.forEach((face,i)=>{if(!Array.isArray(face)||face.length!==3)throw Error('仅接受三角形表面网格');for(let j=0;j<3;j++){const v=face[j];if(!Number.isInteger(v)||v<0||v>=nodes.length)throw Error('三角形包含无效节点索引');indices[i*3+j]=v;}});
  frames.forEach((f,i)=>{if(!Array.isArray(f.displacement)||f.displacement.length!==nodes.length||!f.displacement.every(a=>Array.isArray(a)&&a.length>=3&&a.slice(0,3).every(Number.isFinite)))throw Error('帧 '+(i+1)+' 的位移场与节点不匹配')});
  const fieldNames=[...new Set(frames.flatMap(f=>Object.keys(f.scalars||{})))];
  for(const f of frames)for(const [k,values] of Object.entries(f.scalars||{})){if(!Array.isArray(values)||values.length!==nodes.length)throw Error('场变量 '+k+' 与节点数量不匹配');}
  const cleaned=nodes.map(p=>new THREE.Vector3(p[0],p[1],p[2]));
  const bounding=new THREE.Box3().setFromPoints(cleaned),center=bounding.getCenter(new THREE.Vector3());
  const radius=Math.max(bounding.getSize(new THREE.Vector3()).length(),1e-9);
  host.replaceChildren();host.style.position='relative';host.style.background='#0e191e';
  const ui=document.createElement('div');ui.className='field-controls';
  const bar=document.createElement('div');bar.className='field-bar';ui.append(bar);
  const selectField=document.createElement('select');selectField.setAttribute('aria-label','选择结果云图变量');
  ['U, Magnitude',...fieldNames].forEach(v=>{const o=document.createElement('option');o.value=v;o.textContent=v;selectField.append(o)});
  if(fieldNames.includes('S, Mises'))selectField.value='S, Mises';
  const stepSlider=document.createElement('input');stepSlider.type='range';stepSlider.min=0;stepSlider.max=frames.length-1;stepSlider.step=1;stepSlider.value=0;stepSlider.setAttribute('aria-label','选择时间帧');
  const factor=document.createElement('input');factor.type='range';factor.min=0;factor.max=50;factor.step=.25;factor.value=1;factor.setAttribute('aria-label','变形放大倍数');
  const factorValue=document.createElement('strong');factorValue.textContent='1×';
  const play=document.createElement('button');play.type='button';play.textContent='▶ 播放';
  const wire=document.createElement('label');const wireInput=document.createElement('input');wireInput.type='checkbox';wireInput.checked=false;wire.append(wireInput,document.createTextNode(' 网格'));
  const original=document.createElement('label');const originalInput=document.createElement('input');originalInput.type='checkbox';originalInput.checked=false;original.append(originalInput,document.createTextNode(' 原形'));
  const stepLabel=document.createElement('span');stepLabel.className='field-step';
  for(const [label,control] of [['云图 ',selectField],['帧 ',stepSlider],['变形 ',factor]]){const el=document.createElement('label');el.className='field-option';el.append(document.createTextNode(label),control);bar.append(el);if(control===factor)el.append(factorValue);}
  bar.append(play,wire,original,stepLabel);
  const canvas=document.createElement('div');canvas.className='field-canvas';host.append(ui,canvas);
  const legend=document.createElement('div');legend.className='field-legend';legend.innerHTML='<div class="legend-caption">FIELD RANGE</div><div class="legend-high"></div><div class="legend-gradient"></div><div class="legend-low"></div>';canvas.append(legend);
  const inspector=document.createElement('div');inspector.className='field-inspector';inspector.textContent='单击网格读取数值 / 拖动旋转 / 滚轮缩放';canvas.append(inspector);
  const scene=new THREE.Scene();scene.background=new THREE.Color('#10191f');
  const camera=new THREE.PerspectiveCamera(42,1,Math.max(radius/5000,.000001),Math.max(radius*500,10));camera.position.copy(center.clone().add(new THREE.Vector3(radius*.95,radius*.55,radius)));
  const renderer=new THREE.WebGLRenderer({antialias:true});renderer.setPixelRatio(Math.min(window.devicePixelRatio||1,2));renderer.outputColorSpace=THREE.SRGBColorSpace;renderer.toneMapping=THREE.ACESFilmicToneMapping;renderer.toneMappingExposure=1.0;canvas.prepend(renderer.domElement);
  const controls=new OrbitControls(camera,renderer.domElement);controls.enableDamping=true;controls.target.copy(center);controls.update();
  scene.add(new THREE.HemisphereLight(0xffffff,0x66747a,2));
  const dl=new THREE.DirectionalLight(0xffffff,1.35);dl.position.set(8,13,10);scene.add(dl);
  const nTri=indices.length;const geometry=new THREE.BufferGeometry();
  const positions=new Float32Array(nTri*3),colors=new Float32Array(nTri*3);
  geometry.setAttribute('position',new THREE.BufferAttribute(positions,3).setUsage(THREE.DynamicDrawUsage));
  geometry.setAttribute('color',new THREE.BufferAttribute(colors,3).setUsage(THREE.DynamicDrawUsage));
  const material=new THREE.MeshLambertMaterial({vertexColors:true,side:THREE.DoubleSide,flatShading:false});
  const mesh=new THREE.Mesh(geometry,material);scene.add(mesh);
  const wireMesh=new THREE.LineSegments(new THREE.EdgesGeometry(geometry),new THREE.LineBasicMaterial({color:0x4a5457,transparent:true,opacity:.5}));wireMesh.visible=false;scene.add(wireMesh);
  const reference=new THREE.Mesh(geometry.clone(),new THREE.MeshBasicMaterial({color:0xe1e6e2,wireframe:true,transparent:true,opacity:.25,depthWrite:false}));
  reference.visible=false;scene.add(reference);
  const palette=[[.14,.32,.68],[.13,.68,.85],[.32,.78,.5],[.94,.82,.23],[.88,.32,.17]];
  function color(t){const v=Math.max(0,Math.min(0.9999,t))*4,k=Math.floor(v),w=v-k;return [0,1,2].map(i=>palette[k][i]*(1-w)+palette[k+1][i]*w)}
  const rangeMin=legend.querySelector('.legend-low'),rangeMax=legend.querySelector('.legend-high');
  const formatNumber=x=>Number.isFinite(x)?Math.abs(x)>10000||Math.abs(x)<.001&&x!==0?x.toExponential(3):x.toPrecision(5):'缺失';
  let frame=0,playing=false,lastAdvance=0,disposed=false,currentValues=null;
  const maxNodalDisplacement=frames.reduce((max,f)=>Math.max(max,...f.displacement.slice(0,Math.min(f.displacement.length,30000)).map(u=>Math.hypot(...u))),0);
  function valueArray(f){if(selectField.value==='U, Magnitude')return f.displacement.map(u=>Math.hypot(...u));return f.scalars?.[selectField.value]||new Array(nodes.length).fill(null)}
  function repaint(){
   if(disposed)return;frame=+stepSlider.value;
   const f=frames[frame],selected=valueArray(f),valid=selected.filter(v=>typeof v==='number'&&Number.isFinite(v));
   let min=Infinity,max=-Infinity;for(const v of valid){if(v<min)min=v;if(v>max)max=v;}if(!valid.length){min=0;max=0;}const spread=Math.max(max-min,1e-16),scale=+factor.value;
   currentValues=selected;
   for(let i=0;i<nTri;i++){
    const id=indices[i],p=nodes[id],u=f.displacement[id];
    positions[3*i]=p[0]+u[0]*scale-center.x;
    positions[3*i+1]=p[1]+u[1]*scale-center.y;
    positions[3*i+2]=p[2]+u[2]*scale-center.z;
    const val=selected[id],isValid=typeof val==='number'&&Number.isFinite(val),rgb=isValid?color((val-min)/spread):[.44,.49,.51];
    for(let j=0;j<3;j++)colors[3*i+j]=rgb[j];
   }
   geometry.attributes.position.needsUpdate=true;geometry.attributes.color.needsUpdate=true;geometry.computeVertexNormals();
   wireMesh.geometry.dispose();wireMesh.geometry=new THREE.EdgesGeometry(geometry);wireMesh.visible=wireInput.checked;
   reference.visible=originalInput.checked;
   rangeMin.textContent=formatNumber(min);rangeMax.textContent=formatNumber(max);
   legend.querySelector('.legend-caption').textContent=selectField.value+(result.units?.[selectField.value]?' / '+result.units[selectField.value]:'');
   stepLabel.textContent=(f.label||'Frame '+frame)+(f.time!==undefined?' · '+f.time:'');
   factorValue.textContent=scale+'×';
  }
  for(let k=0;k<nTri;k++){const p=nodes[indices[k]];reference.geometry.attributes.position.array.set([p[0]-center.x,p[1]-center.y,p[2]-center.z],k*3);}
  reference.geometry.attributes.position.needsUpdate=true;
  // Move scene model about origin for large-coordinate numerical stability.
  camera.position.sub(center);controls.target.set(0,0,0);controls.update();
  const raycaster=new THREE.Raycaster(),mouse=new THREE.Vector2();
  function onProbe(event){
    const rect=renderer.domElement.getBoundingClientRect();mouse.x=(event.clientX-rect.left)/rect.width*2-1;mouse.y=-(event.clientY-rect.top)/rect.height*2+1;raycaster.setFromCamera(mouse,camera);
    const hit=raycaster.intersectObject(mesh,false)[0];if(!hit){inspector.textContent='未选中网格';return;}
    const i=hit.faceIndex,ids=[indices[3*i],indices[3*i+1],indices[3*i+2]],point=hit.point;
    const a=new THREE.Vector3(...positions.slice(i*9,i*9+3)),b=new THREE.Vector3(...positions.slice(i*9+3,i*9+6)),c=new THREE.Vector3(...positions.slice(i*9+6,i*9+9)),bc=new THREE.Vector3();
    THREE.Triangle.getBarycoord(point,a,b,c,bc);
    const vals=ids.map(id=>currentValues?.[id]);if(vals.every(v=>typeof v==='number'&&Number.isFinite(v))){const num=bc.x*vals[0]+bc.y*vals[1]+bc.z*vals[2];inspector.textContent=selectField.value+' = '+formatNumber(num)+(result.units?.[selectField.value]?' '+result.units[selectField.value]:'')+'（面内节点插值）';}else inspector.textContent='此处未提供完整的节点场数据';
  }
  let startX=0,startY=0;renderer.domElement.addEventListener('pointerdown',e=>{startX=e.clientX;startY=e.clientY;});
  renderer.domElement.addEventListener('pointerup',e=>{if(Math.hypot(e.clientX-startX,e.clientY-startY)<4)onProbe(e);});
  function resize(){if(disposed)return;const w=Math.max(300,canvas.clientWidth),h=Math.max(340,canvas.clientHeight);camera.aspect=w/h;camera.updateProjectionMatrix();renderer.setSize(w,h,false);}
  const observer=typeof ResizeObserver!=='undefined'?new ResizeObserver(resize):null;if(observer)observer.observe(canvas);else window.addEventListener('resize',resize);
  selectField.onchange=repaint;stepSlider.oninput=repaint;factor.oninput=repaint;wireInput.onchange=repaint;originalInput.onchange=repaint;
  play.onclick=()=>{playing=!playing;play.textContent=playing?'❚❚ 暂停':'▶ 播放'};
  repaint();resize();
  let raf=0;function draw(time){if(disposed)return;raf=requestAnimationFrame(draw);if(playing&&frames.length>1&&time-lastAdvance>=125){stepSlider.value=(frame+1)%frames.length;repaint();lastAdvance=time;}controls.update();renderer.render(scene,camera);}
  raf=requestAnimationFrame(draw);
  return()=>{disposed=true;cancelAnimationFrame(raf);observer?.disconnect();window.removeEventListener('resize',resize);controls.dispose();wireMesh.geometry.dispose();wireMesh.material.dispose();reference.geometry.dispose();reference.material.dispose();geometry.dispose();material.dispose();renderer.dispose();host.replaceChildren();};
}