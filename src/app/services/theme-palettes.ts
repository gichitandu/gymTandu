/** Complete personal themes. These values never contain account or workout data. */
export type ThemeMode = 'dark' | 'light' | 'system';
export interface ThemeConfig {palette:string;mode:ThemeMode;background?:string;accent?:string}
export interface ThemePalette {
 id:string;name:string;background:string;card:string;accent:string;text:string;muted:string;buttonText:string;tone:'dark'|'light';secondary?:string;tertiary?:string;
}
export interface ThemeTokens {
 background:string;card:string;raised:string;line:string;accent:string;accentText:string;text:string;muted:string;buttonText:string;light:boolean;accentSoft:string;secondary:string;tertiary:string;multicolor:boolean;
}
export const THEME_PRESETS:readonly ThemePalette[] = [
 {id:'oro',name:'Oro',background:'#16130D',card:'#292319',accent:'#DEC47E',secondary:'#F0DCA3',tertiary:'#BA9851',text:'#FAF5E8',muted:'#C5BAA2',buttonText:'#241B09',tone:'dark'},
 {id:'argento',name:'Argento',background:'#11161D',card:'#222B35',accent:'#CFD9E6',secondary:'#ECF2FA',tertiary:'#A6B5C8',text:'#F3F6FA',muted:'#B2BFCE',buttonText:'#15202E',tone:'dark'},
 {id:'multicolore',name:'Multicolore',background:'#131221',card:'#25243A',accent:'#F39AC7',secondary:'#8ABDFB',tertiary:'#7BDFC1',text:'#F8F6FF',muted:'#BDBBD3',buttonText:'#211326',tone:'dark'},
 {id:'bianco-elegante',name:'Bianco elegante',background:'#F8F7F3',card:'#FFFFFF',accent:'#715B3B',text:'#25262C',muted:'#65666D',buttonText:'#FFFFFF',tone:'light'},
 {id:'scuro',name:'Scuro',background:'#0E1014',card:'#1C2027',accent:'#A4B4CA',text:'#F3F5F8',muted:'#B0B8C5',buttonText:'#151D28',tone:'dark'},
 {id:'rosso',name:'Rosso',background:'#190E12',card:'#2D1A21',accent:'#F47780',text:'#FFF3F5',muted:'#D3B2BC',buttonText:'#2C1016',tone:'dark'},
 {id:'verde',name:'Verde',background:'#0D1711',card:'#1C2C22',accent:'#79D89E',text:'#F1F9F4',muted:'#B1C8BA',buttonText:'#10291B',tone:'dark'},
];
/** Saved themes and imported backups keep their original colours and IDs. */
export const THEME_PALETTES:readonly ThemePalette[] = [...THEME_PRESETS,
 {id:'viola-neon',name:'Viola Neon',background:'#151225',card:'#28223D',accent:'#CC70FF',text:'#F7F5FF',muted:'#B8BCD4',buttonText:'#160726',tone:'dark'},
 {id:'blu-azzurro',name:'Blu Azzurro',background:'#040C19',card:'#0C2036',accent:'#0DD9FF',text:'#F1FBFF',muted:'#A8C3D8',buttonText:'#031927',tone:'dark'},
 {id:'carbonio',name:'Carbonio',background:'#101416',card:'#1B2329',accent:'#7DE2C7',text:'#F4F7FA',muted:'#A9B7C3',buttonText:'#0E1A16',tone:'dark'},
 {id:'artico',name:'Artico',background:'#0D1725',card:'#18283D',accent:'#8CC8FF',text:'#F3F7FC',muted:'#A9BDD1',buttonText:'#0A1B2C',tone:'dark'},
 {id:'prugna',name:'Prugna',background:'#1D1424',card:'#2C2035',accent:'#F0A6A0',text:'#FCF5FB',muted:'#C7AFC9',buttonText:'#291622',tone:'dark'},
 {id:'petrolio',name:'Petrolio',background:'#0C1F22',card:'#153236',accent:'#70D6C5',text:'#F2FAF8',muted:'#A8C6C6',buttonText:'#0C2321',tone:'dark'},
 {id:'sabbia',name:'Sabbia',background:'#F6F1E7',card:'#FFFCF6',accent:'#946100',text:'#30291F',muted:'#716758',buttonText:'#FFFFFF',tone:'light'},
 {id:'ghiaccio',name:'Ghiaccio',background:'#F2F6FA',card:'#FFFFFF',accent:'#2855C5',text:'#16243A',muted:'#52647B',buttonText:'#FFFFFF',tone:'light'},
];
const hex = (value:unknown):value is string => typeof value==='string' && /^#[0-9a-fA-F]{6}$/.test(value);
export function validThemeConfig(value:unknown):value is ThemeConfig {
 if(!value||typeof value!=='object'||Array.isArray(value))return false;
 const config=value as Record<string,unknown>;
 return THEME_PALETTES.some(p=>p.id===config['palette']) && typeof config['mode']==='string' && ['dark','light','system'].includes(config['mode'])
  && (config['background']===undefined||hex(config['background'])) && (config['accent']===undefined||hex(config['accent']))
  && Object.keys(config).every(key=>['palette','mode','background','accent'].includes(key));
}
function channels(color:string){return [1,3,5].map(position=>parseInt(color.slice(position,position+2),16));}
function luminance(color:string){return channels(color).map(value=>{const v=value/255;return v<=.04045?v/12.92:((v+.055)/1.055)**2.4;}).reduce((sum,v,index)=>sum+v*[.2126,.7152,.0722][index],0);}
/** WCAG relative-luminance contrast, not the visual brightness of an RGB sum. */
export function contrastRatio(first:string,second:string):number {
 if(!hex(first)||!hex(second))return 0;
 const a=luminance(first),b=luminance(second);return (Math.max(a,b)+.05)/(Math.min(a,b)+.05);
}
function mix(first:string,second:string,weight:number){const a=channels(first),b=channels(second);return '#'+a.map((v,index)=>Math.round(v+(b[index]-v)*weight).toString(16).padStart(2,'0')).join('').toUpperCase();}
function leastContrast(color:string,surfaces:string[]){return Math.min(...surfaces.map(surface=>contrastRatio(color,surface)));}
function readable(preferred:string,surfaces:string[],ink:string){
 if(leastContrast(preferred,surfaces)>=4.5)return preferred;
 for(let step=1;step<=100;step++){const color=mix(preferred,ink,step/100);if(leastContrast(color,surfaces)>=4.5)return color;}
 return ink;
}
export function resolveTheme(config:ThemeConfig,systemLight:boolean):ThemeTokens {
 const safe:ThemeConfig=validThemeConfig(config)?config:{palette:'carbonio',mode:'dark' as const};
 const palette=THEME_PALETTES.find(p=>p.id===safe.palette)!;
 const modeLight=safe.mode==='system'?systemLight:safe.mode==='light';
 const natural=modeLight===(palette.tone==='light');
 const background=safe.background?.toUpperCase() || (natural?palette.background:modeLight?mix(palette.background,'#FFFFFF',.96):mix('#101416',palette.background,.06));
 // A custom background is an explicit choice, so its readable foreground wins
 // over the requested mode. It is never silently replaced by another color.
 const light=safe.background?contrastRatio(background,'#000000')>=contrastRatio(background,'#FFFFFF'):modeLight;
 const ink=light?'#000000':'#FFFFFF';
 let card=natural&&!safe.background?palette.card:mix(background,'#FFFFFF',light?.12:.08);
 if(contrastRatio(card,ink)<4.5)card=background;
 let raised=mix(card,light?'#000000':'#FFFFFF',.06);
 if(contrastRatio(raised,ink)<4.5)raised=card;
 const surfaces=[background,card,raised];
 const sameTone=light===(palette.tone==='light');
 const preferredText=sameTone?palette.text:light?'#16243A':'#F4F7FA';
 const preferredMuted=sameTone?palette.muted:light?'#52647B':'#A9B7C3';
 const text=readable(preferredText,surfaces,ink),muted=readable(preferredMuted,surfaces,ink);
 const accent=safe.accent?.toUpperCase()||palette.accent;
 const buttonInk=contrastRatio(accent,'#000000')>=contrastRatio(accent,'#FFFFFF')?'#000000':'#FFFFFF';
 const buttonText=contrastRatio(palette.buttonText,accent)>=4.5?palette.buttonText:buttonInk;
 const accentText=readable(accent,surfaces,ink);
 const secondary=safe.accent?accent:palette.secondary||accent;
 const tertiary=safe.accent?accent:palette.tertiary||secondary;
 return {background,card,raised,line:mix(card,text,light?.26:.2),accent,accentText,text,muted,buttonText,light,accentSoft:`color-mix(in srgb, ${accent} ${light?'12%':'15%'}, ${card})`,secondary,tertiary,multicolor:palette.id==='multicolore'&&!safe.accent};
}
