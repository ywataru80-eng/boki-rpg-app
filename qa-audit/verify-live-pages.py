#!/usr/bin/env python3
"""No credentials or production mutation: verify live GitHub Pages exact Release237 bytes."""
import hashlib,json,pathlib,time,urllib.parse,urllib.request,datetime,sys
BASE='https://ywataru80-eng.github.io/boki-rpg-app/'
EXPECT='20261115-237'
ROOT=pathlib.Path('artifacts/public-pages')
ROOT.mkdir(parents=True,exist_ok=True)
def get(p,versioned=False):
  u=urllib.parse.urljoin(BASE,p)+(('?v='+EXPECT) if versioned else '')
  request=urllib.request.Request(u,headers={'User-Agent':'BokiRPG-Pages-Acceptance/1.0','Cache-Control':'no-cache'})
  with urllib.request.urlopen(request,timeout=30) as response:
    return {'url':u,'status':response.status,'content_type':response.headers.get('Content-Type',''),'bytes':response.read()}
def sha(content):return hashlib.sha256(content).hexdigest()
def record(report):
  (ROOT/'evidence.json').write_text(json.dumps(report,ensure_ascii=False,indent=2)+'\n',encoding='utf-8')
report={'url':BASE,'expectedRelease':EXPECT,'status':'RUNNING','attempts':[],'checks':[]}
record(report)
for i in range(18):
  attempt={'number':i+1,'timestamp':datetime.datetime.now(datetime.timezone.utc).isoformat()}
  try:
    current=get('pwa-release-manifest.json')
    manifest=json.loads(current['bytes'])
    attempt['manifestHttp']=current['status'];attempt['release']=manifest.get('release')
    report['attempts'].append(attempt);record(report)
    if manifest.get('release')==EXPECT:break
  except Exception as err:
    attempt['error']=str(err);report['attempts'].append(attempt);record(report)
  time.sleep(10)
else:
  report['status']='FAIL';report['error']='The public GitHub Pages did not serve expected Release237';record(report);sys.exit(1)
try:
  assert sha(current['bytes'])=='c80032f773733213fd7ef4787efac52123d9eb3f81f7eb408dc693cde113b8ea','manifest hash'
  hashes={**manifest['assets'],**manifest['pages'],
   'index.html':'c9ad6906b0e55d90233db2a1e309f651e2758985b085b3c33405115971925c9b',
   'service-worker.js':'cc44e03cf86dec1aa77a8ab5467c4c9c32a34ed83271222cfbea0361470defc6'}
  assert len(manifest['assets'])==20 and len(manifest['pages'])==1,'21 pinned assets/pages'
  for name,expected in hashes.items():
    result=get(name,versioned=name in manifest['assets'])
    actual=sha(result['bytes'])
    entry={'path':name,'http':result['status'],'bytes':len(result['bytes']),'expectedSha256':expected,'actualSha256':actual,'match':actual==expected}
    report['checks'].append(entry);record(report)
    assert result['status']==200 and entry['match'],'asset failed '+name
  html=get('index.html')['bytes'].decode('utf-8')
  sw=get('service-worker.js')['bytes'].decode('utf-8')
  assert EXPECT in html,'release marker in HTML'
  assert ("const RELEASE = '"+EXPECT+"'") in sw,'SW release marker'
  report['status']='PASS';report['assetCount']=len(hashes);record(report)
  print('RELEASE237_PUBLIC_HTTPS_ASSET_HASH_GATE_PASS',len(hashes),'files')
except Exception as e:
  report['status']='FAIL';report['error']=str(e);record(report);raise
