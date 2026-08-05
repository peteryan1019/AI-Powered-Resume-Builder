import { CommonModule } from '@angular/common';
import {
  Component,
  ElementRef,
  EventEmitter,
  Input,
  OnChanges,
  Output,
  SimpleChanges,
  inject,
} from '@angular/core';
import type { ResumeContent } from '../../services/resume.service';

@Component({
  selector: 'app-resume-live-preview',
  standalone: true,
  imports: [CommonModule],
  template: `
    <article class="resume-page" [ngClass]="templateClass" (click)="selectFromPreview($event)">
      <header class="resume-header">
        <h1
          [attr.data-resume-id]="content.header.name.id"
          [class.edit-highlight]="isHighlighted(content.header.name.id)"
        >
          {{ content.header.name.text }}
        </h1>

        <div class="contact-line">
          @for (part of content.header.contact.parts; track part.id) {
            <span [attr.data-resume-id]="part.id" [class.edit-highlight]="isHighlighted(part.id)">
              @if (part.href) {
                <a [href]="part.href">{{ part.text }}</a>
              } @else {
                {{ part.text }}
              }
            </span>
          }
        </div>
      </header>

      @for (section of content.sections; track section.id) {
        <section class="resume-section" [ngClass]="'section-' + section.type">
          <h2 [attr.data-resume-id]="section.id" [class.edit-highlight]="isHighlighted(section.id)">
            {{ section.title }}
          </h2>

          @switch (section.type) {
            @case ('bullets') {
              <ul>
                @for (bullet of section.bullets; track bullet.id) {
                  <li
                    [attr.data-resume-id]="bullet.id"
                    [class.edit-highlight]="isHighlighted(bullet.id)"
                  >
                    @if (bullet.label) {
                      <strong>{{ bullet.label }}</strong>
                    }

                    {{ bullet.text }}

                    @if (bullet.url) {
                      <a [href]="bullet.url">{{ bullet.url }}</a>
                    }
                  </li>
                }
              </ul>
            }

            @case ('entries') {
              @for (entry of section.entries; track entry.id) {
                <article
                  class="resume-entry project-entry"
                  [attr.data-resume-id]="entry.id"
                  [class.edit-highlight]="isHighlighted(entry.id)"
                >
                  <div class="project-heading">
                    @if (entry.heading) {
                      <strong class="entry-title">{{ entry.heading }}</strong>
                    }

                    @if (entry.meta) {
                      <span class="entry-meta">{{ entry.meta }}</span>
                    }

                    @if (entry.date) {
                      <span class="entry-date">{{ entry.date }}</span>
                    }
                  </div>

                  <ul>
                    @for (bullet of entry.bullets; track bullet.id) {
                      <li
                        [attr.data-resume-id]="bullet.id"
                        [class.edit-highlight]="isHighlighted(bullet.id)"
                      >
                        {{ bullet.text }}

                        @if (bullet.url) {
                          <a [href]="bullet.url">{{ bullet.url }}</a>
                        }
                      </li>
                    }
                  </ul>
                </article>
              }
            }

            @case ('org_entries') {
              @for (entry of section.entries; track entry.id) {
                <article
                  class="resume-entry organization-entry"
                  [attr.data-resume-id]="entry.id"
                  [class.edit-highlight]="isHighlighted(entry.id)"
                >
                  <div class="organization-heading">
                    @if (entry.org) {
                      <strong class="entry-organization">{{ entry.org }}</strong>
                    }

                    @if (entry.role) {
                      <span class="entry-role">{{ entry.role }}</span>
                    }

                    @if (entry.location) {
                      <span class="entry-location">{{ entry.location }}</span>
                    }

                    @if (entry.date) {
                      <span class="entry-date">{{ entry.date }}</span>
                    }
                  </div>

                  <ul>
                    @for (bullet of entry.bullets; track bullet.id) {
                      <li
                        [attr.data-resume-id]="bullet.id"
                        [class.edit-highlight]="isHighlighted(bullet.id)"
                      >
                        {{ bullet.text }}

                        @if (bullet.url) {
                          <a [href]="bullet.url">{{ bullet.url }}</a>
                        }
                      </li>
                    }
                  </ul>
                </article>
              }
            }

            @case ('education') {
              <div
                class="education-school"
                [attr.data-resume-id]="section.school.id"
                [class.edit-highlight]="isHighlighted(section.school.id)"
              >
                <strong>{{ section.school.text }}</strong>
              </div>

              <ul>
                @for (bullet of section.bullets; track bullet.id) {
                  <li
                    [attr.data-resume-id]="bullet.id"
                    [class.edit-highlight]="isHighlighted(bullet.id)"
                  >
                    {{ bullet.text }}

                    @if (bullet.url) {
                      <a [href]="bullet.url">{{ bullet.url }}</a>
                    }
                  </li>
                }
              </ul>
            }
          }
        </section>
      }
    </article>
  `,
  styles: [
    `
      :host {
        display: block;
        container-type: inline-size;
      }

      .resume-page {
        --resume-accent: #1f3864;
        --resume-ink: #000;
        --resume-muted: #666;
        --resume-hairline: #c7ccc8;
        --resume-link: #1155cc;
        --body-size: 1.797cqw;
        --body-leading: 1.22;
        box-sizing: border-box;
        width: 100%;
        min-height: 129.412cqw;
        margin: 0;
        padding: 2.7% 2.94%;
        background: #fff;
        color: var(--resume-ink);
        font-family: Carlito, Calibri, Arial, Helvetica, sans-serif;
        font-size: var(--body-size);
        line-height: var(--body-leading);
      }

      .resume-page,
      .resume-page * {
        box-sizing: border-box;
      }

      .resume-header {
        margin: 0;
      }

      .resume-header h1 {
        margin: 0;
        font-size: inherit;
        line-height: 1;
      }

      .contact-line {
        display: flex;
        flex-wrap: wrap;
        align-items: baseline;
        gap: 0;
      }

      .contact-line > span + span::before {
        white-space: pre;
      }

      a {
        color: var(--resume-link);
        text-decoration: underline;
        text-underline-offset: 0.08em;
      }

      .resume-section {
        margin: 0;
      }

      .resume-section h2 {
        margin: 0;
        font-size: inherit;
        line-height: 1;
      }

      .resume-entry,
      .education-school {
        margin: 0;
      }

      .project-heading,
      .organization-heading {
        min-width: 0;
      }

      .entry-meta,
      .entry-location,
      .entry-date {
        color: var(--resume-muted);
      }

      .entry-meta,
      .entry-location {
        font-style: italic;
      }

      ul {
        margin: 0;
        padding: 0;
        list-style: none;
      }

      li {
        position: relative;
        margin: 0;
      }

      li::before {
        position: absolute;
        font-weight: 400;
      }

      /* Signal ------------------------------------------------------------ */
      .template-signal {
        --resume-accent: #1f3864;
        --resume-ink: #000;
        --resume-muted: #666;
        --resume-hairline: #1f3864;
        --resume-link: #1155cc;
        --body-size: 1.797cqw;
        --body-leading: 1.221;
        padding: 2.7% 2.94%;
      }

      .template-signal .resume-header {
        text-align: center;
      }

      .template-signal .resume-header h1 {
        color: var(--resume-accent);
        font-size: 3.268cqw;
        font-weight: 700;
      }

      .template-signal .contact-line {
        justify-content: center;
        margin-top: 0.92cqw;
        color: #444;
      }

      .template-signal .contact-line > span + span::before {
        content: ' • ';
        color: #444;
      }

      .template-signal .resume-section {
        margin-top: 4.1cqw;
      }

      .template-signal .resume-section h2 {
        padding-bottom: 0.93cqw;
        border-bottom: 0.13cqw solid var(--resume-accent);
        color: var(--resume-accent);
        font-size: 1.961cqw;
        font-weight: 700;
      }

      .template-signal .resume-section > ul,
      .template-signal .resume-section > .resume-entry,
      .template-signal .resume-section > .education-school {
        margin-top: 2.7cqw;
      }

      .template-signal .resume-entry + .resume-entry {
        margin-top: 3.75cqw;
      }

      .template-signal .project-heading {
        display: flex;
        flex-wrap: wrap;
        align-items: baseline;
      }

      .template-signal .project-heading > * + *::before {
        content: ' • ';
        white-space: pre;
        color: var(--resume-ink);
        font-style: normal;
        font-weight: 400;
      }

      .template-signal .organization-heading {
        display: flex;
        flex-wrap: wrap;
        align-items: baseline;
      }

      .template-signal .entry-organization {
        flex-basis: 100%;
      }

      .template-signal .organization-heading > .entry-location::before,
      .template-signal .organization-heading > .entry-date::before {
        content: ' • ';
        white-space: pre;
        color: var(--resume-ink);
        font-style: normal;
      }

      .template-signal .resume-entry > ul,
      .template-signal .section-education > ul {
        margin-top: 0.55cqw;
      }

      .template-signal li {
        padding-left: 2.94cqw;
      }

      .template-signal li + li {
        margin-top: 0.28cqw;
      }

      .template-signal li::before {
        left: 0.98cqw;
        content: '•';
        color: var(--resume-ink);
      }

      /* Evergreen --------------------------------------------------------- */
      .template-evergreen {
        --resume-accent: #164a3a;
        --resume-ink: #212121;
        --resume-muted: #6b6b6b;
        --resume-hairline: #c7ccc8;
        --resume-link: #165a4a;
        --body-size: 1.716cqw;
        --body-leading: 1.2;
        padding: 6.55% 7.52%;
      }

      .template-evergreen .resume-header {
        padding-bottom: 1.55cqw;
        border-bottom: 0.18cqw solid var(--resume-accent);
        text-align: left;
      }

      .template-evergreen .resume-header h1 {
        color: var(--resume-accent);
        font-size: 3.431cqw;
        font-weight: 700;
        letter-spacing: 0.098cqw;
      }

      .template-evergreen .contact-line {
        justify-content: flex-start;
        margin-top: 0.98cqw;
        color: var(--resume-muted);
        font-size: 1.569cqw;
      }

      .template-evergreen .contact-line > span + span::before {
        content: '  ·  ';
        color: var(--resume-hairline);
      }

      .template-evergreen .resume-section {
        margin-top: 3.43cqw;
      }

      .template-evergreen .resume-section:first-of-type {
        margin-top: 3.92cqw;
      }

      .template-evergreen .resume-section h2 {
        display: flex;
        align-items: center;
        gap: 1.47cqw;
        color: var(--resume-accent);
        font-size: 1.601cqw;
        font-weight: 700;
        letter-spacing: 0.221cqw;
        white-space: nowrap;
      }

      .template-evergreen .resume-section h2::after {
        height: 1px;
        flex: 1;
        background: var(--resume-hairline);
        content: '';
      }

      .template-evergreen .resume-section > ul,
      .template-evergreen .resume-section > .resume-entry,
      .template-evergreen .resume-section > .education-school {
        margin-top: 2.45cqw;
      }

      .template-evergreen .resume-entry + .resume-entry {
        margin-top: 3.36cqw;
      }

      .template-evergreen .project-heading {
        display: grid;
        grid-template-columns: minmax(0, 1fr) auto;
        column-gap: 2.29cqw;
        align-items: baseline;
      }

      .template-evergreen .project-heading .entry-title {
        grid-column: 1;
        grid-row: 1;
      }

      .template-evergreen .project-heading .entry-date {
        grid-column: 2;
        grid-row: 1;
        white-space: nowrap;
      }

      .template-evergreen .entry-meta {
        grid-column: 1 / -1;
        grid-row: 2;
      }

      .template-evergreen .organization-heading {
        display: grid;
        grid-template-columns: auto minmax(0, 1fr) auto;
        column-gap: 0.45cqw;
        align-items: baseline;
      }

      .template-evergreen .entry-organization {
        grid-column: 1 / 3;
        grid-row: 1;
      }

      .template-evergreen .organization-heading .entry-date {
        grid-column: 3;
        grid-row: 1;
        white-space: nowrap;
      }

      .template-evergreen .entry-role {
        grid-column: 1;
        grid-row: 2;
      }

      .template-evergreen .entry-location {
        grid-column: 2;
        grid-row: 2;
      }

      .template-evergreen .entry-role + .entry-location::before {
        content: '  ·  ';
        white-space: pre;
        color: var(--resume-hairline);
        font-style: normal;
      }

      .template-evergreen .resume-entry > ul,
      .template-evergreen .section-education > ul {
        margin-top: 0.6cqw;
      }

      .template-evergreen li {
        padding-left: 2.29cqw;
      }

      .template-evergreen li + li {
        margin-top: 0.34cqw;
      }

      .template-evergreen li::before {
        left: 0.33cqw;
        content: '–';
        color: var(--resume-accent);
      }

      /* Atelier ----------------------------------------------------------- */
      .template-atelier {
        --resume-accent: #66212a;
        --resume-ink: #1d1c1b;
        --resume-muted: #6f6d6a;
        --resume-hairline: #d0cdc9;
        --resume-link: #5c3732;
        --body-size: 1.634cqw;
        --body-leading: 1.22;
        padding: 6.3% 7.19% 6.3% 6.54%;
      }

      .template-atelier .resume-header {
        position: relative;
        padding-bottom: 1.63cqw;
        border-bottom: 0.16cqw solid var(--resume-accent);
        text-align: left;
      }

      .template-atelier .resume-header::after {
        position: absolute;
        right: 0;
        bottom: -0.43cqw;
        left: 0;
        border-top: 1px solid var(--resume-hairline);
        content: '';
      }

      .template-atelier .resume-header h1 {
        color: var(--resume-ink);
        font-size: 3.268cqw;
        font-weight: 700;
        letter-spacing: 0.245cqw;
      }

      .template-atelier .contact-line {
        justify-content: flex-start;
        margin-top: 0.98cqw;
        color: var(--resume-muted);
        font-size: 1.503cqw;
        letter-spacing: 0.057cqw;
      }

      .template-atelier .contact-line > span + span::before {
        content: '  ·  ';
        color: var(--resume-accent);
      }

      .template-atelier .resume-section {
        display: grid;
        grid-template-columns: 15.03% 2.61% minmax(0, 1fr);
        margin-top: 3.43cqw;
        align-items: start;
      }

      .template-atelier .resume-section:first-of-type {
        margin-top: 4.25cqw;
      }

      .template-atelier .resume-section > h2 {
        grid-column: 1;
        grid-row: 1;
        color: var(--resume-accent);
        font-size: 1.373cqw;
        font-weight: 700;
        letter-spacing: 0.18cqw;
        line-height: 1.25;
        text-align: right;
      }

      .template-atelier .resume-section > ul,
      .template-atelier .resume-section > .resume-entry,
      .template-atelier .resume-section > .education-school {
        grid-column: 3;
      }

      .template-atelier .resume-entry + .resume-entry {
        margin-top: 3.4cqw;
      }

      .template-atelier .project-heading {
        display: grid;
        grid-template-columns: minmax(0, 1fr) auto;
        column-gap: 1.96cqw;
        align-items: baseline;
      }

      .template-atelier .project-heading .entry-title {
        grid-column: 1;
        grid-row: 1;
      }

      .template-atelier .project-heading .entry-date {
        grid-column: 2;
        grid-row: 1;
        white-space: nowrap;
      }

      .template-atelier .entry-meta {
        grid-column: 1 / -1;
        grid-row: 2;
      }

      .template-atelier .organization-heading {
        display: grid;
        grid-template-columns: auto minmax(0, 1fr) auto;
        column-gap: 0.45cqw;
        align-items: baseline;
      }

      .template-atelier .entry-organization {
        grid-column: 1 / 3;
        grid-row: 1;
      }

      .template-atelier .organization-heading .entry-date {
        grid-column: 3;
        grid-row: 1;
        white-space: nowrap;
      }

      .template-atelier .entry-role {
        grid-column: 1;
        grid-row: 2;
      }

      .template-atelier .entry-location {
        grid-column: 2;
        grid-row: 2;
      }

      .template-atelier .entry-role + .entry-location::before {
        content: '  ·  ';
        white-space: pre;
        color: var(--resume-hairline);
        font-style: normal;
      }

      .template-atelier .resume-entry > ul,
      .template-atelier .section-education > ul {
        margin-top: 0.55cqw;
      }

      .template-atelier li {
        padding-left: 1.63cqw;
      }

      .template-atelier li + li {
        margin-top: 0.32cqw;
      }

      .template-atelier li::before {
        left: 0;
        content: '·';
        color: var(--resume-accent);
        font-size: 1.2em;
      }

      .edit-highlight {
        outline: 2px solid rgba(231, 170, 0, 0.78);
        outline-offset: 2px;
        border-radius: 0.15rem;
        background: rgba(255, 225, 70, 0.35);
        box-shadow: 0 0 0.7rem rgba(255, 193, 7, 0.25);
        transition:
          outline 0.15s ease,
          background 0.15s ease;
      }

      [data-resume-id] {
        cursor: pointer;
      }

      [data-resume-id]:hover {
        background: rgba(255, 225, 70, 0.16);
      }
    `,
  ],
})
export class ResumeLivePreview implements OnChanges {
  private readonly host = inject<ElementRef<HTMLElement>>(ElementRef);

  @Output()
  elementSelected = new EventEmitter<string>();

  @Input({ required: true })
  content!: ResumeContent;

  @Input({ required: true })
  templateId!: string;

  @Input()
  activeElementId: string | null = null;

  @Input()
  additionalHighlightedIds: readonly string[] = [];

  get templateClass(): string {
    return `template-${this.templateId.trim().toLowerCase()}`;
  }

  ngOnChanges(changes: SimpleChanges): void {
    const shouldScroll = changes['activeElementId'] || changes['additionalHighlightedIds'];
    const scrollTarget = this.activeElementId ?? this.additionalHighlightedIds[0] ?? null;

    if (shouldScroll && scrollTarget) {
      queueMicrotask(() => {
        this.scrollToElement(scrollTarget);
      });
    }
  }

  private scrollToElement(id: string): void {
    const container = this.host.nativeElement;

    const element = Array.from(container.querySelectorAll<HTMLElement>('[data-resume-id]')).find(
      (candidate) => candidate.dataset['resumeId'] === id,
    );

    if (!element) {
      return;
    }

    const containerRect = container.getBoundingClientRect();
    const elementRect = element.getBoundingClientRect();

    const nextScrollTop =
      container.scrollTop +
      elementRect.top -
      containerRect.top -
      container.clientHeight / 2 +
      element.clientHeight / 2;

    container.scrollTo({ top: nextScrollTop, behavior: 'smooth' });
  }

  selectFromPreview(event: MouseEvent): void {
    const clickedElement = event.target as HTMLElement;
    const resumeElement = clickedElement.closest<HTMLElement>('[data-resume-id]');
    const id = resumeElement?.dataset['resumeId'];

    if (id) {
      this.elementSelected.emit(id);
    }
  }

  isHighlighted(id: string): boolean {
    return this.activeElementId === id || this.additionalHighlightedIds.includes(id);
  }
}
