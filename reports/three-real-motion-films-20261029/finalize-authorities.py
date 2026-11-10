"""Record completed private delivery without promoting product or creative readiness."""
import json
from datetime import datetime, timezone
from pathlib import Path

REPORT = Path(__file__).resolve().parent
REPO = REPORT.parent.parent
DELIVERY = Path('/home/tibule12/Videos/AutoPromote-Real-Motion-2026-10-29')


def main():
    manifest = json.loads((DELIVERY / 'manifest.json').read_text())
    assert len(manifest['films']) == 3
    payload = dict(
        date='2026-10-29', state='PRIVATE_FILMS_DELIVERED_FOR_OWNER_REVIEW',
        report='reports/three-real-motion-films-20261029/README.md',
        deliveryFolder=str(DELIVERY), films=manifest['films'],
        objectCounts=dict(aperture=21, city=22, chrono=22),
        actualWorkflow='Ordinary signed-in object authoring in fresh local emulators; exact saved scene inputs through the canonical local CUDA Blender renderer; ordinary signed-in result import, native main sequence/graphics/narration/score and final CPU export in Studio.',
        profile=dict(core=[1280, 720, 24, 8], lesson=[1600, 1000, 24], localGpu='Quadro M1200', cloudGpuAllocated=False),
        newSurfaceWork=['Per-object surface and bounded box/cylinder bevel', 'Object-only clear glass, fine bump and architecture window grid', 'Object-scene broad fill and browser environment reflections', 'Opaque backing objects now participate in browser glass transmission; scene fades and legacy transparency are retained', 'Optional explicit nonproduction CUDA/720p profile and accepted-runtime binding'],
        tests=dict(backend=55, frontend=29, python=46, totalFocused=130, priorProductKnowledgeAndHelp=51,
                   anonymousFinalClientViewports=8, finalGlassCandidateOrdinarySignedInWorkspaceAndHelp=True),
        clientBuild='Exact separately checked glass candidate adopted only in the task-owned local demo. Active API origin/UI flags, old build and hashed assets retained.',
        failedAppPreviews=dict(jobIds=['eef15ead-9de3-4e86-9192-38361a46615b', '5a59dafa-0559-42ff-9448-03fc9b86a927'],
                              first='Supervisor termination after observed denoise cost', second='Original Python840-second limit',
                              remainFailed=True, directCanonicalRenderIsNotRecovery=True),
        recordings='Actual full workspace/controls/authoring and complete matching final playback retained; 5–6fps observation does not qualify playback smoothness.',
        materialAndLightingPixelParityQualified=False, wholePredictiveParityQualified=False,
        ownerApproved=False, scheduled=False, paidCloudExecution=False, mainMerge=False, deployed=False,
        formalReadinessCountsUnchanged=True,
        remaining=[
            'S02 full picture/processed sound/colour/edges/low-alpha/material/lighting parity, latency and long-job reconciliation; typography13/16 strict failures remain',
            'Normal App full720p/optional CUDA end-to-end success and longer-job recovery remain unqualified after two actual failures; new longer bounds are source/test evidence only',
            'S04 contour morphs/procedural operators/richer motion; object keys across cuts, retiming and trimmed boundaries',
            'S03 occurrence/group/source ownership',
            'Owner creative/listening approval and real phone/platform presentation',
        ],
        nextTask='Owner watches exact films/thumbnails; keep all five Queue holds. Continue failed long-job reconciliation and bounded normal App720p qualification, alongside shared S02/S04/S03. Do not schedule or promote the showroom without exact owner approval.',
    )
    (REPORT / 'delivery-summary.json').write_text(json.dumps(payload, indent=2) + '\n')
    for name in ['studio-capability-matrix', 'studio-combination-matrix', 'studio-preview-render-parity']:
        p = REPO / 'test/e2e' / (name + '.json')
        data = json.loads(p.read_text())
        data = dict(threePhysicalMotionFilms20261029=payload, **data)
        data['updatedAt'] = datetime.now(timezone.utc).isoformat()
        previous = data.get('nativeObjectBlenderIntegration20261029', {})
        previous['creativeStatus'] = 'THREE_NEW_PRIVATE_FILMS_DELIVERED_FOR_REVIEW_SEE_threePhysicalMotionFilms20261029'
        previous['remaining'] = [v for v in previous.get('remaining', []) if 'requested substantial narrated native creative film remains unfinished' not in v.lower()]
        previous['nextTask'] = payload['nextTask']
        p.write_text(json.dumps(data, indent=2) + '\n')

    body = (
        '29 October physical-motion delivery: [APERTURE, BLOCK LIGHT and CHRONO](LINK) are delivered privately in Videos, each with a narrated full-workspace lesson of approximately 110 seconds, a separate eight-second 720p/24fps result, actual authoring/control recordings, complete matching final playback and exact native restore. '
        'The scenes contain 21, 22 and 22 objects with individual surfaces/bevels, clear glass, architecture windows and local physical lighting. '
        'Ordinary Studio authoring supplies the saved decisions; the canonical local CUDA Blender CLI supplies these three renders, which are then imported normally and assembled/exported through Studio. '
        'Both initial App preview jobs remain failed (measured denoise cost and the former840-second Python limit); this handoff is not their recovery or normal App720p qualification. '
        '130 focused tests and eight final-client anonymous viewports pass; the final glass candidate also passes ordinary signed-in workspace/contextual help. Earlier 51 help tests remain. '
        'Actual owner creative/listening approval, browser/final material-lighting pixel parity and capture smoothness remain open. '
        'Keep 17 FUNCTIONAL /9 PARTIAL /1 BROKEN /2 UNIMPLEMENTED /0 PRO-READY /0 PRODUCTION-READY, typography 13/16 failures and shared S02/S04/S03 limits. '
        'Next: owner review of exact films/thumbnails, then failed long-job reconciliation and normal App720p qualification. '
        'All originals/login and five holds remain; no new schedule/publication, paid cloud allocation, main merge or deployment. These private candidates are not approved showroom assets.'
    )
    for relative in ['AGENTS.md', 'docs/STUDIO-COMPLETION-CONTRACT.md', 'docs/STUDIO-PRODUCT-READINESS.md', 'docs/CREATIVE-SHOWROOM-CONTRACT.md']:
        p = REPO / relative
        text = p.read_text()
        start = text.find('\n') + 1
        link = ('../' if relative.startswith('docs/') else '') + 'reports/three-real-motion-films-20261029/README.md'
        text = text[:start] + '\n<!-- physical-motion-films-20261029 -->\n' + body.replace('LINK', link) + '\n<!-- /physical-motion-films-20261029 -->\n' + text[start:]
        p.write_text(text)
    print('Recorded all three delivered candidates and unchanged qualification limits in the six authorities and AGENTS.md.')


if __name__ == '__main__':
    main()
