import '@angular/compiler';
import 'fake-indexeddb/auto';
import Dexie from 'dexie';
import {expect,it} from 'vitest';
import {GymDatabase} from '../src/app/core/database';
import {seed} from '../src/app/core/seed';
import {TABLES} from '../src/app/models/domain';
import {defaultExercises} from '../src/app/core/default-catalog';
it('adds distinct bench angles with blank videos and unique identifiers',()=>{
 expect(new Set(defaultExercises.map(e=>e.id)).size).toBe(defaultExercises.length);
 for(const id of ['library-dumbbells_dumbbell_bench_press','variant-db-bench-30','variant-db-bench-45','variant-db-bench-decline-15','variant-db-bench-neutral-30'])expect(defaultExercises.find(e=>e.id===id)).toMatchObject({active:true,videoUrl:'',equipment:'Manubri'});
 expect(defaultExercises.every(e=>!e.videoUrl&&!e.thumbnailUrl)).toBe(true);
});
it('upgrades an existing offline archive once, preserving history, inactive flags and future admin links',async()=>{
 const name='catalog-upgrade-'+crypto.randomUUID();const old=new Dexie(name);
 old.version(3).stores({profiles:'id,role',roles:'id,&name',plans:'id,userId,active,archived',days:'id,planId,order',planExercises:'id,dayId,exerciseId',exercises:'id,name,muscleGroupId,equipment,active',muscleGroups:'id,&name',workouts:'id,userId,planId,dayId,date,status',workoutExercises:'id,workoutId,exerciseId',sets:'id,workoutExerciseId',settings:'id',meals:'id,date,name',scheduledWorkouts:'id,date,dayId,workoutId',measurements:'id,&date'});
 const data=seed();data.exercises=data.exercises.filter(e=>!e.id.startsWith('variant-'));Object.assign(data.exercises[0],{name:'La mia panca',active:false,videoUrl:'https://www.youtube.com/watch?v=abcdefghijk',thumbnailUrl:'https://i.ytimg.com/vi/abcdefghijk/hqdefault.jpg'});
 data.plans.push({id:'p',userId:'local',name:'Piano salvato',description:'Conserva',createdAt:new Date().toISOString(),updatedAt:new Date().toISOString(),active:true,archived:false});
 for(const table of TABLES)await old.table(table).bulkPut(data[table]);old.close();
 const db=new GymDatabase(name);try{const upgraded=await db.snapshot();expect(upgraded.plans).toEqual(data.plans);expect(upgraded.exercises.find(e=>e.id==='exercise-0')).toMatchObject({name:'La mia panca',active:false,videoUrl:'',thumbnailUrl:''});expect(upgraded.exercises.filter(e=>e.id.startsWith('variant-'))).toHaveLength(64);
 await db.entity('exercises').update('exercise-0',{videoUrl:'https://example.com/nuovo-video.mp4'});db.close();const reopened=new GymDatabase(name);try{expect((await reopened.snapshot()).exercises.find(e=>e.id==='exercise-0')?.videoUrl).toBe('https://example.com/nuovo-video.mp4');}finally{reopened.close();}
 }finally{await db.delete();}
});
