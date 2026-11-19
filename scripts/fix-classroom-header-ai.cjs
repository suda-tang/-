const fs=require('fs');
function edit(file,from,to){const s=fs.readFileSync(file,'utf8');if(s.includes(to))return;if(!s.includes(from))throw Error('Missing edit '+file+': '+from.slice(0,90));fs.writeFileSync(file,s.replace(from,to));}
const classroom='dist/score-classroom.js';
edit(classroom,"expand.classList.remove('classroom-minimize');$('.classroom-heading').append(expand);", "expand.classList.remove('classroom-minimize');headingActions.append(expand);");
edit(classroom,"container.classList.add('classroom-fullscreen');document.body.append(expand);", "container.classList.add('classroom-fullscreen');headingActions.append(expand);");
edit(classroom,"container.append(agentLaunch);", "const headingActions=el('div',null,'classroom-heading-actions');headingActions.append(agentLaunch,expand);$('.classroom-heading').append(headingActions);");
const ai='dist/workspace-ai.js';
edit(ai,'let dockMotion=null,dockExpanded=false;', 'let dockMotion=null,dockExpanded=false,activeOrigin=trigger;');
edit(ai,'const style=getComputedStyle(trigger);label.style.font=', 'const style=getComputedStyle(activeOrigin?.isConnected?activeOrigin:trigger);label.style.font=');
edit(ai,"transitioning=true;animateDock(false);const from=dialog.getBoundingClientRect();input.blur();const to=trigger.getBoundingClientRect();", "transitioning=true;if(activeOrigin===trigger)animateDock(false);const from=dialog.getBoundingClientRect();input.blur();const originBounds=activeOrigin?.isConnected?activeOrigin.getBoundingClientRect():null,returnOrigin=originBounds?.width&&originBounds?.height?activeOrigin:trigger;const to=returnOrigin.getBoundingClientRect();");
edit(ai,"dialog.close();trigger.style.opacity='';},true);", "dialog.close();trigger.style.opacity='';returnOrigin.style.opacity='';},true);");
edit(ai,"trigger.style.opacity='';trigger.focus({preventScroll:true});transitioning=false;", "trigger.style.opacity='';if(activeOrigin?.isConnected)activeOrigin.style.opacity='';returnOrigin.focus({preventScroll:true});activeOrigin=trigger;transitioning=false;");
edit(ai,"try{const from=(event?.origin||trigger).getBoundingClientRect();", "try{activeOrigin=event?.origin?.isConnected?event.origin:trigger;const from=activeOrigin.getBoundingClientRect();");
edit(ai,"trigger.style.opacity='0';animateDock(true);", "trigger.style.opacity='0';activeOrigin.style.opacity='0';if(activeOrigin===trigger)animateDock(true);");
edit(ai,"trigger.style.opacity='';animateDock(false);}finally{dialog.style.opacity='';", "trigger.style.opacity='';if(activeOrigin?.isConnected)activeOrigin.style.opacity='';if(activeOrigin===trigger)animateDock(false);activeOrigin=trigger;}finally{dialog.style.opacity='';");
