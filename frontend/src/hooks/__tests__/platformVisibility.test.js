import {renderHook,act} from '@testing-library/react';
import usePlatformStatus from '../usePlatformStatus';
import {isPlatformVisible,visiblePlatformSummary} from '../../config/platformVisibility';
test('withdrawn platforms cannot start status polling or reappear through raw diagnostics',async()=>{
 const old=global.fetch;global.fetch=jest.fn();
 try{const {result}=renderHook(()=>usePlatformStatus());
  for(const name of ['twitter','snapchat','spotify','pinterest']){
   expect(isPlatformVisible(name)).toBe(false);
   await act(async()=>result.current.loadPlatformStatus(name));
   act(()=>result.current.setStatus(name,{connected:true}));
   expect(result.current.statuses[name]).toBeUndefined();
  }
  expect(fetch).not.toHaveBeenCalled();
  expect(visiblePlatformSummary({raw:{twitter:{username:'private'},youtube:{connected:true}},platforms:['twitter','youtube']}))
   .toEqual({raw:{youtube:{connected:true}},platforms:['youtube']});
 }finally{global.fetch=old;}
});
