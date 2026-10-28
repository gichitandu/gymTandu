/** A recovery may fetch fresh HTML once, then normal cached launches must resume. */
export function restoreOfflineLaunchUrl(target:Pick<Window,'location'|'history'>=window):boolean{
 try{
  const url=new URL(target.location.href);
  const bypass=[...url.searchParams.keys()].filter(key=>key.toLowerCase()==='ngsw-bypass');
  if(!bypass.length)return false;
  for(const key of bypass)url.searchParams.delete(key);
  target.history.replaceState(target.history.state,'',url.pathname+url.search+url.hash);
  return true;
 }catch{return false;}
}
