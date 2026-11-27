import { adaptStudioSnapshotToDocument } from '../components/studioProjectDocument';
import { createSecureId } from '../utils/security';
import { educationLesson } from './educationCatalog';

export function requestedEducationLesson(location = window.location) {
  const hashQuery = location.hash?.split('?')[1] || '';
  const search = new URLSearchParams(location.search || ''), hash = new URLSearchParams(hashQuery);
  const id = search.get('educationLesson') || hash.get('educationLesson');
  const lesson = id ? educationLesson(id) || null : null;
  const exercise = search.get('educationExercise') || hash.get('educationExercise');
  if (lesson?.id === 'bubble-sort' && exercise === 'first-swap') return {
    ...lesson, title: 'Build your first adjacent swap', practiceSource: 'first-swap-stage.mp4',
  };
  return lesson;
}
// A lesson supplies decisions; every source is freshly uploaded and owned by
// the current account through the existing Studio media path. No foreign
// owner/project/media path is accepted from a downloadable practice recipe.
export function createEducationPracticeProject(lesson, source, duration) {
  if (!lesson || !educationLesson(lesson.id) || !source?.storagePath || !source.url || !source.contentHash || !Number.isFinite(duration) || duration <= 0)
    throw new Error('Upload the supplied practice recording to this account before opening its project.');
  const id = createSecureId('viral-project');
  const sourceClip = { id: 'education-original', name: source.name, start: 0, end: duration, duration, sourceDuration: duration,
    url: source.url, sourceStoragePath: source.storagePath, contentHash: source.contentHash };
  const snapshot = {
    orderedClips: [sourceClip], selectedClipId: sourceClip.id, activeTimelineIndex: 0,
    projectMedia: [{ id: 'education-primary', name: source.name, url: source.url, storagePath: source.storagePath,
      sourceStoragePath: source.storagePath, contentHash: source.contentHash, duration, status: 'ready', isPrimary: true }],
    timeline: [{ ...sourceClip, id: 'main', sourceClipId: sourceClip.id, startRequest: 0, endRequest: duration }],
    overlays: [], motionKeyframes: [], speedKeyframes: [], finishKeyframes: [], compoundClips: [], compositionOrder: [],
    voiceovers: [], soundEffects: [], motionScenes: [], threeDScenes: [], subjectVfxScenes: [], adjustmentLayers: [],
    autoCaptions: false, captionSegments: [], smartCrop: false, smartCropMode: 'off', reframeAspect: '16:9',
    previewSpeed: 1, addHook: false, addMusic: false, musicTrack: null, muteOriginalAudio: false,
    creativeEffectsEnabled: false, creativeEffects: [], enhanceQuality: false, silenceRemoval: false,
    removeWatermark: false, audioRestoration: { enabled: false }, audioRemix: { enabled: false },
    mainFrame: { enabled: false }, mainTransform: { x: 50, y: 50, scale: 1, rotation: 0, opacity: 1 },
    exportSettings: { resolution: '720p', fps: '24', codec: 'h264', quality: 'high', videoBitrate: 'auto', audioCodec: 'aac', audioBitrate: '128', colorSpace: 'rec709' },
  };
  snapshot.studioDocument = adaptStudioSnapshotToDocument({ snapshot, projectId: id });
  return { id, name: `IT practice ${lesson.number} · ${lesson.number <= 5 ? 'Explain a byte' : lesson.title}`, createdAt: Date.now(), updatedAt: Date.now(), snapshot, versions: [] };
}
