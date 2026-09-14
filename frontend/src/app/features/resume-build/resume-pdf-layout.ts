import type { ResumeContent, ResumePdfPreview } from '../../services/resume.service';

export type RenderedResumePreview = ResumePdfPreview & { content: ResumeContent };
export interface SectionMove { sectionId: string; beforeSectionId: string | null }
export interface PdfEditAnchor {
  id: string;
  sectionId: string;
  sectionTitle: string;
  label: string;
  /** Points from the top of the page, aligned with the first line of text. */
  y: number;
}

export function pdfEditAnchors(preview: RenderedResumePreview): PdfEditAnchor[] {
  const layout = preview.layout;
  if (!layout) return [];
  const anchors: PdfEditAnchor[] = [];
  for (const section of preview.content.sections) {
    const bullets = section.type === 'bullets' ? section.bullets : section.entries.flatMap(e => e.bullets);
    const rendered = bullets.filter(b => layout.elements[b.id]);
    const targets = rendered.length ? rendered : [{ id: section.id }];
    targets.forEach((target, index) => {
      const box = layout.elements[target.id];
      if (!box) return;
      // A wrapped bullet's y is its LAST baseline. Height includes the entire
      // block; subtract it to recover the first line, rather than its midpoint.
      const y = layout.pageHeight - box[1] - box[3] + Math.min(box[3], layout.fontSize) * 0.65;
      if (y < 0 || y > layout.pageHeight) return;
      anchors.push({
        id: target.id, sectionId: section.id, sectionTitle: section.title || 'Untitled section', y,
        label: rendered.length ? `Edit bullet ${index + 1} in ${section.title || 'untitled section'}` : `Edit ${section.title || 'untitled section'}`,
      });
    });
  }
  return anchors.sort((a, b) => a.y - b.y);
}

export function pdfSectionBoundaries(preview: RenderedResumePreview): { id: string; y: number }[] {
  const layout = preview.layout;
  if (!layout) return [];
  const anchors = pdfEditAnchors(preview);
  return preview.content.sections.flatMap(section => {
    const box = layout.elements[section.id];
    const y = box ? layout.pageHeight - box[1] - box[3] : anchors.find(a => a.sectionId === section.id)?.y;
    return y === undefined ? [] : [{ id: section.id, y }];
  });
}
