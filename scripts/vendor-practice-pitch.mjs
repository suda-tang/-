// Run after installing the pinned build-only dependencies under
// .sites-runtime/pitch-build. Does not rebuild or overwrite the authored client.
import {createRequire} from 'node:module';
import {mkdir,copyFile,cp,readFile,writeFile} from 'node:fs/promises';
import path from 'node:path';
import {createHash} from 'node:crypto';
const cwd=process.cwd(),deps=path.join(cwd,'.sites-runtime/pitch-build/node_modules');
const require=createRequire(path.join(deps,'_build.cjs'));
const {build}=require('esbuild');
const basicRequire=createRequire(require.resolve('@spotify/basic-pitch/package.json'));
const target=path.join(cwd,'dist/vendor/basic-pitch');await mkdir(target,{recursive:true});
await build({entryPoints:[path.join(cwd,'scripts/pitch-worker-entry.js')],outfile:path.join(target,'worker.js'),bundle:true,format:'iife',platform:'browser',target:'es2020',nodePaths:[deps],alias:{'@tensorflow/tfjs':basicRequire.resolve('@tensorflow/tfjs')},minify:!process.argv.includes('--debug'),legalComments:'linked'});
const basic=path.dirname(require.resolve('@spotify/basic-pitch/package.json'));
await cp(path.join(basic,'model'),path.join(target,'model'),{recursive:true});
await copyFile(path.join(basic,'LICENSE'),path.join(target,'LICENSE.basic-pitch'));
for(const name of ['tfjs','tfjs-backend-wasm']){
 const dir=path.dirname((name==='tfjs'?basicRequire:require).resolve('@tensorflow/'+name+'/package.json'));
 try{await copyFile(path.join(dir,'LICENSE'),path.join(target,'LICENSE.'+name));}catch(error){const pkg=JSON.parse(await readFile(path.join(dir,'package.json'),'utf8'));if(error.code!=='ENOENT'||pkg.license!=='Apache-2.0')throw error;await copyFile(path.join(target,'LICENSE.basic-pitch'),path.join(target,'LICENSE.'+name));}
 if(name.endsWith('wasm'))for(const file of ['tfjs-backend-wasm.wasm','tfjs-backend-wasm-simd.wasm','tfjs-backend-wasm-threaded-simd.wasm'])await copyFile(path.join(dir,'dist',file),path.join(target,file));
}
console.log('Vendored Basic Pitch 1.0.1; tfjs/wasm '+JSON.parse(await readFile(basicRequire.resolve('@tensorflow/tfjs/package.json'),'utf8')).version);
const files=['worker.js','worker.js.LEGAL.txt','model/model.json','model/group1-shard1of1.bin','tfjs-backend-wasm.wasm','tfjs-backend-wasm-simd.wasm','tfjs-backend-wasm-threaded-simd.wasm'];
const hashes={};for(const file of files)hashes[file]=createHash('sha256').update(await readFile(path.join(target,file))).digest('hex');
await writeFile(path.join(target,'manifest.json'),JSON.stringify({basicPitch:'1.0.1',tensorflow:'3.21.0',source:'https://github.com/spotify/basic-pitch-ts',sha256:hashes},null,2)+'\n');
