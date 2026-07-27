import { CommonModule } from '@angular/common';
import { Component, OnInit, inject, signal } from '@angular/core';
import { ActivatedRoute, RouterLink } from '@angular/router';
import { DomSanitizer, SafeResourceUrl } from '@angular/platform-browser';

import { AuthService } from '../auth/auth.service';
import { ResumeBuildService } from './resume-build.service';

@Component({
  selector: 'app-build-result-page',
  standalone: true,
  imports: [CommonModule, RouterLink],
  template: `
    <section class="result-page" *ngIf="pdfURL(); else missing">
      <header class="result-header">
        <div>
          <p class="eyebrow">Your tailored resume</p>
          <h2 class="title">Ready to download</h2>
        </div>
          <div class="actions">
            <a
              *ngIf="resumeId() as id"
              class="primary-action"
              [routerLink]="['/my-resumes', id, 'edit']"
            >
              ✎ Edit resume
            </a>

            <a
              class="tertiary-action"
              routerLink="/my-resumes"
            >
              See my resumes
            </a>
            
            <a
              class="secondary-action"
              [href]="pdfURL()"
              download="resume.pdf"
            >
              Download PDF
            </a>

            <a
              class="secondary-action"
              routerLink="/tailor"
            >
              Build another
            </a>
          </div>
      </header>

      <div class="preview">
        <iframe [src]="safepdfURL()" title="Generated resume preview"></iframe>
      </div>
    </section>

    <ng-template #missing>
      <section class="result-page">
        <h2 class="title">We couldn't find that resume.</h2>
        <p class="fallback"><a routerLink="/tailor">Back to tailor</a></p>
      </section>
    </ng-template>
  `,
  styles: [
    `
      :host {
        --accent-1: #7a61ff;
        --accent-2: #4285f4;
        --ink: #f4f6ff;
      }
      .result-page {
        max-width: 60rem;
        margin: 0 auto;
        padding: 3rem 1.5rem;
        color: var(--ink);
      }
      .result-header {
        display: flex;
        flex-wrap: wrap;
        gap: 1rem;
        justify-content: space-between;
        align-items: flex-end;
        margin-bottom: 1.75rem;
      }
      .eyebrow {
        text-transform: uppercase;
        letter-spacing: 0.16em;
        font-size: 0.72rem;
        font-weight: 700;
        color: #b7a9ff;
        margin: 0 0 0.4rem;
      }
      .title {
        margin: 0;
        font-size: 1.7rem;
        font-weight: 700;
        color: var(--ink);
      }
      .actions {
        flex-wrap: wrap;
        display: flex;
        gap: 0.75rem;
      }
      .primary-action,
      .secondary-action {
        display: inline-flex;
        align-items: center;
        padding: 0.65rem 1.3rem;
        border-radius: 0.7rem;
        font-weight: 600;
        text-decoration: none;
        font-size: 0.9rem;
        transition:
          transform 0.16s ease,
          box-shadow 0.16s ease,
          background 0.16s ease;
      }
      .primary-action {
        background: linear-gradient(135deg, var(--accent-1), var(--accent-2));
        color: #fff;
        box-shadow: 0 12px 28px -14px rgba(66, 133, 244, 0.8);
      }
      .primary-action:hover {
        transform: translateY(-1px);
        box-shadow: 0 16px 32px -14px rgba(66, 133, 244, 0.9);
      }
      .secondary-action {
        border: 1px solid rgba(255, 255, 255, 0.22);
        background: rgba(255, 255, 255, 0.06);
        color: var(--ink);
      }
      .secondary-action:hover {
        background: rgba(255, 255, 255, 0.12);
      }
      .tertiary-action {
        display: inline-flex;
        align-items: center;
        padding: 0.65rem 1.3rem;
        border: 1px solid #4f8cff;
        border-radius: 0.7rem;

        color: #ffffffff;
        background: rgba(140, 0, 255, 1);
        text-decoration: none;
        font-size: 0.9rem;
        font-weight: 600;

        transition:
          transform 0.16s ease,
          background 0.16s ease,
          box-shadow 0.16s ease;
      }
      .tertiary-action:hover {
        transform: translateY(-1px);
        background: rgba(140, 0, 255, 1);
        box-shadow: 0 12px 28px -16px rgba(122, 97, 255, 0.85);
      }
      .preview {
        border: 1px solid rgba(255, 255, 255, 0.1);
        border-radius: 1rem;
        overflow: hidden;
        background: rgba(255, 255, 255, 0.04);
        box-shadow: 0 30px 80px -42px rgba(0, 0, 0, 0.85);
      }
      .preview iframe {
        display: block;
        width: 100%;
        /* Match one Letter page's proportions (8.5 x 11) so the iframe is as
           tall as the rendered page instead of a fixed 80vh window that cuts
           the resume off and forces a cramped nested scroll. */
        aspect-ratio: 8.5 / 11;
        height: auto;
        border: 0;
      }
      .fallback a {
        color: #b7a9ff;
        font-weight: 600;
      }
    `,
  ],
})
export class BuildResultPage implements OnInit {
  private readonly route = inject(ActivatedRoute);
  private readonly auth = inject(AuthService);
  private readonly resumeBuild = inject(ResumeBuildService);
  private readonly sanitizer = inject(DomSanitizer);

  readonly resumeId = signal<string | null>(null);
  readonly pdfURL = signal<string | null>(null);
  readonly safepdfURL = signal<SafeResourceUrl | null>(null);

  ngOnInit(): void {
    const resumeId = this.route.snapshot.paramMap.get('jobId');

    const userId = this.auth.user()?.id;

    if(!resumeId || !userId){
      return;
    }

    this.resumeId.set(resumeId);

    const url = this.resumeBuild.pdfUrl(userId, resumeId);

    this.pdfURL.set(url);
    this.safepdfURL.set(this.sanitizer.bypassSecurityTrustResourceUrl(url));
  }
}
