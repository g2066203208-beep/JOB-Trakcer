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