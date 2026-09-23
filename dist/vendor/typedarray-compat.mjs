// PDF.js calls these APIs in both the document and worker realms.
for(const Type of [Map,WeakMap]){
 if(typeof Type.prototype.getOrInsertComputed!=='function')Object.defineProperty(Type.prototype,'getOrInsertComputed',{configurable:true,writable:true,value:function(key,callback){
  if(typeof callback!=='function')throw new TypeError('callback must be a function');
  if(this.has(key))return this.get(key);
  const value=callback(key);this.set(key,value);return value;
 }});
 if(typeof Type.prototype.getOrInsert!=='function')Object.defineProperty(Type.prototype,'getOrInsert',{configurable:true,writable:true,value:function(key,value){
  if(this.has(key))return this.get(key);this.set(key,value);return value;
 }});
}
if(typeof Uint8Array.prototype.toHex!=='function')Object.defineProperty(Uint8Array.prototype,'toHex',{configurable:true,writable:true,value:function(){return Array.from(this,byte=>byte.toString(16).padStart(2,'0')).join('');}});
