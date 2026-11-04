import {it,expect} from 'vitest';
import {seed} from '../src/app/core/seed';
import {buildTrainingInsights,upcomingCalendarReminders} from '../src/app/services/training-insights';
import {trainingReportCsv} from '../src/app/services/training-report';
import {DataSet} from '../src/app/models/domain';

function fixture():DataSet {
 const d=seed();
 d.plans.push({id:'plan',userId:'local',name:'Forza',description:'',active:true,archived:false,createdAt:'2026-10-01T10:00:00Z',updatedAt:'2026-10-01T10:00:00Z'});
 d.days.push({id:'day',planId:'plan',name:'Giorno A',order:0});
 d.planExercises.push({id:'planned',dayId:'day',exerciseId:'exercise-0',sets:3,repsMin:8,repsMax:10,rest:90,notes:'',order:0});
 for(const [id,date,reps] of [['old','2026-10-25',8],['new','2026-11-01',10]] as const){
  d.workouts.push({id,userId:'local',planId:'plan',dayId:'day',planName:'Forza',dayName:'Giorno A',date,startedAt:date+'T10:00:00Z',duration:35,status:'completed',notes:''});
  d.workoutExercises.push({id:'e-'+id,workoutId:id,exerciseId:'exercise-0',name:'Panca',loadMode:'external',order:0,rest:90,notes:''});
  for(let n=1;n<=3;n++)d.sets.push({id:id+'-'+n,workoutExerciseId:'e-'+id,number:n,weight:50,reps,rpe:7,completed:true});
 }
 d.exercisePreferences.push({id:'exercise-0',favorite:true,weightStep:1.25});
 d.scheduledWorkouts.push({id:'next',date:'2026-11-05',planId:'plan',dayId:'day',planName:'Forza',dayName:'Giorno A',notes:'',kind:'workout'});
 return d;
}
it('calculates 28-day metrics and suggests only explainable, read-only load changes',()=>{
 const d=fixture(),original=JSON.stringify(d),insights=buildTrainingInsights(d,'2026-11-04');
 expect(insights.recent.workouts).toBe(2);
 expect(insights.recent.completedWorkSets).toBe(6);
 expect(insights.recent.externalVolumeKg).toBe(2700);
 expect(insights.sessionsDifference).toBeNull();
 expect(insights.suggestions).toHaveLength(1);
 expect(insights.suggestions[0]).toMatchObject({oldWeightKg:50,suggestedWeightKg:51.25});
 expect(JSON.stringify(d)).toBe(original);
});
it('avoids recommendations without RPE, with a changed machine setup or insufficient sessions',()=>{
 const d=fixture();
 d.sets.find(s=>s.id==='new-1')!.rpe=undefined;
 expect(buildTrainingInsights(d,'2026-11-04').suggestions).toHaveLength(0);
 d.sets.find(s=>s.id==='new-1')!.rpe=7;
 d.workoutExercises[1].machineSetup={machine:'Press B'};
 expect(buildTrainingInsights(d,'2026-11-04').suggestions).toHaveLength(0);
 d.workoutExercises.pop();
 expect(buildTrainingInsights(d,'2026-11-04').suggestions).toHaveLength(0);
 const other=fixture();
 other.sets.push({id:'unfinished',workoutExerciseId:'e-new',number:4,weight:50,reps:0,completed:false});
 expect(buildTrainingInsights(other,'2026-11-04').suggestions).toHaveLength(0);
});
it('shows upcoming schedule reminders without duplicates for completed sessions',()=>{
 const d=fixture();
 expect(upcomingCalendarReminders(d,'2026-11-04').map(x=>x.id)).toEqual(['next']);
 d.scheduledWorkouts[0].workoutId='new';
 expect(upcomingCalendarReminders(d,'2026-11-04')).toHaveLength(0);
 d.scheduledWorkouts[0].workoutId=undefined;
 expect(upcomingCalendarReminders(d,'2026-11-06')).toHaveLength(0);
});
it('exports UTF-8 CSV offline, excludes warmups and escapes spreadsheet formulas',()=>{
 const d=fixture(),workout=d.workouts[1];
 workout.planName='=HYPERLINK("https://unsafe.test")';
 workout.notes='Nuova riga\ncon nota';
 d.sets.push({id:'warmup',workoutExerciseId:'e-new',number:0,weight:20,reps:10,completed:true,kind:'warmup'});
 const csv=trainingReportCsv(d,[workout]);
 expect(csv.startsWith('\ufeffsep=;')).toBe(true);
 expect(csv).toContain("'=HYPERLINK");
 expect(csv).toContain('Nuova riga con nota');
 expect(csv).not.toContain('"20";"10"');
 expect(csv.split('\r\n')).toHaveLength(6);
 expect(d.workouts[1].notes).toContain('\n');
});
