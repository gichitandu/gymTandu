import {DataSet,TrainingPlan} from '../models/domain';
import {effectiveProgramRange} from './plan-program';

export interface PlanWeight {plan:TrainingPlan;workouts:number;sets:number}
export interface PlanOverlap {keep:PlanWeight;drop:PlanWeight;startDate:string;endDate:string}

/** Quante sedute concluse e serie completate ha registrato un piano. */
export function planWeight(data:DataSet,plan:TrainingPlan):PlanWeight {
 const done=data.workouts.filter(w=>w.planId===plan.id&&w.status==='completed'),ids=new Set(done.map(w=>w.id));
 const exercises=new Set(data.workoutExercises.filter(e=>ids.has(e.workoutId)).map(e=>e.id));
 return {plan,workouts:done.length,sets:data.sets.filter(s=>s.completed&&exercises.has(s.workoutExerciseId)).length};
}
const heavier=(a:PlanWeight,b:PlanWeight)=>b.workouts-a.workouts||b.sets-a.sets||b.plan.updatedAt.localeCompare(a.plan.updatedAt)||a.plan.id.localeCompare(b.plan.id);

/**
 * Coppie di piani ancora aperti con date sovrapposte, di cui almeno uno è un programma a date fisse. Per ogni coppia propone di tenere
 * il piano con più sedute e serie registrate. Sola lettura: non modifica i dati.
 */
export function planOverlaps(data:DataSet):PlanOverlap[] {
 const open=data.plans.filter(p=>!p.archived&&!p.completedAt).map(plan=>({plan,range:effectiveProgramRange(data,plan)})).filter((x):x is {plan:TrainingPlan;range:{startDate:string;endDate:string}}=>!!x.range);
 const result:PlanOverlap[]=[];
 for(let i=0;i<open.length;i++)for(let j=i+1;j<open.length;j++){
  const a=open[i],b=open[j];
  if(!a.plan.program&&!b.plan.program)continue;
  if(a.range.startDate>b.range.endDate||b.range.startDate>a.range.endDate)continue;
  const [keep,drop]=[planWeight(data,a.plan),planWeight(data,b.plan)].sort(heavier);
  result.push({keep,drop,startDate:a.range.startDate>b.range.startDate?a.range.startDate:b.range.startDate,endDate:a.range.endDate<b.range.endDate?a.range.endDate:b.range.endDate});
 }
 return result;
}
