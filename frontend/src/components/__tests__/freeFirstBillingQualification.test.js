import React from 'react';
import {render,screen,act,fireEvent,cleanup} from '@testing-library/react';
import {auth} from '../../firebaseClient';
import PayPalSubscriptionPanel from '../PayPalSubscriptionPanel';
import ProcessingUsage from '../ProcessingUsage';
import offers from '../../config/subscriptionOffers.json';
let mockAuthListener,hidden,plan,activation,releaseActivation;
jest.mock('../../firebaseClient',()=>({auth:{currentUser:null}}));
jest.mock('../../config',()=>({API_BASE_URL:'http://127.0.0.1:7777'}));
jest.mock('firebase/auth',()=>({onAuthStateChanged:(_auth,listener)=>{mockAuthListener=listener;return jest.fn();}}));
const flush=async()=>{for(let round=0;round<2;round++)await act(async()=>{jest.advanceTimersByTime(0);for(let n=0;n<30;n++)await Promise.resolve();});};
const response=(value,status=200)=>({ok:status===200,status,json:async()=>value});
const usage=id=>({planId:id,remaining:id==='free'?100:500,allowance:id==='free'?100:500,remainingPercent:100,nextResetAt:'2026-12-03T08:00:00.000Z',rollingSpentTokens:0,reservedTokens:0,rolling30DayLimit:id==='free'?500:2000,storage:{limitBytes:1073741824}});
beforeEach(()=>{
 jest.useFakeTimers();hidden=false;plan='free';Object.defineProperty(document,'hidden',{configurable:true,get:()=>hidden});
 auth.currentUser={uid:'billing-owner',getIdToken:async()=> 'fixture'};window.history.replaceState({},'', '/pricing');
 activation=new Promise(resolve=>{releaseActivation=resolve;});
 global.fetch=jest.fn(async(url,options={})=>{
  if(url.endsWith('/plans'))return response({plans:offers});
  if(url.endsWith('/activate'))return await activation;
  if(url.endsWith('/status'))return response({subscription:{planId:plan,status:'active'}});
  if(url.endsWith('/processing'))return response({processing:usage(plan),balances:{purchasedCredits:23,promotionalCredits:41}});
  throw Error('Unexpected fixture URL '+url);
 });
});
afterEach(()=>{cleanup();delete document.hidden;delete global.fetch;jest.useRealTimers();window.history.replaceState({},'', '/');});
test('verified activation reloads Free usage into Plus, keeps legacy balances and does not repeat on callback rerender',async()=>{
 window.history.replaceState({},'', '/pricing?subscription_id=I-LOCAL');const callback=jest.fn();const view=render(<PayPalSubscriptionPanel onUpgradeSuccess={callback}/>);await flush();
 expect(screen.getByText('100 of 100 processing tokens available')).toBeInTheDocument();
 await act(async()=>{plan='plus';releaseActivation(response({subscription:{planId:'plus',status:'active'}}));});await flush();
 expect(screen.getByText('500 of 500 processing tokens available')).toBeInTheDocument();expect(callback).toHaveBeenCalledTimes(1);
 expect(screen.getByText(/Existing credits \(legacy wallet\): 23/)).toBeInTheDocument();expect(window.location.search).toBe('');
 view.rerender(<PayPalSubscriptionPanel onUpgradeSuccess={()=>{}}/>);await flush();
 expect(fetch.mock.calls.filter(([u])=>u.endsWith('/activate'))).toHaveLength(1);
});
test('unverified payment remains Free and exposes an explicit retry instead of claiming activation',async()=>{
 window.history.replaceState({},'', '/pricing?subscription_id=I-LOCAL');render(<PayPalSubscriptionPanel/>);await flush();
 await act(async()=>releaseActivation(response({error:'VERIFIED_PAYMENT_REQUIRED'},409)));await flush();
 expect(screen.queryByText(/Payment verified/)).not.toBeInTheDocument();expect(screen.getByText('100 of 100 processing tokens available')).toBeInTheDocument();
 global.fetch.mockImplementation(async url=>url.endsWith('/activate')?response({subscription:{planId:'plus',status:'active'}}):url.endsWith('/processing')?response({processing:usage('plus'),balances:{purchasedCredits:23}}):response({subscription:{planId:'plus'}}));
 fireEvent.click(screen.getByRole('button',{name:'Check payment status'}));await flush();
 expect(screen.getByText('500 of 500 processing tokens available')).toBeInTheDocument();
});
test('billing pauses hidden polling and clears owner-specific balances after sign-out',async()=>{
 render(<PayPalSubscriptionPanel/>);await flush();const reads=()=>fetch.mock.calls.filter(([u])=>u.endsWith('/processing')).length;expect(reads()).toBe(1);
 hidden=true;document.dispatchEvent(new Event('visibilitychange'));await act(async()=>jest.advanceTimersByTime(3600000));expect(reads()).toBe(1);
 hidden=false;document.dispatchEvent(new Event('visibilitychange'));await flush();expect(reads()).toBe(2);
 await act(async()=>mockAuthListener(null));expect(screen.queryByText(/Existing credits \(legacy wallet\)/)).not.toBeInTheDocument();
});
test('rolling exhaustion explains why reset cannot erase earlier spend and retains supported local editing',()=>{
 render(<ProcessingUsage usage={{...usage('plus'),remaining:0,remainingPercent:0,exhaustionReason:'rolling',reservedTokens:30}}/>);
 expect(screen.getByText(/An allowance reset does not clear earlier usage/)).toBeInTheDocument();expect(screen.getByText(/timeline and supported local editing remain available/)).toBeInTheDocument();
 expect(screen.getByText(/30 tokens are reserved for unfinished jobs/)).toBeInTheDocument();expect(screen.getByLabelText('Processing allowance remaining')).toHaveAttribute('value','0');
});
