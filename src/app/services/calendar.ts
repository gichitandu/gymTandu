import { localDate } from '../models/domain';
export type CalendarView='day'|'week'|'month';
export function parseLocalDate(value:string){const d=new Date(value+'T12:00:00');if(!/^\d{4}-\d{2}-\d{2}$/.test(value)||!Number.isFinite(d.getTime())||localDate(d)!==value)throw Error('Data non valida.');return d;}
export function moveDate(value:string,days:number){const d=parseLocalDate(value);d.setDate(d.getDate()+days);return localDate(d);}
export function calendarDays(value:string,view:CalendarView){const anchor=parseLocalDate(value);if(view==='day')return [value];const start=new Date(anchor);if(view==='month')start.setDate(1);start.setDate(start.getDate()-((start.getDay()+6)%7));return Array.from({length:view==='month'?42:7},(_,i)=>moveDate(localDate(start),i));}
export function movePeriod(value:string,view:CalendarView,direction:number){if(view!=='month')return moveDate(value,direction*(view==='week'?7:1));const d=parseLocalDate(value),day=d.getDate();d.setDate(1);d.setMonth(d.getMonth()+direction);const end=new Date(d.getFullYear(),d.getMonth()+1,0,12).getDate();d.setDate(Math.min(day,end));return localDate(d);}
