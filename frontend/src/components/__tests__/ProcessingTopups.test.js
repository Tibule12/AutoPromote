import React from 'react';
import {render,screen,waitFor,cleanup} from '@testing-library/react';
import ProcessingTopups from '../ProcessingTopups';
jest.mock('../../config',()=>({API_BASE_URL:'http://127.0.0.1:7777'}));
const packs=[{id:'pack_boost',tokens:50,price:'4.99'},{id:'pack_pro',tokens:200,price:'14.99'},{id:'pack_studio',tokens:500,price:'29.99'}];
const response=(d,status=200)=>({ok:status===200,status,json:async()=>d});
beforeEach(()=>{window.history.replaceState({},'','/pricing');global.fetch=jest.fn(async url=>url.endsWith('/catalog')?response({packs,available:true}):response({tokensAdded:50,processing:{purchasedRemainingTokens:50}}));});
afterEach(()=>{cleanup();delete global.fetch;window.history.replaceState({},'','/');});
test('top-ups show the actual one-time packs, require sign-in and explain reset and funding boundaries',async()=>{
 render(<ProcessingTopups user={null}/>);await screen.findByRole('button',{name:'Buy 50 tokens'});
 for(const count of [50,200,500])expect(screen.getByRole('button',{name:`Buy ${count} tokens`})).toBeDisabled();
 expect(screen.getByText('$4.99 USD · one-time')).toBeInTheDocument();
 expect(screen.getByText(/Purchased tokens do not expire/)).toBeInTheDocument();
});
test('a returned paid order is checked once, refreshes usage and clears only top-up callback data',async()=>{
 window.history.replaceState({},'','/#/pricing?processing_topup=return&token=ORDER123456&PayerID=PAYER&keep=1');
 const user={uid:'topup-owner',getIdToken:async()=> 'local-test'},updated=jest.fn();
 const view=render(<ProcessingTopups user={user} onUpdated={updated}/>);
 await screen.findByText(/Payment verified. 50 processing tokens added/);expect(updated).toHaveBeenCalledTimes(1);
 expect(window.location.hash).toBe('#/pricing?keep=1');
 view.rerender(<ProcessingTopups user={user} onUpdated={updated}/>);
 await waitFor(()=>expect(fetch.mock.calls.filter(([url])=>url.endsWith('/capture'))).toHaveLength(1));
 const [,options]=fetch.mock.calls.find(([url])=>url.endsWith('/capture'));expect(JSON.parse(options.body)).toEqual({orderId:'ORDER123456'});
 expect(options.headers.Authorization).toBe('Bearer local-test');
});
test('a failed payment verification never claims a token grant or automatically starts another checkout',async()=>{
 window.history.replaceState({},'','/pricing?processing_topup=return&token=ORDER123456');
 global.fetch=jest.fn(async url=>url.endsWith('/catalog')?response({packs,available:true}):response({error:'TOPUP_PAYMENT_NOT_COMPLETED'},409));
 const updated=jest.fn();render(<ProcessingTopups user={{uid:'owner',getIdToken:async()=> 'local-test'}} onUpdated={updated}/>);
 await screen.findByText(/Do not pay again/);expect(updated).not.toHaveBeenCalled();expect(screen.queryByText(/Payment verified/)).not.toBeInTheDocument();
 expect(fetch.mock.calls.filter(([url])=>url.endsWith('/create'))).toHaveLength(0);
});
