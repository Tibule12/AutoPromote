// Public presentation is distinct from curriculum approval or learner access.
const REQUIRED_EVIDENCE = ['nativeExport', 'actualNativeDownload', 'completeMovingPreview',
  'completeFinishedPlayback', 'exactColdRecovery', 'tutorial', 'bundle', 'technicalAccuracyChecked'];

function hasTechnicalPresentationRelease(catalog) {
  const release = catalog?.presentationRelease;
  return Boolean(release?.channel === 'teacher-review' && release.authorizedBy === 'owner' &&
    release.curriculumApproval === false && release.learnerEnrolment === false &&
    Array.isArray(catalog.lessons) && catalog.lessons.length === 4 &&
    Array.isArray(release.lessonIds) && release.lessonIds.length === 4 &&
    new Set(release.lessonIds).size === 4 && catalog.lessons.every(lesson =>
      release.lessonIds.includes(lesson.id) && REQUIRED_EVIDENCE.every(flag => lesson.evidence?.[flag] === true)));
}

module.exports = { REQUIRED_EVIDENCE, hasTechnicalPresentationRelease };
