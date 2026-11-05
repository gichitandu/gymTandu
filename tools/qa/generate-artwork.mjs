#!/usr/bin/env node
/**
 * QA-only, opt-in image production for GymTrack's remaining 243 exercises.
 * Defaults to DRY RUN. Does not publish images or change any existing art.
 * Paid image API requests occur ONLY with --execute and OPENAI_API_KEY.
 *
 * Usage:
 *   node tools/qa/generate-artwork.mjs --limit 5
 *   OPENAI_API_KEY=... node tools/qa/generate-artwork.mjs --execute --id variant-smith-bench-30
 *   OPENAI_API_KEY=... node tools/qa/generate-artwork.mjs --execute --limit 20
 */
import {readFile,writeFile,mkdir,access} from 'node:fs/promises';
import {execFileSync} from 'node:child_process';
import {resolve,join} from 'node:path';
import {createHash} from 'node:crypto';

const project=resolve(process.cwd());
const manifest=JSON.parse(await readFile(join(project,'docs/qa/exercise-artwork-remaining-243.json'),'utf8'));
const args=process.argv.slice(2),arg=k=>{const i=args.indexOf(k);return i>=0?args[i+1]:undefined;};
const execute=args.includes('--execute');
const only=arg('--id');
const limit=arg('--limit')?Number(arg('--limit')):5;
if(!Number.isSafeInteger(limit)||limit<1||limit>243)throw Error('Invalid --limit (1..243)');
const model=process.env.GYMTRACK_IMAGE_MODEL||'gpt-image-2.5-sunburst';
if(!/^gpt-image-2\.(5|6)-(sunburst|flare)$/.test(model))throw Error('Unsupported image model: '+model);
// Pending illustrations are never automatically considered ready for production.
const selected=manifest.pending.filter(e=>!only||e.id===only).slice(0,only?1:limit);
if(only&&selected.length===0)throw Error('Unknown exercise id: '+only);

const muscles={
 'muscle-0':'pectoralis major, with the targeted portion anatomically highlighted',
 'muscle-1':'latissimus dorsi, rhomboids, trapezius or spinal erectors, only where relevant to this specific movement',
 'muscle-2':'anterior, lateral or posterior deltoid heads according to the exact movement',
 'muscle-3':'quadriceps, hamstrings and gluteal muscles according to the exact movement',
 'muscle-4':'biceps, brachialis, triceps or forearm muscles according to the exact movement',
 'muscle-5':'abdominal wall and core stabilizers according to the exact movement',
 'muscle-6':'gluteal muscle group according to the exact movement',
 'muscle-7':'gastrocnemius or soleus according to the exact movement'
};
function specificity(e){
 const name=e.name.normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLowerCase();
 const specs=[];
 for(const [pattern,description] of [
  [/(?:^|\s)15°|a 15°/,'Set the real bench inclination to 15 degrees, not 30 or 45.'],
  [/30°/,'Set the real bench inclination to exactly 30 degrees.'],
  [/45°/,'Set the real bench inclination to exactly 45 degrees.'],
  [/60°/,'Set the real bench inclination to exactly 60 degrees.'],
  [/75°/,'Set the real backrest angle to exactly 75 degrees.'],
  [/90°/,'Set the real backrest angle to exactly 90 degrees.'],
  [/−15°|-15°/,'Set the bench decline to 15 degrees below horizontal.'],
  [/−30°|-30°/,'Set the bench decline to 30 degrees below horizontal.'],
  [/presa prona/,'Pronated overhand grip visibly correct.'],
  [/presa supina/,'Supinated underhand grip visibly correct.'],
  [/presa neutra|triangolo/,'Neutral palms-facing grip with appropriate handles.'],
  [/presa larga/,'Wide spacing between hands, visibly correct.'],
  [/presa stretta/,'Narrow spacing between hands, visibly correct.'],
  [/presa media/,'Medium spacing between hands, visibly correct.'],
  [/unilateral|un manubrio/,'One arm only in the active movement, not a bilateral depiction.'],
  [/alternat/,'Only one arm performs the active phase while the other is held in a neutral/lowered position.'],
  [/multipower/,'Barbell constrained to a fixed Smith machine rail; not a free barbell.'],
  [/a dischi|macchina a dischi/,'Plate-loaded mechanical machine, not a selectorized weight stack.'],
  [/convergent/,'Machine independent arms visibly converge toward the center during pressing.'],
  [/divergent/,'Machine lever handles follow a divergent path.'],
  [/in ginocchio|inginocchi/,'The athlete must be kneeling.'],
  [/dal basso|cavi bassi|cavo basso/,'Cable pulley located low; correct low-to-high pulling direction.'],
  [/dall.alto|cavi alti|cavo alto/,'Cable pulley located high; correct high-to-low pulling direction.'],
  [/dietro il corpo/,'Cable passes from behind the body.'],
  [/petto su panca/,'Chest genuinely supported on an inclined bench.'],
  [/declinat/,'Decline bench or decline press machine posture, never incline.'],
  [/inclinat/,'Incline bench or incline press machine posture, never decline.'],
  [/in piedi/,'Standing stance.'],
  [/da sedut|sedut/,'Seated position with correct machine or bench.'],
  [/corda/,'Rope handle instead of a bar or triangle.'],
  [/maniglie indipendenti/,'Independent cable handles clearly distinct and separately gripped.'],
  [/face pull/,'Rope attachment pulled toward face with elbows up.'],
  [/croci/,'Fly/adduction motion with soft bent elbows, not a chest press.'],
  [/lat machine/,'Pulldown in front of the face, never behind the neck.'],
  [/rematore/,'Rowing with elbows moving backward, consistent body support and equipment.'],
  [/trazioni/,'Body hanging from an actual pull-up bar with the correct grip.']
 ]) if(pattern.test(name))specs.push(description);
 if(!specs.length)specs.push('Use the exact equipment and mechanics implied by the named exercise; do not invent another exercise.');
 return specs;
}
function prompt(e){
 return [
  'Create ONE standalone, square, non-UI GymTrack exercise illustration (not a collage or infographic).',
  'The attached original GymTrack picture is a STYLE REFERENCE ONLY. Preserve the visual style, but do NOT copy its pose or equipment unless appropriate.',
  'Match the GymTrack original exactly in mood: semi-realistic anatomical three-dimensional metallic silver mannequin; detailed gray musculature; only biomechanically active muscles lit lilac/violet; cool cyan rim lighting; realistic dark metal gym machinery; deep navy-black studio background. Athletic shorts, no facial identity. Center the entire person and all required equipment, 3/4 camera angle that makes hand position and apparatus legible; crop neither hands nor equipment.',
  'Exercise as it appears in the verified GymTrack catalog (Italian): '+e.name+'.',
  'Equipment STRICTLY: '+e.equipment+'. Exercise category: '+(muscles[e.muscleGroupId]||'only the relevant muscles')+'.',
  'Variant-specific requirements: '+specificity(e).join(' '),
  'Pose depicts one clear and physically feasible key phase of this exact exercise (not a technique sequence). Correct joint alignment, symmetrical body anatomy unless unilateral, cable pulley geometry and dumbbell/barbell placement. Avoid nonfunctional machine designs or wrong muscle highlights.',
  'No text, badges, labels, letters, logos, borders, user interface, other exercises, diagrams or multiple panels. One full-bleed background. This is a single exercise artwork for an existing catalog, not a new app screen.'
 ].join('\n');
}
const refs={
 'muscle-0':'bench-v2.png','muscle-1':'lat-v2.png','muscle-2':'shoulder-v2.png',
 'muscle-3':'squat-v2.png','muscle-4':'curl-v2.png','muscle-5':'atlas-core-v3.png',
 'muscle-6':'atlas-lower-v3.png','muscle-7':'atlas-legs-v3.png'
};
const output=resolve(project,'tmp/qa-artwork-unreviewed');
console.log(JSON.stringify({mode:execute?'EXECUTE (paid API)':'DRY RUN (no API calls)',count:selected.length,model,output,ids:selected.map(x=>x.id)}));
if(!execute){for(const e of selected)console.log('\n'+e.id+' '+e.name+'\n'+specificity(e).join(' '));process.exit(0);}
if(!process.env.OPENAI_API_KEY)throw Error('OPENAI_API_KEY is required for --execute; do not commit or paste it.');
let branch;
try{branch=execFileSync('git',['branch','--show-current'],{cwd:project,encoding:'utf8'}).trim();}
catch{throw Error('Work in a checked-out git clone on qa/gymtrack-isolato only.');}
if(branch!=='qa/gymtrack-isolato')throw Error('Refusing generation outside qa/gymtrack-isolato');
await mkdir(output,{recursive:true});
for(const [i,e] of selected.entries()){
 const dest=join(output,e.id+'.webp'),meta=join(output,e.id+'.json');
 try{await access(dest);console.log('SKIP existing candidate '+e.id);continue;}catch{}
 const ref=await readFile(join(project,'public/training/figures',refs[e.muscleGroupId]));
 const body={
  model,
  images:[{image_url:'data:image/png;base64,'+ref.toString('base64')}],
  prompt:prompt(e),quality:'high',size:'1024x1024',
  output_format:'webp',output_compression:80,background:'opaque',n:1
 };
 const response=await fetch('https://api.openai.com/v1/images/edits',{
  method:'POST',headers:{'Authorization':'Bearer '+process.env.OPENAI_API_KEY,'Content-Type':'application/json'},
  body:JSON.stringify(body),signal:AbortSignal.timeout(240000)
 });
 if(!response.ok){
  const error=(await response.text()).slice(0,1200);
  throw Error('API image edit failed for '+e.id+': '+response.status+' '+error);
 }
 const result=await response.json(),b64=result.data?.[0]?.b64_json;
 if(typeof b64!=='string'||!b64.length)throw Error('No image returned for '+e.id);
 const data=Buffer.from(b64,'base64');
 if(data.length<2000)throw Error('Image too small for '+e.id);
 await writeFile(dest,data,{flag:'wx'});
 await writeFile(meta,JSON.stringify({
  id:e.id,name:e.name,equipment:e.equipment,group:e.muscleGroupId,
  output:'UNREVIEWED',model,prompt:body.prompt,
  sha256:createHash('sha256').update(data).digest('hex'),
  sizeBytes:data.length,originalReference:refs[e.muscleGroupId],createdAt:new Date().toISOString(),
  note:'Review exercise biomechanics and compare to original GymTrack style. Do not ship or map automatically.'
 },null,2)+'\n');
 console.log('GENERATED (NOT APPROVED) '+(i+1)+'/'+selected.length+' '+e.id+' '+data.length+' bytes');
}
console.log('All candidates saved to '+output+' (never inserted into the app automatically).');
