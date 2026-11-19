// Keep a walking lecturer in a full-height shot even inside narrow garden paths.
// Do not pull the lens towards the subject when a wall blocks a requested orbit.
export function minimumLectureFov(distance,aspect,base=48){
 const vertical=1.35,horizontal=1.25/Math.max(.35,aspect);
 return Math.max(base,Math.min(96,2*Math.atan(Math.max(vertical,horizontal)/Math.max(.6,distance))*180/Math.PI));
}
export function keepLectureDistance(previous,desired,target,resolve,minDistance=3.4){
 const safe=resolve(target,desired);
 if(safe.distanceTo(target)>=minDistance)return safe;
 // A blocked zoom-out must not turn into an automatic zoom-in to the face.
 return previous.distanceTo(target)>=safe.distanceTo(target)?previous.clone():safe;
}
