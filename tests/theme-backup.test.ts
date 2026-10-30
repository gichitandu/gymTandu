import {expect,it} from 'vitest';
import {seed} from '../src/app/core/seed';
import {BACKUP_VERSION,exportBackup,importBackup,validateIntegrity} from '../src/app/services/backup';

it('round-trips the complete theme config without changing other saved data',async()=>{
 const data=seed(),themeConfig={palette:'ghiaccio',mode:'system' as const,background:'#E8F2FA',accent:'#2855C5'};
 data.settings[0].themeConfig=themeConfig;
 const text=await exportBackup(data),restored=await importBackup(text);
 expect(JSON.parse(text).schemaVersion).toBe(BACKUP_VERSION);
 expect(restored.settings[0].themeConfig).toEqual(themeConfig);
 expect(JSON.parse(await exportBackup(restored)).data).toEqual(JSON.parse(text).data);
});

it('migrates a v7 backup without requiring or adding a theme preference',async()=>{
 const data=seed(),backup=JSON.parse(await exportBackup(data));backup.schemaVersion=7;
 const restored=await importBackup(JSON.stringify(backup));
 expect(restored.settings[0].themeConfig).toBeUndefined();
 expect(JSON.parse(await exportBackup(restored)).data).toEqual(backup.data);
});

it('rejects invalid theme colors, modes, palettes, and unknown config properties',async()=>{
 const text=await exportBackup(seed());
 for(const invalid of [null,[],{}, {palette:'carbonio',mode:'auto'},{palette:'unknown',mode:'dark'},{palette:'carbonio',mode:'dark',accent:'red'},{palette:'carbonio',mode:'dark',background:'url(x)'},{palette:'carbonio',mode:'dark',unknown:true}]){
  const backup=JSON.parse(text);backup.data.settings[0].themeConfig=invalid;
  await expect(importBackup(JSON.stringify(backup))).rejects.toThrow('non validi');
  const data=seed();(data.settings[0] as any).themeConfig=invalid;
  expect(()=>validateIntegrity(data)).toThrow('tema non valido');
 }
});
