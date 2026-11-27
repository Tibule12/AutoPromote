/** @jest-environment jsdom */
import {startVisibleSubscription} from "./visibleSubscription";
let hidden,stop;
const visibility=value=>{hidden=value;document.dispatchEvent(new Event("visibilitychange"));};
beforeEach(()=>{jest.useFakeTimers();hidden=false;Object.defineProperty(document,"hidden",{configurable:true,get:()=>hidden});});
afterEach(()=>{stop?.();delete document.hidden;jest.useRealTimers();});
test("listeners survive brief switches, close when hidden, reconnect once and release on unmount",()=>{
 const close=jest.fn(),subscribe=jest.fn(()=>close);stop=startVisibleSubscription(subscribe);
 expect(subscribe).toHaveBeenCalledTimes(1);visibility(true);jest.advanceTimersByTime(5000);visibility(false);
 expect(subscribe).toHaveBeenCalledTimes(1);expect(close).not.toHaveBeenCalled();
 visibility(true);jest.advanceTimersByTime(30000);expect(close).toHaveBeenCalledTimes(1);
 jest.advanceTimersByTime(3600000);expect(subscribe).toHaveBeenCalledTimes(1);
 visibility(false);expect(subscribe).toHaveBeenCalledTimes(2);stop();expect(close).toHaveBeenCalledTimes(2);
});
test("an initially hidden tab opens no connection",()=>{
 visibility(true);const subscribe=jest.fn(()=>jest.fn());stop=startVisibleSubscription(subscribe);
 jest.advanceTimersByTime(3600000);expect(subscribe).not.toHaveBeenCalled();visibility(false);expect(subscribe).toHaveBeenCalledTimes(1);
});
