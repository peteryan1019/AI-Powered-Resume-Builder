import { CommonModule } from '@angular/common';
import { Component, Input } from '@angular/core';
import { ResumeContent } from '../../services/resume.service';

@Component({
  selector: 'app-resume-live-preview',
  standalone: true,
  imports: [CommonModule],
  template: `
    <article class="resume-page" [ngClass]="'template-' + templateId">
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
        <section class="resume-section">
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
                      <strong>{{ bullet.label }}:</strong>
                    }

                    {{ bullet.text }}
                  </li>
                }
              </ul>
            }

            @case ('entries') {
              @for (entry of section.entries; track entry.id) {
                <article
                  class="resume-entry"
                  [attr.data-resume-id]="entry.id"
                  [class.edit-highlight]="isHighlighted(entry.id)"
                >
                  <div class="entry-heading">
                    <strong>{{ entry.heading }}</strong>
                    <span>{{ entry.date }}</span>
                  </div>

                  <div class="entry-meta">
                    {{ entry.meta }}
                  </div>

                  <ul>
                    @for (bullet of entry.bullets; track bullet.id) {
                      <li
                        [attr.data-resume-id]="bullet.id"
                        [class.edit-highlight]="isHighlighted(bullet.id)"
                      >
                        {{ bullet.text }}
                      </li>
                    }
                  </ul>
                </article>
              }
            }

            @case ('org_entries') {
              @for (entry of section.entries; track entry.id) {
                <article
                  class="resume-entry"
                  [attr.data-resume-id]="entry.id"
                  [class.edit-highlight]="isHighlighted(entry.id)"
                >
                  <div class="entry-heading">
                    <strong>{{ entry.org }}</strong>
                    <span>{{ entry.date }}</span>
                  </div>

                  <div class="entry-heading secondary">
                    <span>{{ entry.role }}</span>
                    <span>{{ entry.location }}</span>
                  </div>

                  <ul>
                    @for (bullet of entry.bullets; track bullet.id) {
                      <li
                        [attr.data-resume-id]="bullet.id"
                        [class.edit-highlight]="isHighlighted(bullet.id)"
                      >
                        {{ bullet.text }}
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
      }

      .resume-page {
        --resume-accent: #174785;
        box-sizing: border-box;
        width: 100%;
        aspect-ratio: 8.5 / 11;
        padding: 6% 7%;
        background: #fff;
        color: #111;
        font-family: Arial, Helvetica, sans-serif;
        font-size: 0.72rem;
        line-height: 1.3;
      }

      .template-signal {
        --resume-accent: #174785;
      }

      .template-evergreen {
        --resume-accent: #28634a;
      }

      .template-atelier {
        --resume-accent: #794b36;
      }

      .resume-header {
        margin-bottom: 1.25rem;
        padding-bottom: 0.5rem;
        border-bottom: 2px solid var(--resume-accent);
        text-align: left;
      }

      .resume-header h1 {
        margin: 0 0 0.25rem;
        color: var(--resume-accent);
        font-size: 1.45rem;
      }

      .contact-line {
        display: flex;
        flex-wrap: wrap;
        justify-content: center;
        gap: 0.25rem 0.65rem;
        font-size: 0.68rem;
      }

      a {
        color: var(--resume-accent);
      }

      .resume-section {
        margin-top: 0.9rem;
      }

      .resume-section h2 {
        margin: 0 0 0.5rem;
        padding-bottom: 0.18rem;
        border-bottom: 1px solid var(--resume-accent);
        color: var(--resume-accent);
        font-size: 0.86rem;
      }

      .resume-entry {
        margin-bottom: 0.65rem;
      }

      .entry-heading {
        display: flex;
        justify-content: space-between;
        gap: 1rem;
      }

      .entry-heading.secondary {
        color: #444;
        font-style: italic;
      }

      .entry-meta {
        color: #444;
        font-style: italic;
      }

      ul {
        margin: 0.25rem 0 0;
        padding-left: 1.15rem;
      }

      li {
        margin-bottom: 0.15rem;
      }

      .edit-highlight {
        outline: 2px solid rgba(231, 170, 0, 0.75);
        outline-offset: 2px;
        border-radius: 0.15rem;
        background: rgba(255, 225, 70, 0.35);
        box-shadow: 0 0 0.7rem rgba(255, 193, 7, 0.25);
        transition:
          outline 0.15s ease,
          background 0.15s ease;
      }
    `,
  ],
})
export class ResumeLivePreview {
  @Input({ required: true })
  content!: ResumeContent;

  @Input()
  templateId = 'signal';

  @Input()
  activeElementId: string | null = null;

  isHighlighted(id: string): boolean {
    return this.activeElementId === id;
  }
}
