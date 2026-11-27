/** @jest-environment jsdom */
import React from "react";
import {render,fireEvent,act,cleanup} from "@testing-library/react";
import SystemHealthPanel from "../SystemHealthPanel";
import LiveLogViewer from "../LiveLogViewer";
jest.mock("../../firebaseClient",()=>({auth:{currentUser:{getIdToken:async()=>"fixture"}}}));
jest.mock("../../config",()=>({API_BASE_URL:"http://127.0.0.1:7777"}));
let hidden;
const flush=async(ms=0)=>{await act(async()=>{jest.advanceTimersByTime(ms);for(let n=0;n<30;n++)await Promise.resolve();});};
const visibility=value=>{hidden=value;document.dispatchEvent(new Event("visibilitychange"));};
beforeEach(()=>{
 Element.prototype.scrollIntoView=jest.fn();
 jest.useFakeTimers();hidden=false;Object.defineProperty(document,"hidden",{configurable:true,get:()=>hidden});
 global.fetch=jest.fn(async url=>({ok:true,status:200,json:async()=>({success:true,logs:[],health:null,errors:[],metrics:null,activities:[],results:{overall:"passed",checks:[]},
  overall_status:"healthy",summary:{passed:0,total_checks:0,warnings:0,errors:0},checks:{}}),text:async()=>JSON.stringify({success:true,logs:[]})}));
});
afterEach(()=>{cleanup();delete document.hidden;jest.useRealTimers();delete global.fetch;});
test("System Health refreshes status without repeating integration scans; manual scans remain available",async()=>{
 const view=render(<SystemHealthPanel/>);await flush();
 const scans=()=>fetch.mock.calls.filter(([url])=>url.includes("/diagnostics/scan?")).length;
 expect(scans()).toBe(1);
 fireEvent.click(view.getByLabelText("Auto-refresh (10s)"));await flush();
 for(let n=0;n<3;n++)await flush(10000);
 expect(scans()).toBe(1);
 const before=fetch.mock.calls.length;visibility(true);await flush(600000);expect(fetch).toHaveBeenCalledTimes(before);
 visibility(false);await flush();expect(fetch.mock.calls.length).toBeGreaterThan(before);expect(scans()).toBe(1);
 fireEvent.click(view.getByText("🔄 Refresh Now"));await flush();expect(scans()).toBe(2);
});
test("live logs send no refreshes while hidden and Pause stops all polling",async()=>{
 const view=render(<LiveLogViewer/>);await flush();expect(fetch).toHaveBeenCalledTimes(1);
 visibility(true);await flush(3600000);expect(fetch).toHaveBeenCalledTimes(1);
 visibility(false);await flush();expect(fetch).toHaveBeenCalledTimes(2);
 fireEvent.click(view.getByText("Pause"));await flush(60000);expect(fetch).toHaveBeenCalledTimes(2);
});
