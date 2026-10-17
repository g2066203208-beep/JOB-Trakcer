import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { STLLoader } from 'three/addons/loaders/STLLoader.js';
import { OBJLoader } from 'three/addons/loaders/OBJLoader.js';
import { validateFieldData, fieldValues, fieldRange, frameDescription, metadataLines, isScalar } from './field-data.js';

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
  const allFields=validateFieldData(result);
  const nodes=result.nodes,faces=result.triangles,frames=result.frames;
  const indices=new Uint32Array(faces.length*3);
  faces.forEach((face,i)=>indices.set(face,i*3));
  const cleaned=nodes.map(p=>new THREE.Vector3(p[0],p[1],p[2]));
  const bounding=new THREE.Box3().setFromPoints(cleaned),center=bounding.getCenter(new THREE.Vector3());
  const radius=Math.max(bounding.getSize(new THREE.Vector3()).length(),1e-9);
  host.replaceChildren();host.style.position='relative';host.style.background='#0e191e';
  const ui=document.createElement('div');ui.className='field-controls';
  const bar=document.createElement('div');bar.className='field-bar';ui.append(bar);
  const selectField=document.createElement('select');selectField.setAttribute('aria-label','选择结果云图变量');
  allFields.forEach(v=>{const o=document.createElement('option');o.value=v;o.textContent=v;selectField.append(o)});
  if(allFields.includes('S, Mises'))selectField.value='S, Mises';
  else if(allFields.includes('S, Mises (nodal max)'))selectField.value='S, Mises (nodal max)';
  const rangeMode=document.createElement('select');rangeMode.setAttribute('aria-label','色标范围模式');
  for(const [value,label] of [['global','全帧固定'],['frame','当前帧自动']]){const option=document.createElement('option');option.value=value;option.textContent=label;rangeMode.append(option);}
  const stepSlider=document.createElement('input');stepSlider.type='range';stepSlider.min=0;stepSlider.max=frames.length-1;stepSlider.step=1;stepSlider.value=frames.length-1;stepSlider.setAttribute('aria-label','选择结果帧');
  const factor=document.createElement('input');factor.type='range';factor.min=0;factor.max=50;factor.step=.25;factor.value=1;factor.setAttribute('aria-label','变形放大倍数');
  const factorValue=document.createElement('strong');factorValue.textContent='1×';
  const play=document.createElement('button');play.type='button';play.textContent='▶ 逐帧播放';play.disabled=frames.length<2;
  const wire=document.createElement('label');const wireInput=document.createElement('input');wireInput.type='checkbox';wireInput.checked=false;wire.append(wireInput,document.createTextNode(' 表面三角网格'));
  const original=document.createElement('label');const originalInput=document.createElement('input');originalInput.type='checkbox';originalInput.checked=false;original.append(originalInput,document.createTextNode(' 原形'));
  const stepLabel=document.createElement('span');stepLabel.className='field-step';
  for(const [label,control] of [['云图 ',selectField],['色标 ',rangeMode],['帧 ',stepSlider],['变形 ',factor]]){const el=document.createElement('label');el.className='field-option';el.append(document.createTextNode(label),control);bar.append(el);if(control===factor)el.append(factorValue);}
  bar.append(play,wire,original,stepLabel);
  const isModal=String(result.time?.kind||'').toLowerCase()==='modal'||frames.some(f=>f.mode!==undefined);
  const playbackNote=document.createElement('div');playbackNote.className='field-playback-note';playbackNote.textContent=isModal?'不同振型顺序预览 · 8 帧/秒 · 非振动时间动画；模态向量可能经归一化，不代表物理位移响应，倍率仅缩放源向量':'按导出帧顺序播放 · 8 帧/秒 · 非物理时间回放，不插值生成中间结果';ui.append(playbackNote);
  const canvas=document.createElement('div');canvas.className='field-canvas';host.append(ui,canvas);
  const legend=document.createElement('div');legend.className='field-legend';legend.innerHTML='<div class="legend-caption">FIELD RANGE</div><div class="legend-high"></div><div class="legend-gradient"></div><div class="legend-low"></div><div class="legend-status"></div>';canvas.append(legend);
  const metadata=document.createElement('details');metadata.className='field-metadata';
  const summary=document.createElement('summary');summary.textContent='来源：'+(result.source_file||'原始文件未声明')+' · 文件声明：'+(!result.validation?.status||result.validation.status==='not_verified'?'尚未核验':String(result.validation.status));metadata.append(summary);
  for(const line of metadataLines(result)){const p=document.createElement('p');p.textContent=line;metadata.append(p);}host.append(metadata);
  const inspector=document.createElement('div');inspector.className='field-inspector';inspector.textContent='单击网格读取数值 / 拖动旋转 / 滚轮缩放';canvas.append(inspector);
  const scene=new THREE.Scene();scene.background=new THREE.Color('#10191f');
  const camera=new THREE.PerspectiveCamera(42,1,Math.max(radius/5000,.000001),Math.max(radius*500,10));camera.position.copy(center.clone().add(new THREE.Vector3(radius*.95,radius*.55,radius)));
  const renderer=new THREE.WebGLRenderer({antialias:true});renderer.setPixelRatio(Math.min(window.devicePixelRatio||1,2));renderer.outputColorSpace=THREE.SRGBColorSpace;renderer.toneMapping=THREE.NoToneMapping;canvas.prepend(renderer.domElement);
  const controls=new OrbitControls(camera,renderer.domElement);controls.enableDamping=true;controls.target.copy(center);controls.update();
  const nTri=indices.length;const geometry=new THREE.BufferGeometry();
  const positions=new Float32Array(nTri*3),colors=new Float32Array(nTri*3);
  geometry.setAttribute('position',new THREE.BufferAttribute(positions,3).setUsage(THREE.DynamicDrawUsage));
  geometry.setAttribute('color',new THREE.BufferAttribute(colors,3).setUsage(THREE.DynamicDrawUsage));
  const material=new THREE.MeshBasicMaterial({vertexColors:true,side:THREE.DoubleSide,toneMapped:false});
  const mesh=new THREE.Mesh(geometry,material);scene.add(mesh);
  const wireMesh=new THREE.LineSegments(new THREE.BufferGeometry(),new THREE.LineBasicMaterial({color:0x16242c,transparent:true,opacity:.7,toneMapped:false}));wireMesh.visible=false;scene.add(wireMesh);
  const referenceGeometry=new THREE.BufferGeometry();
  referenceGeometry.setAttribute('position',new THREE.BufferAttribute(new Float32Array(nTri*3),3));
  const reference=new THREE.Mesh(referenceGeometry,new THREE.MeshBasicMaterial({color:0xe1e6e2,wireframe:true,transparent:true,opacity:.25,depthWrite:false,toneMapped:false}));
  reference.visible=false;scene.add(reference);
  // Vertex colors use linear RGB; the legend is converted back to sRGB from
  // the same lookup, so lighting and tone mapping cannot alter field colors.
  const palette=['#2452ad','#23add7','#53c783','#f0d13b','#e3522a'].map(hex=>new THREE.Color(hex));
  const missingColor=new THREE.Color('#717d82'),scratchColor=new THREE.Color();
  function color(t,target=scratchColor){const v=Math.max(0,Math.min(1,t))*4,k=Math.min(3,Math.floor(v));return target.copy(palette[k]).lerp(palette[k+1],v-k);}
  const gradient=legend.querySelector('.legend-gradient');
  const gradientColors=Array.from({length:129},(_,i)=>color(i/128).getStyle()+' '+(i/128*100)+'%');
  const gradientStyle='linear-gradient(to top,'+gradientColors.join(',')+')';
  const rangeMin=legend.querySelector('.legend-low'),rangeMax=legend.querySelector('.legend-high');
  const formatNumber=x=>Number.isFinite(x)?Math.abs(x)>10000||Math.abs(x)<.001&&x!==0?x.toExponential(3):x.toPrecision(5):'缺失';
  let frame=0,playing=false,lastAdvance=0,disposed=false,currentValues=null;
  const globalRanges=new Map();
  function repaint(){
   if(disposed)return;frame=+stepSlider.value;
   const f=frames[frame],selected=fieldValues(f,selectField.value,nodes.length),validCount=selected.filter(isScalar).length;
   if(!globalRanges.has(selectField.value))globalRanges.set(selectField.value,fieldRange(frames,selectField.value,nodes.length));
   const range=rangeMode.value==='global'?globalRanges.get(selectField.value):fieldRange([f],selectField.value,nodes.length);
   const {min,max}=range,spread=range.count?max-min:0,scale=+factor.value;
   currentValues=selected;
   for(let i=0;i<nTri;i++){
    const id=indices[i],p=nodes[id],u=f.displacement[id];
    positions[3*i]=p[0]+u[0]*scale-center.x;
    positions[3*i+1]=p[1]+u[1]*scale-center.y;
    positions[3*i+2]=p[2]+u[2]*scale-center.z;
    const val=selected[id],rgb=isScalar(val)?color(spread>0?(val-min)/spread:.5):missingColor;
    colors[3*i]=rgb.r;colors[3*i+1]=rgb.g;colors[3*i+2]=rgb.b;
   }
   geometry.attributes.position.needsUpdate=true;geometry.attributes.color.needsUpdate=true;
   geometry.computeBoundingBox();geometry.computeBoundingSphere();
   if(wireInput.checked){wireMesh.geometry.dispose();wireMesh.geometry=new THREE.WireframeGeometry(geometry);}wireMesh.visible=wireInput.checked;
   reference.visible=originalInput.checked;
   rangeMin.textContent=range.count?formatNumber(min):'缺失';rangeMax.textContent=range.count?formatNumber(max):'缺失';
   gradient.style.background=!validCount?'#717d82':spread===0?color(.5).getStyle():gradientStyle;
   legend.querySelector('.legend-caption').textContent=selectField.value+' / '+(result.units?.[selectField.value]||'单位未确认');
   legend.querySelector('.legend-status').textContent=(rangeMode.value==='global'?'全帧固定':'当前帧自动')+' · '+(validCount?validCount+'/'+nodes.length+' 节点有值':'当前帧缺失（灰色）');
   stepLabel.textContent=frameDescription(result,f,frame)+' · '+(frame+1)+'/'+frames.length;
   factorValue.textContent=scale+'×';
   inspector.textContent='单击读取面内节点插值 / 灰色表示缺失 / 拖动旋转';
  }
  for(let k=0;k<nTri;k++){const p=nodes[indices[k]];reference.geometry.attributes.position.array.set([p[0]-center.x,p[1]-center.y,p[2]-center.z],k*3);}
  reference.geometry.attributes.position.needsUpdate=true;
  reference.geometry.computeBoundingBox();reference.geometry.computeBoundingSphere();
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
  selectField.onchange=repaint;rangeMode.onchange=repaint;stepSlider.oninput=repaint;factor.oninput=repaint;wireInput.onchange=repaint;originalInput.onchange=repaint;
  play.onclick=()=>{playing=!playing;lastAdvance=performance.now();play.textContent=playing?'❚❚ 暂停':'▶ 逐帧播放'};
  repaint();resize();
  let raf=0;function draw(time){if(disposed)return;raf=requestAnimationFrame(draw);if(playing&&frames.length>1&&time-lastAdvance>=125){stepSlider.value=(frame+1)%frames.length;repaint();lastAdvance=time;}controls.update();renderer.render(scene,camera);}
  raf=requestAnimationFrame(draw);
  return()=>{disposed=true;cancelAnimationFrame(raf);observer?.disconnect();window.removeEventListener('resize',resize);controls.dispose();wireMesh.geometry.dispose();wireMesh.material.dispose();reference.geometry.dispose();reference.material.dispose();geometry.dispose();material.dispose();renderer.dispose();host.replaceChildren();};
}

