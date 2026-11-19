import assert from 'node:assert/strict';
import * as T from '../dist/vendor/three/three.module.js';
import {minimumLectureFov,keepLectureDistance} from '../dist/mentor-shot-framing.js';
import {captureDepartingBoard} from '../dist/mentor-board-transition.js';
import {isCartoonMentor} from '../dist/mentor-identity.js';
for(const [lang,expected]of [['zh',true],['zh-CN',true],['zh-Hans',true],['zh-Hans-CN',true],['zh-Hant',false],['zh-TW',false],['zh-HK',false],['yue',false],['yue-HK',false],['en',false]]){
 globalThis.location={search:'?tour=1&avatar=cartoon&lang='+lang};assert.equal(isCartoonMentor(),expected,lang);
}
assert.ok(minimumLectureFov(1.75,.46,52)>85);
assert.equal(minimumLectureFov(8,1.6,48),48);
const prior=new T.Vector3(0,2,8),desired=new T.Vector3(0,2,5),target=new T.Vector3(0,2,0);
assert.equal(keepLectureDistance(prior,desired,target,()=>new T.Vector3(0,2,.7)).z,8);
const scene=new T.Scene(),owner=new T.Group(),board=new T.Group(),material=new T.MeshBasicMaterial();board.add(new T.Mesh(new T.PlaneGeometry(1,1),material));owner.add(board);scene.add(owner);
const outgoing=captureDepartingBoard(board,scene),copy=scene.getObjectByName('departing-lecture-board');outgoing.update(.3);assert.ok(copy.position.y>0&&copy.position.y<3.2);assert.ok(copy.children[0].material.opacity<1);assert.equal(material.opacity,1);outgoing.update(.65);assert.equal(copy.parent,null);assert.equal(board.parent,owner);
console.log('PASS: 10 locale cases, full-height framing, blocked-orbit distance, board ownership/fade/disposal');
