const fs=require('fs'),path='dist/mentor-arrival.js';let s=fs.readFileSync(path,'utf8');
s=s.replace('endCamera.copy(safeCameraPoint(endCamera));','endCamera.copy(station?withWalkingClearance(()=>safeCameraPoint(endCamera)):safeCameraPoint(endCamera));');
s=s.replace('const destination=safeCameraPoint(endCamera.clone().add(new T.Vector3(0,lift,0))),shot=', 'const desired=endCamera.clone().add(new T.Vector3(0,lift,0)),destination=station?withWalkingClearance(()=>safeCameraPoint(desired)):safeCameraPoint(desired),shot=');
fs.writeFileSync(path,s);
