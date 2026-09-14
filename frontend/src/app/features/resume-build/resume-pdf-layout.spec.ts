import { pdfEditAnchors, pdfSectionBoundaries, type RenderedResumePreview } from './resume-pdf-layout';

function preview(): RenderedResumePreview {
  return {
    pdfBase64: '',
    layout: { pageWidth: 612, pageHeight: 792, fontSize: 10,
      elements: { skills: [40, 710, 500, 10], a: [40, 680, 500, 30], b: [40, 660, 500, 10], jobs: [40, 600, 500, 10], jobBullet: [40, 560, 500, 10] } },
    content: { jobPostTitle: '', header: { name: { id: 'name', text: '' }, contact: { id: 'contact', parts: [] } }, sections: [
      { id: 'skills', title: 'Skills', type: 'bullets', bullets: [{ id: 'a', text: 'Wraps over three lines' }, { id: 'b', text: 'One line' }, { id: 'empty', text: '' }] },
      { id: 'jobs', title: 'Work', type: 'org_entries', entries: [{ id: 'job', org: 'Company', role: '', location: '', date: '', bullets: [{ id: 'jobBullet', text: 'Built a service' }] }] },
    ] },
  };
}

describe('PDF edit coordinates', () => {
  it('aligns a wrapped bullet to its first line rather than the last line or block center', () => {
    const anchors = pdfEditAnchors(preview());
    expect(anchors[0].y).toBeCloseTo(88.5);
    expect(anchors[1].y).toBeCloseTo(128.5);
  });
  it('maps nested bullets to the whole section and skips content pruned from the PDF', () => {
    expect(pdfEditAnchors(preview()).map(a => [a.id, a.sectionId])).toEqual([
      ['a', 'skills'], ['b', 'skills'], ['jobBullet', 'jobs'],
    ]);
  });
  it('provides section insertion positions independently of bullet positions', () => {
    expect(pdfSectionBoundaries(preview())).toEqual([{ id: 'skills', y: 72 }, { id: 'jobs', y: 182 }]);
  });
  it('still provides a handle for a rendered section with no bullets', () => {
    const data = preview();
    data.content.sections[0] = { id: 'skills', title: 'Skills', type: 'bullets', bullets: [] };
    expect(pdfEditAnchors(data)[0]).toMatchObject({ id: 'skills', sectionId: 'skills', label: 'Edit Skills' });
  });
  it('does not invent coordinates when metadata is unavailable', () => {
    expect(pdfEditAnchors({ ...preview(), layout: null })).toEqual([]);
  });
});
