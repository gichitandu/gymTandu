import {AppSettings} from '../models/domain';
export function backupReminder(settings:AppSettings,now=Date.now()){
 const days=settings.backupReminderDays??7,last=settings.backupConfirmedAt?Date.parse(settings.backupConfirmedAt):undefined,snooze=settings.backupSnoozedUntil?Date.parse(settings.backupSnoozedUntil):0;
 const due=days!==0&&!(snooze>now)&&(last===undefined||!Number.isFinite(last)||now-last>=days*86400000);
 return {due,days,ageDays:last!==undefined&&Number.isFinite(last)?Math.max(0,Math.floor((now-last)/86400000)):undefined};
}
