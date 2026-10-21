import { inject } from '@angular/core';
import { CanDeactivateFn } from '@angular/router';
import { FormDraftService } from './form-drafts';

export const preserveFormDrafts: CanDeactivateFn<unknown> = async component => {
  const drafts=inject(FormDraftService);
  const form=component as {canLeave?:()=>boolean|Promise<boolean>};
  if(form?.canLeave&&!await form.canLeave())return false;
  return drafts.flushAll();
};
