import {CalendarEventOptions,ScheduledWorkout} from '../models/domain';

const kinds=['workout','cardio','mobility','rest','other'];
export function validCalendarDate(value:unknown):value is string {
 if(typeof value!=='string'||!/^\d{4}-\d{2}-\d{2}$/.test(value))return false;
 const stamp=Date.parse(value+'T12:00:00Z');return Number.isFinite(stamp)&&new Date(stamp).toISOString().slice(0,10)===value;
}
/** Validate both legacy workout snapshots and the additive calendar-only fields. */
export function validateCalendarEvent(value:ScheduledWorkout):void {
 const event=value as unknown as Record<string,unknown>,kind=event['kind']===undefined?'workout':event['kind'];
 const text=(key:string,max:number,required=false)=>typeof event[key]==='string'&&(event[key] as string).length<=max&&(!required||!!(event[key] as string).trim());
 if(!kinds.includes(kind as string)||!text('id',150,true)||!validCalendarDate(event['date'])||!text('dayName',200,true)||!text('notes',kind==='workout'?10000:2000))throw Error('Evento calendario non valido.');
 if(!text('planId',150,kind==='workout')||!text('dayId',150,kind==='workout')||!text('planName',200,kind==='workout'))throw Error('Riferimenti del calendario non validi.');
 if(kind!=='workout'&&(event['workoutId']!==undefined||event['planId']!==''||event['dayId']!==''||event['planName']!==''))throw Error('Un’attività del calendario non può modificare gli allenamenti.');
 if(event['workoutId']!==undefined&&!text('workoutId',150,true))throw Error('Allenamento collegato non valido.');
 if(event['time']!==undefined&&(typeof event['time']!=='string'||!/^([01]\d|2[0-3]):[0-5]\d$/.test(event['time'])))throw Error('Orario non valido: usa ore e minuti.');
 if(event['durationMinutes']!==undefined&&(typeof event['durationMinutes']!=='number'||!Number.isFinite(event['durationMinutes'])||event['durationMinutes']<=0||event['durationMinutes']>1440))throw Error('Durata non valida: usa da 1 a 1440 minuti.');
 if(event['estimatedCalories']!==undefined&&(typeof event['estimatedCalories']!=='number'||!Number.isFinite(event['estimatedCalories'])||event['estimatedCalories']<0||event['estimatedCalories']>20000))throw Error('Stima calorie non valida.');
 if(event['done']!==undefined&&(typeof event['done']!=='boolean'||kind==='workout'||kind==='rest'))throw Error('Stato dell’attività non valido.');
}
export function calendarEventOptions(value:CalendarEventOptions):CalendarEventOptions {
 if(!value||typeof value!=='object'||Array.isArray(value)||Object.keys(value).some(key=>!['time','durationMinutes','estimatedCalories'].includes(key)))throw Error('Dettagli del calendario non validi.');
 const result:CalendarEventOptions={};
 if(value.time!==undefined&&value.time!=='')result.time=value.time;
 if(value.durationMinutes!==undefined)result.durationMinutes=value.durationMinutes;
 if(value.estimatedCalories!==undefined)result.estimatedCalories=value.estimatedCalories;
 return result;
}
export function existingCalendarOptions(value:ScheduledWorkout|undefined):CalendarEventOptions {
 return value?calendarEventOptions({time:value.time,durationMinutes:value.durationMinutes,estimatedCalories:value.estimatedCalories}):{};
}
export function calendarWorkoutDuplicate(events:ScheduledWorkout[],candidate:Pick<ScheduledWorkout,'id'|'date'|'dayId'|'time'>):boolean {
 return events.some(event=>(event.kind??'workout')==='workout'&&event.id!==candidate.id&&event.date===candidate.date&&event.dayId===candidate.dayId&&(!event.time||!candidate.time||event.time===candidate.time));
}
