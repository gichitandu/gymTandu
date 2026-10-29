import {expect,it} from 'vitest';
import {seed} from '../src/app/core/seed';
import {DataSet,WorkoutLog,WorkoutLogExercise,WorkoutLogSet} from '../src/app/models/domain';
import {buildPlanStatistics} from '../src/app/services/plan-statistics';
const at='2026-11-02T12:00:00.000Z';
function workout(id:string,planId='p',date='2026-11-02',duration=45):WorkoutLog{return{id,userId:'local',planId,dayId:planId==='p'?'d1':'other-day',planName:'Stesso titolo',dayName:'Seduta',date,startedAt:at,endedAt:at,duration,notes:'',status:'completed'};}
function exercise(id:string,workoutId:string,options:Partial<WorkoutLogExercise>={}):WorkoutLogExercise{return{id,workoutId,exerciseId:'exercise-0',name:'Panca',loadMode:'external',order:0,rest:90,notes:'',...options};}
function set(id:string,workoutExerciseId:string,options:Partial<WorkoutLogSet>={}):WorkoutLogSet{return{id,workoutExerciseId,number:1,weight:50,reps:8,completed:true,...options};}
function data():DataSet{const d=seed();d.plans=[{id:'p',userId:'local',name:'Stesso titolo',description:'',createdAt:at,updatedAt:at,active:true,archived:false,program:{importId:'i',sourceName:'file.xlsx',sourceKind:'GT-1',startDate:'2026-11-02',endDate:'2026-11-09',weeks:2,fileHash:'a'.repeat(64),importedAt:at,sessionCount:2}},{id:'other',userId:'local',name:'Stesso titolo',description:'',createdAt:at,updatedAt:at,active:false,archived:false}];d.days=[{id:'d1',planId:'p',name:'Seduta',order:0,week:1,sessionDate:'2026-11-02'},{id:'d2',planId:'p',name:'Seduta',order:1,week:2,sessionDate:'2026-11-09'}];d.workouts=[workout('w'),workout('foreign','other')];d.workoutExercises=[exercise('e','w'),exercise('foreign-e','foreign')];d.sets=[set('work','e'),set('warmup','e',{kind:'warmup',weight:200,reps:20}),set('unconfirmed','e',{completed:false,weight:300}),set('foreign-set','foreign-e',{weight:500})];d.scheduledWorkouts=[{id:'s1',date:'2026-11-02',planId:'p',dayId:'d1',planName:'Stesso titolo',dayName:'Seduta',notes:'',workoutId:'w'},{id:'s2',date:'2026-11-09',planId:'p',dayId:'d2',planName:'Stesso titolo',dayName:'Seduta',notes:''}];return d;}
it('isolates plans with identical titles and counts only confirmed work sets from completed own sessions',()=>{
 const stats=buildPlanStatistics(data(),'p','2026-11-05');expect(stats.completedCount).toBe(1);expect(stats.expectedCount).toBe(2);expect(stats.completionPercentage).toBe(50);expect(stats.workSetCount).toBe(1);expect(stats.warmupSetCount).toBe(1);expect(stats.volume).toBe(400);expect(stats.repetitions).toBe(8);expect(stats.exercises[0].maxWeight).toBe(50);expect(stats.exercises[0].history).toHaveLength(1);expect(stats.pendingCount).toBe(1);
});
it('removes reopened drafts from finished metrics while preserving the open session count',()=>{
 const d=data();d.workouts[0].status='draft';const stats=buildPlanStatistics(d,'p','2026-11-05');expect(stats.completedCount).toBe(0);expect(stats.draftCount).toBe(1);expect(stats.volume).toBe(0);expect(stats.workSetCount).toBe(0);expect(stats.completionPercentage).toBe(0);expect(stats.sessions[0].status).toBe('draft');
});
it('retains cancelled intended days after an early finish without treating them as completed',()=>{
 const d=data();d.plans[0].completedAt=at;d.plans[0].completionReason='manual';d.scheduledWorkouts=d.scheduledWorkouts.filter(event=>event.id!=='s2');const stats=buildPlanStatistics(d,'p');expect(stats.expectedCount).toBe(2);expect(stats.completedCount).toBe(1);expect(stats.cancelledCount).toBe(1);expect(stats.completionPercentage).toBe(50);expect(stats.sessions.find(row=>row.key==='day:d2')?.status).toBe('cancelled');
});
it('does not invent missing durations or average them as zero',()=>{
 const d=data(),second=workout('w2','p','2026-11-09',0);second.dayId='d2';d.workouts.push(second);d.scheduledWorkouts[1].workoutId='w2';const stats=buildPlanStatistics(d,'p');expect(stats.completedCount).toBe(2);expect(stats.duration).toBe(45);expect(stats.averageDuration).toBe(45);expect(stats.missingDurationCount).toBe(1);expect(stats.completionPercentage).toBe(100);
});
it('keeps different machines and load modes separate and excludes unverified units from volume',()=>{
 const d=data();d.workoutExercises.push(exercise('machine','w',{machineSetup:{machine:'Altra macchina'}}),exercise('body','w',{loadMode:'bodyweight'}),exercise('assisted','w',{loadMode:'assisted'}),exercise('unclear','w',{loadUnit:'Da verificare'}));d.sets.push(set('machine-set','machine',{weight:60}),set('body-set','body',{weight:80}),set('assisted-set','assisted',{weight:20}),set('unclear-set','unclear',{weight:100}));const stats=buildPlanStatistics(d,'p');expect(stats.volume).toBe(880);expect(stats.workSetCount).toBe(5);expect(stats.excludedVolumeSetCount).toBe(3);expect(stats.exercises).toHaveLength(5);expect(stats.exercises.find(e=>e.mode==='bodyweight')?.maxWeight).toBeNull();expect(stats.exercises.find(e=>e.loadUnit==='Da verificare')?.volume).toBeNull();
});
it('does not invent a completion percentage for an unscheduled legacy plan',()=>{
 const d=data();delete d.plans[0].program;d.scheduledWorkouts=[];d.days=d.days.map(({week,sessionDate,...row})=>row);const stats=buildPlanStatistics(d,'p');expect(stats.expectedCount).toBeNull();expect(stats.completionPercentage).toBeNull();expect(stats.completedCount).toBe(1);
});
it('counts the same workout and set identifiers once even if a duplicate input is received',()=>{
 const d=data();d.workouts.push({...d.workouts[0]});d.sets.push({...d.sets[0]});d.scheduledWorkouts.push({...d.scheduledWorkouts[0],id:'duplicate-link'});const stats=buildPlanStatistics(d,'p');expect(stats.completedCount).toBe(1);expect(stats.completedScheduledCount).toBe(1);expect(stats.volume).toBe(400);expect(stats.workSetCount).toBe(1);
});
