import {describe,expect,it} from 'vitest';
import {buildWorkoutSummary} from '../src/app/services/workout-summary';
import type {DataSet} from '../src/app/models/domain';

describe('buildWorkoutSummary',()=>{
 it('elenca gli esercizi nell’ordine della seduta, non in quello dell’archivio',()=>{
  const row=(id:string,order:number)=>({id,workoutId:'w1',exerciseId:'e-'+id,name:'Esercizio '+id,loadMode:'external',order,rest:90,notes:''});
  const data={workouts:[{id:'w1',status:'completed',date:'2026-01-05',startedAt:'2026-01-05T10:00:00.000Z',duration:0}],workoutExercises:[row('c',2),row('a',0),row('b',1)],sets:[]} as unknown as DataSet;
  expect(buildWorkoutSummary(data,'w1').rows.map(r=>r.id)).toEqual(['a','b','c']);
 });
});
