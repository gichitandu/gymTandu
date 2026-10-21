import { Exercise } from '../models/domain';
// One-time cleanup: future administrator-supplied HTTPS links remain editable.
export function clearLegacyYoutube(exercise:Exercise){
 const youtube=(url?:string)=>{try{const host=new URL(url||'').hostname.toLowerCase();return ['youtube.com','youtu.be','youtube-nocookie.com'].some(domain=>host===domain||host.endsWith('.'+domain));}catch{return false;}};
 if(youtube(exercise.videoUrl)){exercise.videoUrl='';delete exercise.videoTitle;delete exercise.videoChannel;}
 if(exercise.thumbnailUrl){try{const host=new URL(exercise.thumbnailUrl).hostname.toLowerCase();if(host==='ytimg.com'||host.endsWith('.ytimg.com')||host==='ggpht.com'||host.endsWith('.ggpht.com'))exercise.thumbnailUrl='';}catch{}}
 exercise.description=exercise.description.replace('Guarda il video dimostrativo per la posizione di partenza e il movimento. ','');
 return exercise;
}
