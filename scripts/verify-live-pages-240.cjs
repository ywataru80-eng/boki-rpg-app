'use strict';
// Isolated external audit; never writes app state or changes production source.
const fs=require('node:fs');
const crypto=require('node:crypto');
const root='https://ywataru80-eng.github.io/boki-rpg-app/';
const fixture=process.argv.includes('--fixture');
const expectedRelease='20261123-240';
const bootstrap={
 'index.html':'d5569fe79bd4b7ec6cff97bf88e979756e5c93e8d31506d70d2623a0bf9a769b',
 'service-worker.js':'429b4915850fbc7bc0aade6814402c944a0aa8e345084f65477571abc3a4b3d7'
};
const pause=ms=>new Promise(resolve=>setTimeout(resolve,ms));
async function get(file){
 if(file.startsWith('/')||file.includes('..'))throw Error('Unsafe resource path '+file);
 if(fixture)return fs.readFileSync(file);
 let error;
 for(let i=0;i<5;i++){
  try{
   const url=root+file+'?release240_audit='+Date.now();
   const response=await fetch(url,{cache:'no-store',redirect:'follow',signal:AbortSignal.timeout(15000)});
   if(!response.ok)throw Error('HTTP '+response.status+' '+file);
   if(!response.url.startsWith(root))throw Error('Untrusted redirect '+response.url);
   return Buffer.from(await response.arrayBuffer());
  }catch(e){error=e;if(i<4)await pause(1000*(i+1));}
 }
 throw Error('HTTPS retrieval failed '+file+': '+String(error));
}
async function run(){
 const manifest=JSON.parse((await get('pwa-release-manifest.json')).toString('utf8'));
 if(manifest.release!==expectedRelease||manifest.previousRelease!=='20261119-239')
  throw Error('Wrong release lineage: '+JSON.stringify(manifest.release));
 const expected={...manifest.assets,...manifest.pages,...bootstrap};
 const entries=Object.entries(expected);
 if(entries.length!==23)throw Error('Unexpected asset count '+entries.length);
 for(const [file,sha] of entries){
  const bytes=await get(file);
  const actual=crypto.createHash('sha256').update(bytes).digest('hex');
  if(actual!==sha)throw Error('SHA256 mismatch '+file+' expected '+sha+' actual '+actual);
 }
 const index=(await get('index.html')).toString('utf8');
 const sw=(await get('service-worker.js')).toString('utf8');
 if(!index.includes(expectedRelease)||!sw.includes(expectedRelease))throw Error('Release marker missing');
 console.log('RELEASE240_'+(fixture?'LOCAL':'PUBLIC_HTTPS')+'_SHA256_PASS files='+entries.length+' release='+expectedRelease);
}
run().catch(e=>{console.error('RELEASE240_HTTPS_AUDIT_FAILED',e.stack||e);process.exitCode=1;});
