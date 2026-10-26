import {expect,it} from 'vitest';
import {seed} from '../src/app/core/seed';
import {cloneForEdit} from '../src/app/services/edit-snapshot';
it('keeps image identity across unrelated edits while isolating mutable data',()=>{
 const original=seed();const image=new Blob(['photo'],{type:'image/png'});original.exercises[0].image=image;original.profiles[0].photo=image;
 const first=cloneForEdit(original);first.exercises[0].name='Nome modificato';first.exercises[0].tags.push('nuovo');first.profiles[0].name='Altro nome';
 expect(first.exercises[0].image).toBe(image);expect(first.profiles[0].photo).toBe(image);
 expect(original.exercises[0].name).not.toBe('Nome modificato');expect(original.exercises[0].tags).not.toContain('nuovo');expect(original.profiles[0].name).not.toBe('Altro nome');
 const second=cloneForEdit(first);expect(second.exercises[0].image).toBe(image);
 const replacement=new Blob(['new'],{type:'image/png'});second.exercises[0].image=replacement;expect(first.exercises[0].image).toBe(image);expect(second.exercises[0].image).toBe(replacement);
});
