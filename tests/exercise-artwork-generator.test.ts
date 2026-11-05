import {describe,it,expect} from 'vitest';
import {execFileSync} from 'node:child_process';
import {existsSync} from 'node:fs';

describe('QA artwork generation gating',()=>{
 it('prints a dry-run plan without credentials, network calls or generated images',()=>{
   const output=execFileSync(process.execPath,['tools/qa/generate-artwork.mjs','--limit','3'],{
     encoding:'utf8',env:{...process.env,OPENAI_API_KEY:''},timeout:10000,
   });
   expect(output).toContain('DRY RUN (no API calls)');
   expect(output).toContain('"count":3');
   expect(output).toContain('exercise-1');
   expect(existsSync('tmp/qa-artwork-unreviewed')).toBe(false);
 });
 it('requires a real catalog ID',()=>{
   expect(()=>execFileSync(process.execPath,['tools/qa/generate-artwork.mjs','--id','not-an-exercise-id'],{
     encoding:'utf8',stdio:['ignore','pipe','pipe'],timeout:10000,
   })).toThrow();
 });
});
