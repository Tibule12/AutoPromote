import React from 'react';
import {render,screen} from '@testing-library/react';
import ConnectionsPanelRedesign from '../UserDashboardTabs/ConnectionsPanelRedesign';
import ProfilePanel from '../UserDashboardTabs/ProfilePanel';
jest.mock('../components/ExplainButton',()=>()=>null);
test.each([false,true])('withdrawn connections stay absent regardless of connection state: %s',connected=>{
 const props={twitterStatus:{connected,oauth1_missing:true,identity:{username:'hidden-user'}},snapchatStatus:{connected,identityOnly:true},spotifyStatus:{connected},pinterestStatus:{connected},
  platformSummary:{summary:{twitter:{username:'hidden-user'},snapchat:{connected},spotify:{connected},pinterest:{connected}}}};
 const {container}=render(<><ConnectionsPanelRedesign {...props}/><ProfilePanel {...props}/></>);
 expect(container.textContent).not.toMatch(/snapchat|twitter|spotify|pinterest|hidden-user|oauth1/i);
 for(const name of ['TikTok','YouTube','LinkedIn'])expect(screen.getAllByText(name).length).toBeGreaterThan(0);
});
