export const applyCaptionBulkEdit = (segments, action, language) => segments.map(segment => {
  if (action === 'clear_reactions') return {...segment, captionIcon: 'none'};
  if (action === 'language') return {...segment,language,languages:language === 'und' ? [] : [language],
    reviewRequired: language === 'und' || segment.speaker === 'unknown' ||
      Boolean(segment.textReviewRequired && !segment.textReviewed)};
  if (action === 'approve_wording') return {...segment,textReviewed:true,
    reviewRequired: segment.speaker === 'unknown' || segment.language === 'und'};
  return segment;
});
