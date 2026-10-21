// Absolute timestamps keep the countdown correct when iOS suspends callbacks.
export function remainingSeconds(end:number,now:number){return Math.max(0,Math.ceil((end-now)/1000));}
export function formatSeconds(value:number){const seconds=Math.max(0,Math.floor(value));return `${Math.floor(seconds/60).toString().padStart(2,'0')}:${(seconds%60).toString().padStart(2,'0')}`;}
