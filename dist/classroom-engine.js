// One executor for generated lessons and live classroom replies.
export const classroomActionTypes=Object.freeze('spotlight laser play_video speech wb_open wb_draw_text wb_draw_shape wb_draw_chart wb_draw_latex wb_draw_table wb_draw_line wb_draw_code wb_edit_code wb_clear wb_delete wb_close discussion widget_highlight widget_setState widget_annotation widget_reveal music-listen music-seek music-pause music-stop music-tempo music-solo music-mix music-volume music-view material-play scene-jump'.split(' '));
export async function executeClassroomAction(action,host){
 if(!classroomActionTypes.includes(action.type))throw Error('课堂动作未接入：'+action.type);
 if(!host.current())throw Error('课堂已切换，已停止旧课堂操作');
 const {call}=host;
 switch(action.type){
  case 'music-listen':return host.listen(action);
  case 'music-seek':return call('ai-seek-measure',{measure:action.startMeasure});
  case 'music-pause':return host.player()?.playing?call('ai-transport',{command:'pause'}):{playing:false};
  case 'music-stop':return call('ai-transport',{command:'stop'});
  case 'music-tempo':return call('ai-set-tempo',{value:action.bpm});
  case 'music-solo':return call('ai-solo-group',{ids:action.ids});
  case 'music-mix':return call('ai-solo-group',{ids:(host.score()?.parts||host.score()?.midiParts||[]).map(p=>String(p.value??p.id))});
  case 'music-volume':return call('ai-part-volume',{value:{part:action.part,value:action.value}});
  case 'music-view':return call('ai-set-view',{mode:action.mode});
  case 'material-play':return host.playMaterial(action.materialId);
  case 'scene-jump':return host.jump(action.index);
  case 'speech':return host.speak(action.text);
  default:return host.visual().apply(action);
 }
}
