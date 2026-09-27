// Character Rig Forge — lightweight vision worker.
// Florence-2-base-ft is used only for semantic region discovery.
// Heavy image inference stays off the main thread.
const TRANSFORMERS_URL="https://cdn.jsdelivr.net/npm/@huggingface/transformers@4.3.0/+esm";
const MODEL_ID="onnx-community/Florence-2-base-ft";
let mod=null,model=null,processor=null,device="wasm",dtype="q8";

async function probe(){
  if(!("gpu" in navigator))return {ok:false};
  try{const a=await navigator.gpu.requestAdapter();return {ok:!!a,fp16:!!a?.features?.has?.("shader-f16")}}catch{return {ok:false}}
}
async function load(progress_callback){
  mod ??= await import(TRANSFORMERS_URL);
  const {Florence2ForConditionalGeneration,AutoProcessor}=mod;
  processor ??= await AutoProcessor.from_pretrained(MODEL_ID,{progress_callback});
  const gpu=await probe();
  if(gpu.ok){
    try{
      model=await Florence2ForConditionalGeneration.from_pretrained(MODEL_ID,{device:"webgpu",dtype:gpu.fp16?"fp16":"q4",progress_callback});
      device="webgpu";dtype=gpu.fp16?"fp16":"q4";
    }catch(e){
      console.warn("Florence WebGPU failed",e);
      model=await Florence2ForConditionalGeneration.from_pretrained(MODEL_ID,{device:"wasm",dtype:"q8",progress_callback});
      device="wasm";dtype="q8";
    }
  }else{
    model=await Florence2ForConditionalGeneration.from_pretrained(MODEL_ID,{device:"wasm",dtype:"q8",progress_callback});
  }
}
async function run(id,imageUrl,text){
  if(!model)await load(p=>postMessage({type:"progress",id,p}));
  const image=await mod.RawImage.fromURL(imageUrl);
  const task="<CAPTION_TO_PHRASE_GROUNDING>";
  const prompts=processor.construct_prompts(task+text);
  const inputs=await processor(image,prompts);
  const ids=await model.generate({...inputs,max_new_tokens:256,do_sample:false,num_beams:1});
  const raw=processor.batch_decode(ids,{skip_special_tokens:false})[0];
  const parsed=processor.post_process_generation(raw,task,image.size);
  postMessage({type:"result",id,raw,parsed,imageSize:image.size,device,dtype});
}
self.onmessage=async e=>{
  const {type,id,imageUrl,text}=e.data;
  try{
    if(type==="load"){await load(p=>postMessage({type:"progress",id,p}));postMessage({type:"ready",device,dtype});}
    if(type==="run")await run(id,imageUrl,text);
  }catch(err){postMessage({type:"error",id,message:String(err?.message??err)})}
};
