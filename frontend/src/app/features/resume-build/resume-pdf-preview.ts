import {
  AfterViewInit, Component, ElementRef, EventEmitter, Input, OnChanges, OnDestroy,
  Output, ViewChild, signal,
} from '@angular/core';
import { CdkDrag, CdkDragHandle, type CdkDragEnd, type CdkDragMove } from '@angular/cdk/drag-drop';
import type { PDFDocumentLoadingTask } from 'pdfjs-dist';
import { pdfEditAnchors, pdfSectionBoundaries, type RenderedResumePreview, type SectionMove } from './resume-pdf-layout';

@Component({
  selector: 'app-resume-pdf-preview',
  standalone: true,
  imports: [CdkDrag, CdkDragHandle],
  template: `
    <div class="preview-toolbar">
      <span>PDF preview</span>
      <div class="zoom-controls" aria-label="PDF zoom">
        <button type="button" class="fit-button" (click)="fitToWidth()" [disabled]="!!draggingSection()" aria-label="Fit PDF to preview width">Fit</button>
        <button type="button" (click)="zoomBy(-0.1)" [disabled]="zoom() <= 0.75 || !!draggingSection()" aria-label="Zoom out">−</button>
        <output>{{ (zoom() * 100).toFixed(0) }}%</output>
        <button type="button" (click)="zoomBy(0.1)" [disabled]="zoom() >= 1.5 || !!draggingSection()" aria-label="Zoom in">+</button>
      </div>
    </div>
    <p class="instructions">Use a pencil to edit a bullet. Drag ☰ to move its whole section, or focus the handle and use ↑ / ↓.</p>
    <p class="status" role="status" aria-live="polite">{{ announcement() || (busy ? 'Saving changes and updating the PDF…' : rendering() ? 'Rendering PDF…' : 'Preview matches the saved PDF.') }}</p>
    @if (renderError()) { <p class="error" role="alert">{{ renderError() }}</p> }
    @if (preview && !preview.layout) { <p class="error">Edit controls are unavailable for this PDF. You can still edit using the form.</p> }
    <div class="pdf-scroll" #scrollArea>
      <div class="page-frame" #pageFrame [style.width.px]="pageWidth()" [style.height.px]="pageHeight()">
        <div class="paper" #canvasHost role="img" aria-label="Saved resume PDF"></div>
        @if (!rendering() && !renderError()) {
          @for (anchor of anchors(); track anchor.id; let i = $index) {
            <div class="edit-controls" [style.top.px]="anchor.y * scale()"
              [style.height.px]="controlHeight(i)" [style.margin-top.px]="-controlHeight(i) / 2" [class.selected]="activeElementId === anchor.id"
              cdkDrag cdkDragLockAxis="y" [cdkDragDisabled]="busy"
              (cdkDragStarted)="startDrag(anchor.sectionId)"
              (cdkDragMoved)="moveDrag($event)" (cdkDragEnded)="endDrag($event)">
              <button type="button" class="edit-button" [attr.aria-label]="anchor.label"
                [title]="anchor.label" [disabled]="busy" (click)="elementSelected.emit(anchor.id)">
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" aria-hidden="true"><path d="m15 5 4 4M4 20l4-1 12-12a2.8 2.8 0 0 0-4-4L4 15z"/></svg>
              </button>
              <button type="button" class="drag-handle" cdkDragHandle
                [attr.aria-label]="'Move section: ' + anchor.sectionTitle"
                [title]="'Drag to move ' + anchor.sectionTitle + '. Or use the up and down arrow keys.'"
                [disabled]="busy" (keydown)="moveWithKeyboard($event, anchor.sectionId)">
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true"><path d="M4 6h16M4 12h16M4 18h16"/></svg>
              </button>
            </div>
          }
          @if (draggingSection() && dropY() !== null) {
            <div class="drop-line" [style.top.px]="dropY()! * scale()"><span>Move {{ draggingTitle() }} here</span></div>
          }
        }
      </div>
    </div>
  `,
  styles: [`
    :host { display: block; min-width: 0; }
    .preview-toolbar, .zoom-controls { display: flex; align-items: center; justify-content: space-between; gap: .6rem; }
    .preview-toolbar { font-weight: 650; }
    .zoom-controls button { border: 1px solid #514879; border-radius: 6px; background: #292440; color: #eee; width: 28px; height: 28px; cursor: pointer; }
    .zoom-controls .fit-button { width: 36px; }
    output { min-width: 3em; text-align: center; font-size: .8rem; }
    .instructions { font-size: .8rem; line-height: 1.6; color: #b9b4cd; margin: .7rem 0; }
    .status { min-height: 1.2em; color: #bdb0fb; font-size: .75rem; }
    .error { color: #ffb0b0; font-size: .85rem; }
    .pdf-scroll { overflow: auto; max-height: calc(100vh - 17rem); background: #19182a; border: 1px solid #39324c; border-radius: 8px; scrollbar-gutter: stable; }
    .page-frame { position: relative; margin: 20px 20px 24px 72px; flex-shrink: 0; }
    .paper { width: 100%; height: 100%; background: white; box-shadow: 0 3px 15px #0004; }
    .paper :is(canvas) { display: block; width: 100%; height: 100%; }
    .edit-controls { position: absolute; right: calc(100% + 9px); width: 52px; display: flex; gap: 4px; margin-top: -8px; z-index: 2; }
    .edit-controls button { box-sizing: border-box; display: grid; place-items: center; padding: 1px 3px; width: 24px; height: 100%; border: 0; border-radius: 3px; color: #c4bcdd; background: #29253f; cursor: pointer; }
    .edit-controls svg { width: 100%; height: 100%; max-height: 16px; }
    .edit-controls button:hover, .selected .edit-button { color: white; background: #7154bd; }
    .edit-controls button:focus-visible, .zoom-controls button:focus-visible { outline: 2px solid #c1a3ff; outline-offset: 2px; }
    button:disabled { opacity: .4; cursor: default; }
    .edit-controls .drag-handle { cursor: grab; touch-action: none; }
    .cdk-drag-dragging .drag-handle { cursor: grabbing; background: #7154bd; color: white; }
    .drop-line { position: absolute; left: -62px; right: 0; height: 2px; background: #b497ff; pointer-events: none; z-index: 3; }
    .drop-line span { position: absolute; left: 64px; bottom: 3px; background: #4d357f; color: white; border-radius: 4px; padding: 4px 8px; font-size: 12px; }
    @media (max-width: 650px) { .pdf-scroll { max-height: 70vh; } }
  `],
})
export class ResumePdfPreviewComponent implements AfterViewInit, OnChanges, OnDestroy {
  @Input() preview: RenderedResumePreview | null = null;
  @Input() activeElementId: string | null = null;
  @Input() busy = false;
  @Output() elementSelected = new EventEmitter<string>();
  @Output() sectionMoved = new EventEmitter<SectionMove>();
  @ViewChild('canvasHost') private canvasHost!: ElementRef<HTMLDivElement>;
  @ViewChild('pageFrame') private pageFrame!: ElementRef<HTMLDivElement>;
  @ViewChild('scrollArea') private scrollArea!: ElementRef<HTMLDivElement>;

  readonly zoom = signal(1);
  readonly rendering = signal(true);
  readonly renderError = signal<string | null>(null);
  readonly pageWidth = signal(816);
  readonly pageHeight = signal(1056);
  readonly anchors = signal<ReturnType<typeof pdfEditAnchors>>([]);
  readonly draggingSection = signal<string | null>(null);
  readonly draggingTitle = signal('');
  readonly dropY = signal<number | null>(null);
  readonly announcement = signal('');
  private ready = false;
  private generation = 0;
  private loadingTask?: PDFDocumentLoadingTask;
  private beforeSectionId: string | null = null;
  private renderedPreview: RenderedResumePreview | null = null;
  private resizeObserver?: ResizeObserver;
  private autoFit = true;
  private dragClientY: number | null = null;
  private scrollFrame = 0;

  scale(): number { return (4 / 3) * this.zoom(); }
  ngAfterViewInit(): void {
    this.ready = true;
    this.resizeObserver = new ResizeObserver(() => { if (this.autoFit && !this.draggingSection()) this.fitToWidth(); });
    this.resizeObserver.observe(this.scrollArea.nativeElement);
    void this.render();
  }
  ngOnChanges(changes: import('@angular/core').SimpleChanges): void {
    if (changes['preview'] && this.ready) void this.render();
  }
  zoomBy(delta: number): void {
    this.autoFit = false;
    this.zoom.set(Math.max(.75, Math.min(1.5, Math.round((this.zoom() + delta) * 100) / 100)));
    void this.render();
  }
  fitToWidth(): void {
    this.autoFit = true;
    // Keep small screens readable with horizontal scrolling instead of reducing
    // an entire resume to a postage stamp. Desktop starts fitted to its panel.
    const zoom = Math.max(.75, Math.min(1, (this.scrollArea.nativeElement.clientWidth - 96) / 816));
    if (Math.abs(zoom - this.zoom()) < .005) return;
    this.zoom.set(zoom);
    void this.render();
  }
  controlHeight(index: number): number {
    const rows = this.anchors();
    const gaps = [rows[index + 1]?.y - rows[index].y, rows[index].y - rows[index - 1]?.y].filter(Number.isFinite);
    return Math.max(8, Math.min(20, ...gaps.map(gap => gap * this.scale() - 1)));
  }

  private async render(): Promise<void> {
    const preview = this.preview;
    if (!preview) return;
    const generation = ++this.generation;
    this.rendering.set(true);
    this.renderError.set(null);
    const previous = this.loadingTask;
    this.loadingTask = undefined;
    let task: PDFDocumentLoadingTask | undefined;
    try {
      await previous?.destroy();
      const pdfjs = await import('pdfjs-dist');
      if (generation !== this.generation) return;
      // Keep the worker URL versioned. Apart from matching the installed PDF.js
      // release, a new URL prevents browsers from reusing response metadata
      // cached before the server knew that .mjs files are JavaScript modules.
      pdfjs.GlobalWorkerOptions.workerSrc = new URL('assets/pdfjs/v6.3.289/pdf.worker.min.mjs', document.baseURI).href;
      task = pdfjs.getDocument({
        data: Uint8Array.from(atob(preview.pdfBase64), c => c.charCodeAt(0)),
        standardFontDataUrl: new URL('assets/pdfjs/standard_fonts/', document.baseURI).href,
        wasmUrl: new URL('assets/pdfjs/wasm/', document.baseURI).href,
      });
      this.loadingTask = task;
      const pdf = await task.promise;
      const page = await pdf.getPage(1);
      const viewport = page.getViewport({ scale: this.scale() });
      const pixelRatio = Math.min(window.devicePixelRatio || 1, 2);
      // Render off-screen, then swap atomically. A slow older render cannot
      // paint over a new PDF or leave controls attached to the wrong version.
      const canvas = document.createElement('canvas');
      canvas.width = Math.ceil(viewport.width * pixelRatio);
      canvas.height = Math.ceil(viewport.height * pixelRatio);
      canvas.style.width = '100%';
      canvas.style.height = '100%';
      canvas.style.display = 'block';
      await page.render({ canvas, viewport, transform: [pixelRatio, 0, 0, pixelRatio, 0, 0] }).promise;
      if (generation !== this.generation) return;
      this.canvasHost.nativeElement.replaceChildren(canvas);
      this.pageWidth.set(viewport.width);
      this.pageHeight.set(viewport.height);
      this.renderedPreview = preview;
      this.anchors.set(pdfEditAnchors(preview));
      this.announcement.set('');
    } catch {
      if (generation === this.generation) this.renderError.set('Unable to display the PDF. Use Save and refresh preview to retry.');
    } finally {
      if (generation === this.generation) this.rendering.set(false);
      await task?.destroy().catch(() => undefined);
      if (this.loadingTask === task) this.loadingTask = undefined;
    }
  }

  startDrag(sectionId: string): void {
    this.draggingSection.set(sectionId);
    this.draggingTitle.set(this.renderedPreview?.content.sections.find(s => s.id === sectionId)?.title || 'section');
    this.dropY.set(null);
    this.dragClientY = null;
    this.scrollWhileDragging();
  }
  moveDrag(event: CdkDragMove): void {
    // CDK reports viewport coordinates (already corrected for window scrolling).
    this.dragClientY = event.pointerPosition.y;
    this.updateDropTarget();
  }
  private scrollWhileDragging(): void {
    this.scrollFrame = requestAnimationFrame(() => {
      if (!this.draggingSection()) return;
      if (this.dragClientY !== null) {
        const scroll = this.scrollArea.nativeElement;
        const bounds = scroll.getBoundingClientRect();
        if (this.dragClientY > bounds.bottom - 45) scroll.scrollTop += 10;
        else if (this.dragClientY < bounds.top + 45) scroll.scrollTop -= 10;
        this.updateDropTarget();
      }
      this.scrollWhileDragging();
    });
  }
  private updateDropTarget(): void {
    if (!this.renderedPreview) return;
    if (this.dragClientY === null) return;
    const y = (this.dragClientY - this.pageFrame.nativeElement.getBoundingClientRect().top) / this.scale();
    const sections = pdfSectionBoundaries(this.renderedPreview);
    const layout = this.renderedPreview.layout!;
    const lastBottom = Math.max(0, ...Object.values(layout.elements).map(box => layout.pageHeight - box[1]));
    const targets: { id: string | null; y: number }[] = [...sections, { id: null, y: Math.min(layout.pageHeight, lastBottom + 14) }];
    const nearest = targets.reduce((a, b) => Math.abs(a.y - y) <= Math.abs(b.y - y) ? a : b);
    this.beforeSectionId = nearest.id;
    this.dropY.set(nearest.y);
  }
  endDrag(event: CdkDragEnd): void {
    cancelAnimationFrame(this.scrollFrame);
    const sectionId = this.draggingSection();
    event.source.reset();
    if (sectionId && this.dropY() !== null && !this.busy) {
      this.sectionMoved.emit({ sectionId, beforeSectionId: this.beforeSectionId });
      this.announcement.set(`Moved ${this.draggingTitle()}. Updating PDF…`);
    }
    this.draggingSection.set(null);
    this.dropY.set(null);
  }
  moveWithKeyboard(event: KeyboardEvent, sectionId: string): void {
    if (this.busy || !this.renderedPreview || !['ArrowUp', 'ArrowDown'].includes(event.key)) return;
    event.preventDefault();
    const sections = this.renderedPreview.content.sections;
    const index = sections.findIndex(s => s.id === sectionId);
    if (index < 0 || (event.key === 'ArrowUp' ? index === 0 : index === sections.length - 1)) return;
    const beforeSectionId = event.key === 'ArrowUp' ? sections[index - 1].id : sections[index + 2]?.id ?? null;
    this.sectionMoved.emit({ sectionId, beforeSectionId });
    this.announcement.set(`Moved ${sections[index].title}. Updating PDF…`);
  }
  ngOnDestroy(): void {
    ++this.generation;
    this.resizeObserver?.disconnect();
    cancelAnimationFrame(this.scrollFrame);
    void this.loadingTask?.destroy().catch(() => undefined);
  }
}
