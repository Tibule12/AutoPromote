import React from "react";
import { render, screen, fireEvent } from "@testing-library/react";
import StudioLaunchTemplatePanel from "../StudioLaunchTemplatePanel";
jest.mock("../../firebaseClient",()=>({auth:{currentUser:{uid:"owner"}}}));
jest.mock("../ProductHelpButton",()=>()=>null);
jest.mock("../../utils/sourceUpload",()=>({uploadSourceFileViaBackend:jest.fn()}));
jest.mock("../studioCreativeTemplate",()=>({
  STUDIO_CREATIVE_TEMPLATES:[{templateId:"product_launch_cinematic_v1",version:"1.1.2",label:"Available template",durationTicks:1800000,
    categoryIds:["launch"],supportedAspects:["16:9"],inputSlots:[],executionDefinition:{clock:90000,defaultAspect:"16:9"}}],
  instantiateStudioCreativeTemplate:jest.fn(),proposeStudioDirectorTemplate:jest.fn(),studioTemplateReference:jest.fn(),
}));
test("a saved unknown template keeps the editor mounted and never reapplies or replaces its existing edit",()=>{
 const onApply=jest.fn(),instance={templateRef:{templateId:"podcast",version:"99.0.0"},bindings:{headline:"Saved words"},aspect:"16:9"};
 const original=JSON.stringify(instance);
 render(<StudioLaunchTemplatePanel projectId="project" media={[]} instance={instance} onApply={onApply}/>);
 expect(screen.getByText("Saved template unavailable")).toBeTruthy();
 expect(screen.getByRole("status").textContent).toContain("Your existing edit is preserved");
 expect(onApply).not.toHaveBeenCalled();expect(JSON.stringify(instance)).toBe(original);
 fireEvent.change(screen.getByLabelText("Creative template"),{target:{value:"product_launch_cinematic_v1@1.1.2"}});
 expect(screen.getByRole("button",{name:"Apply launch template"})).toBeTruthy();
 expect(onApply).not.toHaveBeenCalled();expect(JSON.stringify(instance)).toBe(original);
});
