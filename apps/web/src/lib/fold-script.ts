/**
 * Inline <head> script, run before the page paints so nothing flickers:
 * - restores collapsed panels (see lib/fold.ts)
 * - restores the interface style (see lib/ui-theme.ts; only known ids are applied)
 * Kept out of the client modules so the server gets the plain string.
 */
export const FOLD_SCRIPT = `try{var d=document.documentElement;for(const n of ["sidebar","labnav"]){if(localStorage.getItem("fold:"+n)==="collapsed")d.setAttribute("data-"+n,"collapsed")}var u=localStorage.getItem("ui-theme");if(u==="cinema"||u==="ledger"||u==="pop")d.setAttribute("data-ui",u)}catch(e){}`;
