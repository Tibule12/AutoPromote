// tutorialEngine.js
// In-app tutorials and onboarding flows

function getTutorialSteps(userType) {
  // Stub: Simulate tutorial steps
  if (userType === 'beginner') {
    return [
      'Welcome to AutoPromote! Let’s get you trending.',
      'Upload your first piece of content.',
      'Watch your growth dashboard.',
      'Join a growth squad for mutual boosts.'
    ];
  }
  return [
    'Welcome back! Explore advanced analytics.',
    'Try A/B testing for your next post.',
    'Challenge your squad to a viral contest.'
  ];
}

module.exports = {
  getTutorialSteps
};
