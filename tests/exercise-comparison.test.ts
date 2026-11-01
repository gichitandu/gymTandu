import {expect,it} from 'vitest';
import {seed} from '../src/app/core/seed';
import {exerciseComparison} from '../src/app/services/exercise-comparison';
it('compares only earlier completed sessions of the same exercise and equipment configuration, excluding warmups',()=>{
 const data=seed();
 const current={id:'current-ex',workoutId:'current',exerciseId:'exercise-0',name:'Panca',loadMode:'external' as const,order:0,rest:90,notes:'',machineSetup:{machine:'A'}};
 data.workouts.push(...['old','future','current'].map((id,i)=>({id,userId:'local',planId:'p',dayId:'d',planName:'P',dayName:'D',date:['2026-10-20','2026-11-10','2026-11-01'][i],startedAt:'2026-11-01T12:00:00Z',duration:30,notes:'',status:'completed' as const})));
 data.workoutExercises.push(current,{...current,id:'old-ex',workoutId:'old'},{...current,id:'different',workoutId:'old',machineSetup:{machine:'B'}},{...current,id:'future-ex',workoutId:'future'});
 data.sets.push(...['old-ex','different','future-ex'].map((id,i)=>({id:'s'+i,workoutExerciseId:id,number:1,weight:20,reps:10,completed:true})),{id:'warm',workoutExerciseId:'old-ex',number:2,weight:100,reps:20,completed:true,kind:'warmup'});
 expect(exerciseComparison(data,current)).toEqual([{date:'2026-10-20',weight:20,reps:10,volume:200,sets:1}]);
 expect(data.sets).toHaveLength(4);
});
