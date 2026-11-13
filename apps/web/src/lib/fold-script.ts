/** Inline <head> script: restores collapsed panels (see lib/fold.ts) before the page paints. Kept out of the client module so the server gets the string. */
export const FOLD_SCRIPT = `try{for(const n of ["sidebar","labnav"]){if(localStorage.getItem("fold:"+n)==="collapsed")document.documentElement.setAttribute("data-"+n,"collapsed")}}catch(e){}`;
