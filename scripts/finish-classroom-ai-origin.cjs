const fs=require('fs'),file='dist/workspace-ai.js';let s=fs.readFileSync(file,'utf8');
s=s.replace('let dockMotion=null,dockExpanded=false,activeOrigin=trigger;','let dockMotion=null,dockExpanded=false,activeOrigin=trigger,lastOrigin=trigger;');
s=s.replace('await trigger.onclick({result:true});','await trigger.onclick({result:true,origin:lastOrigin?.isConnected&&lastOrigin.getClientRects().length?lastOrigin:trigger});');
s=s.replace('activeOrigin=event?.origin?.isConnected?event.origin:trigger;const from=', 'activeOrigin=event?.origin?.isConnected&&event.origin.getClientRects().length?event.origin:trigger;lastOrigin=activeOrigin;const from=');
fs.writeFileSync(file,s);
