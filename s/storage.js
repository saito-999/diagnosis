// localStorage state (same-tab scope is best-effort; browsers share storage across tabs)
const KEY = "love_diag_state_v1";

export function loadState(){
  try{
    const raw = localStorage.getItem(KEY);
    if(!raw) return null;
    return JSON.parse(raw);
  }catch{
    return null;
  }
}

export function saveState(state){
  try{
    localStorage.setItem(KEY, JSON.stringify(state));
  }catch{
    // ignore
  }
}

export function clearState(){
  try{ localStorage.removeItem(KEY); }catch{}
}
