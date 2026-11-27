import React from 'react';
import { render, screen } from '@testing-library/react';
import TechnicalLearningPath from '../TechnicalLearningPath';
import catalog from '../technicalCatalog.json';
import { hasTechnicalPresentationRelease, REQUIRED_EVIDENCE } from '../technicalPresentationRelease';
jest.mock('../educationCatalog', () => ({ EDUCATION_PREVIEW: false, educationRoute: () => '/#/education' }));

test('the owner-authorised public presentation exposes all four native lessons and their materials', () => {
  const { container } = render(<TechnicalLearningPath />);
  expect(hasTechnicalPresentationRelease(catalog)).toBe(true);
  expect(container.querySelectorAll('video')).toHaveLength(8);
  expect(container.querySelector('video track')).toBeNull();
  expect(screen.getAllByRole('link', { name: 'Download complete subject kit ↓' })).toHaveLength(4);
  expect(screen.getByRole('link', { name: 'Download complete offline package ↓' })).toBeInTheDocument();
  expect(catalog.presentationRelease.curriculumApproval).toBe(false);
  expect(catalog.presentationRelease.learnerEnrolment).toBe(false);
});

test('without an authorised release, public pages contain no technical movies or downloads', () => {
  const release = catalog.presentationRelease;
  delete catalog.presentationRelease;
  try {
    const { container } = render(<TechnicalLearningPath />);
    expect(screen.getByText(/New lesson media is not published/)).toBeInTheDocument();
    expect(container.querySelector('video')).toBeNull();
    expect(container.querySelector('textarea')).toBeNull();
    expect(container.querySelector('a[download]')).toBeNull();
  } finally { catalog.presentationRelease = release; }
});

test.each(catalog.lessons)('a direct subject page has its own main heading: $id', lesson => {
  const { container } = render(<TechnicalLearningPath route={'technical/' + lesson.id} />);
  expect(screen.getByRole('heading', { level: 1, name: lesson.title })).toBeInTheDocument();
  expect(container.querySelectorAll('video')).toHaveLength(2);
});

test('missing evidence, an unlisted lesson, or claimed enrolment cannot enable a technical release', () => {
  for (const flag of REQUIRED_EVIDENCE) {
    const copy = JSON.parse(JSON.stringify(catalog)); copy.lessons[0].evidence[flag] = false;
    expect(hasTechnicalPresentationRelease(copy)).toBe(false);
  }
  const changed = JSON.parse(JSON.stringify(catalog)); changed.presentationRelease.lessonIds[0] = 'unapproved';
  expect(hasTechnicalPresentationRelease(changed)).toBe(false);
  expect(hasTechnicalPresentationRelease({ ...catalog, presentationRelease: { ...catalog.presentationRelease, learnerEnrolment: true } })).toBe(false);
});
