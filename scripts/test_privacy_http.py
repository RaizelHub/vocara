"""Optional real local Auth/Storage/Edge integration. NEVER accepts a hosted URL.
Requires disposable Supabase at 127.0.0.1:54321 and functions served locally.
Set VOCARA_LOCAL_ANON_KEY and VOCARA_LOCAL_SERVICE_ROLE_KEY privately.
Creates only synthetic accounts; cleanup is restricted to those returned IDs.
"""
import json, os, time, unittest, uuid
from urllib.request import Request, urlopen
from urllib.error import HTTPError
from urllib.parse import urlparse

BASE=os.environ.get('VOCARA_LOCAL_SUPABASE_URL','http://127.0.0.1:54321').rstrip('/')
u=urlparse(BASE)
if u.scheme!='http' or u.hostname not in ('127.0.0.1','localhost') or u.port!=54321 or u.path:
    raise RuntimeError('Only disposable loopback Supabase on port 54321 is allowed')
ANON=os.environ.get('VOCARA_LOCAL_ANON_KEY','')
ADMIN=os.environ.get('VOCARA_LOCAL_SERVICE_ROLE_KEY','')
def call(method,path,token=None,body=None,raw=False,admin=False):
    headers={'apikey':ADMIN if admin else ANON,'Authorization':'Bearer '+(token or (ADMIN if admin else ANON))}
    data=body if raw else (json.dumps(body).encode() if body is not None else None)
    headers['Content-Type']='application/pdf' if raw else 'application/json'
    try:
        with urlopen(Request(BASE+path,data=data,headers=headers,method=method),timeout=20) as r:
            status,payload=r.status,r.read()
    except HTTPError as e: status,payload=e.code,e.read()
    try: payload=json.loads(payload)
    except (ValueError,UnicodeDecodeError): pass
    return status,payload

@unittest.skipUnless(ANON and ADMIN,'Local synthetic-test keys are not configured')
class PrivacyIntegration(unittest.TestCase):
    def setUp(self):
        self.users=[];self.paths=[]
        self.addCleanup(self.cleanup)
        for _ in range(2):
            email='privacy-'+uuid.uuid4().hex+'@example.invalid';password=uuid.uuid4().hex+'Ab!9'
            status,data=call('POST','/auth/v1/admin/users',body={'email':email,'password':password,'email_confirm':True},admin=True)
            self.assertEqual(status,200,'Synthetic Auth creation failed')
            self.users.append({'id':data['id']})
            status,session=call('POST','/auth/v1/token?grant_type=password',body={'email':email,'password':password})
            self.assertEqual(status,200,'Synthetic login failed');self.users[-1]['token']=session['access_token']
    def cleanup(self):
        for path in self.paths: call('DELETE','/storage/v1/object/resumes',body={'prefixes':[path]},admin=True)
        for user in self.users:
            call('DELETE','/auth/v1/admin/users/'+user['id'],admin=True)
            call('DELETE','/rest/v1/account_deletion_jobs?user_id=eq.'+user['id'],admin=True)
    def upload(self):
        owner=self.users[0];path=owner['id']+'/'+str(uuid.uuid4())+'/synthetic.pdf';self.paths.append(path)
        status,_=call('POST','/storage/v1/object/resumes/'+path,owner['token'],b'%PDF-1.4\n% synthetic fixture\n%%EOF',raw=True)
        self.assertIn(status,(200,201),'Synthetic upload failed');return path
    def test_private_storage_and_expired_signed_url(self):
        path=self.upload();owner,other=self.users
        status,_=call('GET','/storage/v1/object/authenticated/resumes/'+path,other['token']);self.assertGreaterEqual(status,400)
        status,_=call('POST','/storage/v1/object/resumes/'+path.replace('synthetic.pdf','attack.pdf'),other['token'],b'%PDF-1.4',raw=True);self.assertGreaterEqual(status,400)
        status,signed=call('POST','/storage/v1/object/sign/resumes/'+path,owner['token'],{'expiresIn':1});self.assertEqual(status,200)
        signed_path='/storage/v1'+signed['signedURL']
        time.sleep(3)
        status,_=call('GET',signed_path,owner['token']);self.assertGreaterEqual(status,400,'Expired signed URL was accepted')
    def test_edge_authentication(self):
        for name in ('evaluate-answer','transcribe-answer','finalize-interview','process-resume','compare-resume-job'):
            status,_=call('POST','/functions/v1/'+name,'invalid-synthetic-token',{})
            self.assertIn(status,(401,403),name+' did not reject invalid credentials')
    def test_duplicate_deletion_and_pending_access(self):
        path=self.upload();owner,other=self.users
        status,_=call('POST','/functions/v1/request-account-deletion',owner['token'],{'confirmation':'DELETE','userId':other['id']})
        self.assertEqual(status,400,'Client-supplied identity must be rejected')
        for _ in range(2):
            status,_=call('POST','/functions/v1/request-account-deletion',owner['token'],{'confirmation':'DELETE'})
            self.assertEqual(status,202,'Local deletion function/worker configuration is required')
        status,rows=call('GET','/rest/v1/account_deletion_jobs?select=id&user_id=eq.'+owner['id'],admin=True)
        self.assertEqual(status,200);self.assertEqual(len(rows),1)
        status,_=call('GET','/storage/v1/object/authenticated/resumes/'+path,owner['token']);self.assertGreaterEqual(status,400)
        status,rows=call('GET','/rest/v1/profiles?select=id',other['token']);self.assertEqual(status,200);self.assertEqual([r['id'] for r in rows],[other['id']])

if __name__=='__main__': unittest.main()
