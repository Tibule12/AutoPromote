import React from 'react';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { adaptStudioSnapshotToDocument } from '../studioProjectDocument';
import { prepareStudioSceneActions } from '../studioSceneActions';
import { compileDirectorCreativePlan } from '../studioDirectorCreativePlan';
import {
  DIRECTOR_CINEMA_3D_MODES,
  buildDirectorCinema3DProposal,
  inferCinema3DMode,
} from '../studioDirector3DPlan';
import StudioDirectorCreativePanel from '../StudioDirectorCreativePanel';
import { studioCreativePlannerStatus } from '../studioDirectorCreativeClient';
import { getAuth } from 'firebase/auth';

jest.mock('../studioDirectorCreativeClient', () => ({
  studioCreativePlannerStatus: jest.fn(),
  requestStudioCreativePlan: jest.fn(),
  reviseDirectorFragment: jest.fn(),
  reviseDirectorPoster: jest.fn(),
}));
jest.mock('firebase/auth', () => ({ getAuth: jest.fn() }));

function makeProjectSnapshot(withMedia = true, aspect = "16:9") {
  const s = {
    reframeAspect: aspect,
    orderedClips: withMedia ? [{ id: 'c1', url: 'http://127.0.0.1/city.mp4', start: 0, end: 10 }] : [],
    timeline: withMedia ? [{ id: 'occ1', sourceClipId: 'c1', startRequest: 0, endRequest: 10 }] : [],
    overlays: [],
    threeDScenes: [],
    motionKeyframes: [],
    projectMedia: withMedia
      ? [
          {
            id: 'city',
            name: 'City Skyline',
            status: 'ready',
            duration: 12,
            storagePath: 'owned/city.mp4',
            url: 'http://127.0.0.1/city.mp4',
            contentHash: 'a'.repeat(64),
          },
        ]
      : [],
  };
  s.studioDocument = adaptStudioSnapshotToDocument({ projectId: 'dir-3d-proj', snapshot: s });
  return s;
}

beforeEach(() => {
  jest.clearAllMocks();
  getAuth.mockReturnValue({
    currentUser: { uid: 'owner', getIdToken: async () => 'token' },
  });
  studioCreativePlannerStatus.mockResolvedValue({ available: false });
});

describe('studioDirector3DPlan', () => {
  test('infers distinct Cinema 3D VFX modes accurately from briefs', () => {
    expect(inferCinema3DMode('Create iridescent morphing ribbon sculpture', false)).toBe('sculpture_ribbon');
    expect(inferCinema3DMode('Audio spectrum harmonic beat stage', false)).toBe('audio_spectrum');
    expect(inferCinema3DMode('Smoked glass HUD card and title sequence', false)).toBe('hud_title_slate');
    expect(inferCinema3DMode('Brand VFX reveal for SOLARIS', false)).toBe('brand_vfx');
    expect(inferCinema3DMode('Hybrid rotoscope split film with 3D reveal', true)).toBe('hybrid_film_3d');
  });

  test.each(['9:16', '4:5', '1:1', '16:9'])('compiles and executes all 5 Director Cinema 3D modes atomically at %s', async aspect => {
    const briefs = {
      brand_vfx: "Direct molten gold WebGL2 VFX reveal for 'APEX NOVA'",
      sculpture_ribbon: "Choreograph liquid holographic ribbon sculpture 'ORBITAL FORM'",
      audio_spectrum: "Audio-reactive chrome spectrum equalizer 'SONIC HORIZON'",
      hud_title_slate: "Smoked glass HUD card and title sequence 'BEYOND STATIC'",
      hybrid_film_3d: "Hybrid split diptych video + transparent 3D lower-third 'APEX NOVA'",
    };

    for (const mode of Object.keys(DIRECTOR_CINEMA_3D_MODES)) {
      const snapshot = makeProjectSnapshot(mode === 'hybrid_film_3d', aspect);
      const before = JSON.stringify(snapshot);
      const proposal = buildDirectorCinema3DProposal(snapshot, briefs[mode], 6, { mode });
      expect(proposal.version).toBe(5);

      const compiled = compileDirectorCreativePlan(proposal, snapshot);
      let idCount = 0;
      const prepared = await prepareStudioSceneActions(
        compiled.plan,
        snapshot,
        prefix => `${prefix}-${++idCount}`,
        {
          aspect: Number(aspect.split(":")[0]) / Number(aspect.split(":")[1]),
          rasterize: async () => new File(['art'], 'art.png', { type: 'image/png' }),
          createUrl: () => `blob:art-${++idCount}`,
          revokeUrl: () => {},
        }
      );
      const next = prepared.snapshot;

      expect(next.threeDScenes.length).toBeGreaterThanOrEqual(1);
      expect(next.finishFx?.precisionGrade).toBe(true);
      expect(next.studioDocument.layers.some(l => l.type === 'three_d')).toBe(true);
      if (mode === 'sculpture_ribbon') {
        expect(next.threeDScenes[0].template).toBe('object_scene');
        expect(next.threeDScenes[0].objects.some(o => o.shape === 'ribbon')).toBe(true);
      }
      if (mode === 'hybrid_film_3d') {
        expect(next.overlays.some(o => o.type === 'video')).toBe(true);
        expect(next.threeDScenes.every(sc => sc.background === 'transparent')).toBe(true);
      }
      expect(JSON.stringify(snapshot)).toBe(before);
    }
  });

  test('StudioDirectorCreativePanel generates and applies Cinema 3D VFX Stage plans cleanly', async () => {
    const snapshot = makeProjectSnapshot(false);
    const onApply = jest.fn().mockResolvedValue();
    render(<StudioDirectorCreativePanel getSnapshot={() => snapshot} onApply={onApply} />);

    fireEvent.click(screen.getByTestId('director-brief-preset-brand_3d_vfx'));
    expect(screen.getByLabelText('Director design approach')).toHaveValue('cinema_3d');

    fireEvent.click(screen.getByTestId('director-choreograph-btn'));
    await screen.findByRole('button', { name: 'Apply Director edit' });
    expect(screen.getByTestId('director-topology-summary').textContent).toMatch(/3D Scenes: 1/);

    fireEvent.click(screen.getByRole('button', { name: 'Apply Director edit' }));
    await waitFor(() => expect(onApply).toHaveBeenCalledTimes(1));
    expect(onApply.mock.calls[0][0].actions.some(a => a.type === 'three_d_scene')).toBe(true);
  });

  test('ignores technical acronyms like LUT/VFX/HUD when extracting unquoted 3D headline copy', () => {
    const snapshot = makeProjectSnapshot(true);
    const proposal = buildDirectorCinema3DProposal(
      snapshot,
      'Hybrid culinary reel with Kodak 2383 LUT grade, VFX glow, and smooth chef plating transition',
      6.5,
      { mode: 'hybrid_film_3d', lookId: 'kodak_2383' }
    );
    const texts = proposal.threeDPlan.threeDScenes.map(sc => sc.text);
    expect(texts.every(t => t !== 'LUT' && t !== 'VFX' && t !== 'HUD')).toBe(true);
    expect(proposal.threeDPlan.sourceComposition.layers.some(l => l.bRollLayoutPreset === 'fullscreen_cutaway' || l.bRollLayoutPreset === 'pip_top_right')).toBe(true);
  });

  test('hybrid_film_3d layers live holographic 3D ribbon sculpture over footage when brief asks for liquid ribbon artistry', () => {
    const snapshot = makeProjectSnapshot(true);
    const proposal = buildDirectorCinema3DProposal(
      snapshot,
      'Artistic live film with iridescent 3D liquid chrome ribbon weaving over plating for "TASTE"',
      6.5,
      { mode: 'hybrid_film_3d', lookId: 'kodak_2383' }
    );
    expect(proposal.threeDPlan.threeDScenes[0].template).toBe('object_scene');
    expect(proposal.threeDPlan.threeDScenes[0].background).toBe('transparent');
    expect(proposal.threeDPlan.threeDScenes[0].objects[0].shape).toBe('ribbon');
    expect(proposal.threeDPlan.threeDScenes[1].template).toBe('neon_logo');
  });
});
