import { vi } from 'vitest';
import { ResumePdfPreviewComponent } from './resume-pdf-preview';
import type { CdkDragEnd, CdkDragMove } from '@angular/cdk/drag-drop';
import type { RenderedResumePreview } from './resume-pdf-layout';

describe('PDF section drag interactions', () => {
  const preview: RenderedResumePreview = {
    pdfBase64: '',
    content: { jobPostTitle: '', header: { name: { id: 'name', text: '' }, contact: { id: 'contact', parts: [] } },
      sections: ['a', 'b', 'c'].map(id => ({ id, title: id, type: 'bullets', bullets: [] })) },
    layout: { pageWidth: 612, pageHeight: 792, fontSize: 10,
      elements: { a: [40, 682, 500, 10], b: [40, 482, 500, 10], c: [40, 282, 500, 10] } },
  };
  let component: ResumePdfPreviewComponent;
  beforeEach(() => {
    component = new ResumePdfPreviewComponent();
    Object.assign(component, { renderedPreview: preview, pageFrame: { nativeElement: { getBoundingClientRect: () => ({ top: 100 }) } } });
    vi.stubGlobal('cancelAnimationFrame', vi.fn());
  });
  afterEach(() => vi.unstubAllGlobals());

  it('uses viewport coordinates when the outer page is scrolled', () => {
    vi.stubGlobal('scrollY', 600);
    const moved = vi.fn();
    component.sectionMoved.subscribe(moved);
    component.draggingSection.set('a');
    // Section b is 300 PDF points down; at 4/3 scale and viewport top=100,
    // its drop boundary is clientY=500, regardless of window.scrollY.
    component.moveDrag({ pointerPosition: { x: 0, y: 500 } } as CdkDragMove);
    component.endDrag({ source: { reset: vi.fn() } } as unknown as CdkDragEnd);
    expect(moved).toHaveBeenCalledWith({ sectionId: 'a', beforeSectionId: 'b' });
  });
  it('moves the whole section with the keyboard, including insertion at the end', () => {
    const moved = vi.fn();
    component.sectionMoved.subscribe(moved);
    component.moveWithKeyboard(new KeyboardEvent('keydown', { key: 'ArrowDown' }), 'b');
    expect(moved).toHaveBeenCalledWith({ sectionId: 'b', beforeSectionId: null });
    component.moveWithKeyboard(new KeyboardEvent('keydown', { key: 'ArrowUp' }), 'a');
    expect(moved).toHaveBeenCalledTimes(1);
  });
  it('prevents reordering while the displayed PDF is stale', () => {
    const moved = vi.fn();
    component.sectionMoved.subscribe(moved);
    component.busy = true;
    component.moveWithKeyboard(new KeyboardEvent('keydown', { key: 'ArrowDown' }), 'a');
    expect(moved).not.toHaveBeenCalled();
  });
});
