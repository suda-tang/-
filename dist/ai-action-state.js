// Idempotent controls succeed when their requested state is already applied.
export function targetReached(action, state) {
 const value=String(action.value??'');
 switch(action.type){
  case 'panel': return state.panel===value;
  case 'view': return state.viewMode===value;
  case 'open': return !!value&&state.scoreId===value;
  case 'solo': return state.solo===value;
  case 'set_tempo': return Number(state.tempo)===Number(value);
  case 'set_instrument': return state.instrument===value;
  case 'set_arrangement': return state.arrangement===value;
  case 'set_metronome': return state.metronome===/^(1|on|true|开|开启|打开|启用|是|yes)$/i.test(value);
  case 'mute': return value!=='all'&&Array.isArray(state.muted)&&state.muted.includes(value);
  case 'unmute': return Array.isArray(state.muted)&&(value==='all'?state.muted.length===0:!state.muted.includes(value));
  default: return false;
 }
}
