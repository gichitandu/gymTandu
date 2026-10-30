import {describe,it,expect} from 'vitest';
import {THEME_PALETTES,contrastRatio,resolveTheme,validThemeConfig} from '../src/app/services/theme-palettes';
function readable(tokens:ReturnType<typeof resolveTheme>){
 for(const surface of [tokens.background,tokens.card,tokens.raised]){
  expect(contrastRatio(tokens.text,surface)).toBeGreaterThanOrEqual(4.5);
  expect(contrastRatio(tokens.muted,surface)).toBeGreaterThanOrEqual(4.5);
  expect(contrastRatio(tokens.accentText,surface)).toBeGreaterThanOrEqual(4.5);
 }
 expect(contrastRatio(tokens.buttonText,tokens.accent)).toBeGreaterThanOrEqual(4.5);
}
describe('complete personal theme palettes',()=>{
 it('retains all six approved backgrounds, surfaces and accent colors in their natural mode',()=>{
  expect(THEME_PALETTES.map(p=>p.id)).toEqual(['carbonio','artico','prugna','petrolio','sabbia','ghiaccio']);
  for(const palette of THEME_PALETTES){const tokens=resolveTheme({palette:palette.id,mode:palette.tone},false);expect(tokens.background).toBe(palette.background);expect(tokens.card).toBe(palette.card);expect(tokens.accent).toBe(palette.accent);expect(tokens.text).toBe(palette.text);readable(tokens);}
 });
 it('adapts every palette for dark, light and system modes while preserving its accent',()=>{
  for(const palette of THEME_PALETTES)for(const mode of ['dark','light','system'] as const)for(const systemLight of [true,false]){
   const tokens=resolveTheme({palette:palette.id,mode},systemLight);expect(tokens.light).toBe(mode==='system'?systemLight:mode==='light');expect(tokens.accent).toBe(palette.accent);readable(tokens);
  }
 });
 it('keeps custom backgrounds and corrects text and button contrast even for midtones or equal accent/background',()=>{
  for(const background of ['#000000','#FFFFFF','#777777','#747474','#808000','#FF00FF','#00FF00','#FF0000','#2855C5','#9b8b4f'])for(const accent of ['#000000','#FFFFFF','#777777','#FF0000',background]){
   const tokens=resolveTheme({palette:'carbonio',mode:'system',background,accent},true);expect(tokens.background).toBe(background.toUpperCase());expect(tokens.accent).toBe(accent.toUpperCase());readable(tokens);
  }
 });
 it('validates settings strictly and falls back safely for malformed persisted values',()=>{
  expect(validThemeConfig({palette:'carbonio',mode:'dark'})).toBe(true);
  expect(validThemeConfig({palette:'ghiaccio',mode:'system',background:'#f2f6fa',accent:'#2855c5'})).toBe(true);
  for(const value of [null,[],{},'dark',{palette:'unknown',mode:'dark'},{palette:'artico',mode:'automatic'},{palette:'artico',mode:['dark']},{palette:'artico',mode:'dark',accent:'red'},{palette:'artico',mode:'dark',background:'url(https://other.test)'},{palette:'artico',mode:'dark',admin:true}])expect(validThemeConfig(value)).toBe(false);
  readable(resolveTheme({palette:'unknown',mode:'dark'},false));
 });
 it('uses linearized sRGB for black, white and gray contrast',()=>{
  expect(contrastRatio('#000000','#FFFFFF')).toBe(21);expect(contrastRatio('#777777','#FFFFFF')).toBeCloseTo(4.48,2);expect(contrastRatio('red','#FFFFFF')).toBe(0);
 });
});

it('keeps accent fill intact while adapting link and navigation text to the surrounding surfaces',()=>{
 for(const config of [
  {palette:'artico',mode:'light' as const},
  {palette:'ghiaccio',mode:'dark' as const},
  {palette:'carbonio',mode:'dark' as const,background:'#777777',accent:'#777777'},
  {palette:'ghiaccio',mode:'light' as const,background:'#FFFFFF',accent:'#FFFFFF'},
 ]){
  const tokens=resolveTheme(config,false);const palette=THEME_PALETTES.find(p=>p.id===config.palette)!;
  expect(tokens.accent).toBe(config.accent||palette.accent);
  expect(tokens.accentText).not.toBe(tokens.accent);
  readable(tokens);
 }
});
